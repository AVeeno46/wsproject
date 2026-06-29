// [Model] .hwpx(한글 문서) 텍스트 편집 데이터 계층.
// .hwpx 는 zip + OWPML(XML) 구조라, 본문(Contents/sectionN.xml)의
// <hp:t> 텍스트 노드 "내용만" 교체하는 방식으로 서식을 100% 보존한 채 편집합니다.
// (표/이미지/스타일 XML 은 손대지 않음 → 한글에서 그대로 열림)
import JSZip from 'jszip';

const SECTION_RE = /^Contents\/section\d+\.xml$/; // 본문 파트(여러 개일 수 있음)
const HPT_RE = /<hp:t>([^<]*)<\/hp:t>/g;          // 자식 태그 없는 단순 텍스트 노드만 대상
const PARA_RE = /<hp:p[ >]/g;                      // 문단 경계(block 계산용)

// 표 셀 안의 빈 <hp:run/> → <hp:run><hp:t></hp:t></hp:run> 으로 전개
// hp:t 가 이미 있는 셀은 건드리지 않음 (텍스트 라벨 셀 보호)
const injectEmptyRuns = (xml) =>
  xml.replace(/<hp:tc[^>]*>[\s\S]*?<\/hp:tc>/g, (tcBlock) => {
    if (/<hp:t>/.test(tcBlock)) return tcBlock; // 이미 텍스트 있음 → 스킵
    return tcBlock.replace(/<(hp:run)([^/]*)\/>/g, '<$1$2><hp:t><\/hp:t><\/$1>');
  });

// XML 엔티티 ↔ 표시용 문자열 변환
const decodeEntities = (s) =>
  s.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const encodeEntities = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 한 section XML 에서 편집 가능한 텍스트 조각 목록 추출
// 각 조각: { id, start, end, raw, text, block }
//  - id    = "s{섹션번호}:{그 섹션 안 <hp:t> 등장순서}"  (계약서 규칙, 되저장·RAG 공통 주소)
//  - start/end = 원본 문자열에서의 위치(되저장용)
//  - block = 속한 문단(<hp:p>)의 0-base 순서 (RAG 묶음용)
const extractSegments = (xml, sectionIndex) => {
  // 문단 시작 위치 수집 → block 계산용
  const paraStarts = [];
  PARA_RE.lastIndex = 0;
  let pm;
  while ((pm = PARA_RE.exec(xml)) !== null) paraStarts.push(pm.index);

  const blockOf = (pos) => {
    let lo = 0;
    let hi = paraStarts.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (paraStarts[mid] <= pos) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  const segments = [];
  HPT_RE.lastIndex = 0;
  let m;
  let ordinal = 0;
  while ((m = HPT_RE.exec(xml)) !== null) {
    segments.push({
      id: `s${sectionIndex}:${ordinal}`,
      start: m.index,
      end: HPT_RE.lastIndex,
      raw: m[1],
      text: decodeEntities(m[1]),
      block: blockOf(m.index),
    });
    ordinal += 1;
  }
  return segments;
};

// 수정된 텍스트를 원본 XML 에 다시 끼워넣음.
// 뒤에서부터 splice 해서 앞쪽 조각의 위치(start/end)가 틀어지지 않게 함.
// 사용자가 바꾸지 않은 조각은 원본 bytes 그대로 둬서 안전성 보장.
const applyEdits = (xml, segments, newTexts) => {
  let out = xml;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    const next = newTexts[i];
    if (next === undefined || next === seg.text) continue; // 미수정 → 원본 유지
    out = out.slice(0, seg.start) + '<hp:t>' + encodeEntities(next) + '</hp:t>' + out.slice(seg.end);
  }
  return out;
};

// content.hpf 의 opf:item 매핑을 읽어 임베드 이미지를 blob URL 로 로드
// 반환: { binId(opf:item id) → objectURL }. close 시 revoke 책임은 호출측에.
const buildImageUrls = async (zip) => {
  const urls = {};
  const hpf = await zip.file('Contents/content.hpf')?.async('string');
  if (!hpf) return urls;

  const re = /<opf:item\b([^>]*)\/>/g;
  let m;
  const tasks = [];
  while ((m = re.exec(hpf)) !== null) {
    const attrs = m[1];
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const href = attrs.match(/\bhref="([^"]+)"/)?.[1];
    const type = attrs.match(/media-type="([^"]+)"/)?.[1] || '';
    if (!id || !href || !type.startsWith('image/')) continue;
    const file = zip.file(href);
    if (!file) continue;
    tasks.push(
      file.async('blob').then((blob) => {
        urls[id] = URL.createObjectURL(blob);
      })
    );
  }
  await Promise.all(tasks);
  return urls;
};

// .hwpx 열기. arrayBuffer(또는 Buffer) → { zip, sections, headerCharPrMap, imageUrls }
// sections: [{ name, sectionIndex, xml, segments }]
export const openHwpx = async (arrayBuffer) => {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // header.xml 에서 charPr/paraPr 정의 로드 (스타일 참조 테이블)
  let headerXml = '';
  const headerFile = zip.file('Contents/header.xml');
  if (headerFile) {
    headerXml = await headerFile.async('string');
  }
  const headerCharPrMap = buildCharPrMap(headerXml);
  const imageUrls = await buildImageUrls(zip);

  const names = Object.keys(zip.files)
    .filter((n) => SECTION_RE.test(n))
    .sort((a, b) => Number(a.match(/section(\d+)/)[1]) - Number(b.match(/section(\d+)/)[1]));

  const sections = [];
  for (const name of names) {
    const sectionIndex = Number(name.match(/section(\d+)/)[1]);
    const rawXml = await zip.file(name).async('string');
    const xml = injectEmptyRuns(rawXml);
    sections.push({ name, sectionIndex, xml, segments: extractSegments(xml, sectionIndex) });
  }
  return { zip, sections, headerCharPrMap, imageUrls };
};

// ─── 문서 구조 파서 (OWPML → 렌더링용 블록 트리, 순수 regex) ──────────────────
// DOMParser 의 네임스페이스 처리 문제를 피하기 위해 regex 방식으로 구현.
// hp:t 의 순서(ordinal)는 extractSegments 와 동일 규칙으로 유지한다.

// xml 문자열에서 tagName 의 최상위 블록을 순서대로 추출 (중첩 허용)
// 한 블록을 찾으면 그 블록의 끝으로 점프하므로 내부의 같은 태그는 자동으로 건너뛴다.
const extractTopLevel = (xml, tagNames) => {
  const openRe = new RegExp(`<(${tagNames.join('|')})(\\s[^>]*)?>`, 'g');
  const results = [];
  let m;

  while ((m = openRe.exec(xml)) !== null) {
    const tag = m[1];
    const contentStart = m.index + m[0].length;
    // 여는 태그 이후부터 같은 태그의 중첩을 세며 대응 닫는 태그를 찾는다
    const innerRe = new RegExp(`<${tag}(\\s[^>]*)?>|<\\/${tag}>`, 'g');
    innerRe.lastIndex = contentStart;
    let depth = 1;
    let im;
    while ((im = innerRe.exec(xml)) !== null) {
      if (im[0].startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          const outerEnd = im.index + im[0].length;
          results.push({
            tag,
            outer: xml.slice(m.index, outerEnd),
            inner: xml.slice(contentStart, im.index),
          });
          openRe.lastIndex = outerEnd;
          break;
        }
      } else {
        depth += 1;
      }
    }
  }
  return results;
};

// ─── 스타일 파서 (1단계: 정렬·볼드·이탤릭·페이지브레이크) ───────────────────

// charPr 정의를 읽어 Map<id, {bold,italic,fontSize,color}> 반환
// header.xml: <hh:charPr>, section XML: <hp:charPr> 둘 다 처리
const buildCharPrMap = (xml) => {
  const map = new Map();
  const re = /<(?:hp|hh):charPr\b([^>]*)>([\s\S]*?)<\/(?:hp|hh):charPr>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const id = attrs.match(/id="([^"]*)"/)?.[1];
    if (!id) continue;

    // 볼드/이탤릭 — 속성 또는 자식 태그
    const bold = /\bbold="1"/.test(attrs) || /\bbold="true"/.test(attrs)
      || /<(?:hp|hh):bold\b/.test(inner);
    const italic = /\bitalic="1"/.test(attrs) || /\bitalic="true"/.test(attrs)
      || /<(?:hp|hh):italic\b/.test(inner);

    // 글자 크기: height="1000" → 10pt (1/100 pt 단위)
    const h = parseInt(attrs.match(/height="(\d+)"/)?.[1] || '0');
    const fontSize = h > 0 ? `${(h / 100).toFixed(1)}pt` : null;

    // 글자색: textColor="#RRGGBB" — 검정(#000000)·none은 기본값이므로 스킵
    const rawColor = attrs.match(/textColor="([^"]+)"/)?.[1] ?? null;
    const color = rawColor && rawColor !== 'none' && rawColor.toLowerCase() !== '#000000'
      ? rawColor : null;

    map.set(id, { bold, italic, fontSize, color });
  }
  return map;
};

// hp:t 가 등장하는 위치 pos 기준으로 역방향 스캔 → 부모 hp:run 의 charPrIDRef 반환
const getRunCharPrId = (xml, pos) => {
  const runIdx = xml.lastIndexOf('<hp:run', pos);
  if (runIdx === -1) return null;
  const tagEnd = xml.indexOf('>', runIdx);
  if (tagEnd === -1) return null;
  return xml.slice(runIdx, tagEnd + 1).match(/charPrIDRef="([^"]*)"/)?.[1] ?? null;
};

// hp:p 의 XML 에서 단락 정렬 추출 (center | right | justify | null)
const getParaAlign = (paraXml) => {
  const pPrEnd = paraXml.indexOf('</hp:pPr>');
  if (pPrEnd === -1) return null;
  const pPr = paraXml.slice(0, pPrEnd + '</hp:pPr>'.length);
  const val = pPr.match(/(?:val|align)="(center|right|left|justify|both)"/)?.[1]
    || pPr.match(/<hp:jc\b[^>]*val="([^"]+)"/)?.[1];
  if (!val) return null;
  if (val === 'center') return 'center';
  if (val === 'right') return 'right';
  if (val === 'justify' || val === 'both') return 'justify';
  return null;
};

// xml 조각에서 hp:t 텍스트 모두 수집 + ordinal 증가
// charPrMap 이 있으면 볼드/이탤릭도 함께 기록
const collectTFromXml = (xml, sIdx, state, charPrMap) => {
  const segs = [];
  HPT_RE.lastIndex = 0;
  let m;
  while ((m = HPT_RE.exec(xml)) !== null) {
    const charPrId = charPrMap ? getRunCharPrId(xml, m.index) : null;
    const style = charPrId ? charPrMap.get(charPrId) : null;
    segs.push({
      id: `s${sIdx}:${state.n}`,
      text: decodeEntities(m[1]),
      bold: style?.bold ?? false,
      italic: style?.italic ?? false,
      fontSize: style?.fontSize ?? null,
      color: style?.color ?? null,
    });
    state.n += 1;
  }
  return segs;
};

// hp:tc 메타 파싱 — cellAddr/cellSpan/cellSz 는 셀 내용(subList) "뒤"에 위치하므로
// 중첩 표의 메타를 잘못 읽지 않도록 subList 뒤쪽(meta) 영역에서만 추출한다.
const splitTc = (tcInner) => {
  const subLists = extractTopLevel(tcInner, ['hp:subList']);
  if (subLists.length) {
    const sl = subLists[0];
    const endIdx = tcInner.indexOf(sl.outer) + sl.outer.length;
    return { content: sl.inner, meta: tcInner.slice(endIdx) };
  }
  return { content: tcInner, meta: tcInner };
};

const getTcInfo = (meta) => ({
  col: parseInt(meta.match(/<hp:cellAddr\b[^>]*\bcolAddr="(\d+)"/)?.[1] || '0'),
  colspan: parseInt(meta.match(/<hp:cellSpan\b[^>]*\bcolSpan="(\d+)"/)?.[1] || '1'),
  rowspan: parseInt(meta.match(/<hp:cellSpan\b[^>]*\browSpan="(\d+)"/)?.[1] || '1'),
  width: parseInt(meta.match(/<hp:cellSz\b[^>]*\bwidth="(\d+)"/)?.[1] || '0'),
});

// xml 조각에서 hp:pic(이미지) 추출 → [{ binId, width, height }]
// binId 는 content.hpf 의 opf:item id, width/height 는 HWPUNIT(표시 크기)
const extractImages = (xml) => {
  const imgs = [];
  for (const pic of extractTopLevel(xml, ['hp:pic'])) {
    const binId = pic.outer.match(/binaryItemIDRef="([^"]+)"/)?.[1];
    if (!binId) continue;
    const sz = pic.outer.match(/<hp:sz\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
    imgs.push({
      binId,
      width: sz ? parseInt(sz[1]) : 0,
      height: sz ? parseInt(sz[2]) : 0,
    });
  }
  return imgs;
};

// 컨테이너(섹션 또는 셀 subList) → 블록 리스트.
// hp:p 를 순회하며, 표를 포함한 단락은 표 블록(재귀), 그 외엔 텍스트 단락으로.
// hp:t 등장 순서를 그대로 따라 state.n(저장용 ordinal)을 일관되게 부여한다.
const parseBlocks = (containerXml, sectionIndex, state, charPrMap) => {
  const blocks = [];
  for (const para of extractTopLevel(containerXml, ['hp:p'])) {
    if (/<hp:tbl[\s>]/.test(para.inner)) {
      // 표를 담은 단락 — 표 앞/뒤 텍스트도 등장 순서대로 처리해야
      // hp:t ordinal 이 저장용(extractSegments)과 정확히 일치한다.
      const align = getParaAlign(para.outer);
      let pos = 0;
      for (const tbl of extractTopLevel(para.inner, ['hp:tbl'])) {
        const start = para.inner.indexOf(tbl.outer, pos);
        const chunk = para.inner.slice(pos, start);
        const beforeSegs = collectTFromXml(chunk, sectionIndex, state, charPrMap);
        if (beforeSegs.length) blocks.push({ type: 'p', align, segs: beforeSegs });
        for (const img of extractImages(chunk)) blocks.push({ type: 'img', ...img });
        blocks.push(parseTblBlock(tbl.outer, tbl.inner, sectionIndex, state, charPrMap));
        pos = start + tbl.outer.length;
      }
      const afterChunk = para.inner.slice(pos);
      const afterSegs = collectTFromXml(afterChunk, sectionIndex, state, charPrMap);
      if (afterSegs.length) blocks.push({ type: 'p', align, segs: afterSegs });
      for (const img of extractImages(afterChunk)) blocks.push({ type: 'img', ...img });
    } else {
      const segs = collectTFromXml(para.outer, sectionIndex, state, charPrMap);
      const images = extractImages(para.inner);
      // 텍스트가 있거나 이미지조차 없는 단락은 텍스트 블록으로 (빈 단락 = 줄바꿈)
      if (segs.length || !images.length) {
        blocks.push({ type: 'p', align: getParaAlign(para.outer), segs });
      }
      for (const img of images) blocks.push({ type: 'img', ...img });
    }
  }
  return blocks;
};

// hp:tbl 한 개 → tbl 블록.
// OWPML 의 cellAddr/cellSpan 을 그대로 신뢰한다(rowspan 으로 덮인 자리에는 셀이 없음).
// 셀 내용은 parseBlocks 로 재귀 파싱해 중첩 표·다단락을 보존한다.
const parseTblBlock = (tblOuter, tblInner, sectionIndex, state, charPrMap) => {
  const colCnt = parseInt(tblOuter.match(/colCnt="(\d+)"/)?.[1] || '0');
  const colW = new Array(colCnt).fill(0);
  const rows = [];

  for (const tr of extractTopLevel(tblInner, ['hp:tr'])) {
    const cells = [];
    for (const tc of extractTopLevel(tr.inner, ['hp:tc'])) {
      const { content, meta } = splitTc(tc.inner);
      const { col, colspan, rowspan, width } = getTcInfo(meta);
      const blocks = parseBlocks(content, sectionIndex, state, charPrMap);
      cells.push({ col, colspan, rowspan, blocks });
      // 단일 열 셀에서만 정확한 열 너비 확정
      if (colspan === 1 && col >= 0 && col < colCnt && colW[col] === 0 && width > 0) {
        colW[col] = width;
      }
    }
    rows.push({ cells });
  }

  // 너비 미확정 열은 확정 열 평균으로 보정 → colgroup 비율 계산
  let colPcts = [];
  if (colCnt > 0 && colW.some((w) => w > 0)) {
    const known = colW.filter((w) => w > 0);
    const avg = known.reduce((a, b) => a + b, 0) / known.length;
    const filled = colW.map((w) => (w > 0 ? w : avg));
    const total = filled.reduce((a, b) => a + b, 0) || 1;
    colPcts = filled.map((w) => ((w / total) * 100).toFixed(2) + '%');
  }

  return { type: 'tbl', colCnt, colPcts, rows };
};

// section XML 한 개 → 평탄한 블록 리스트 ({ blocks })
// 페이지 분할은 더 이상 추정하지 않는다 — 실제 렌더 높이를 측정하는 View 가 담당.
// 각 블록에는 명시적 페이지 브레이크 여부(pageBreak)만 표시해 둔다.
// OWPML 구조: hp:tbl 은 hp:p 의 자식으로 존재 (parseBlocks 가 재귀 처리)
// externalCharPrMap: header.xml 에서 미리 만들어 온 Map (없으면 섹션 내부만 사용)
export const parseDocumentStructure = (xml, sectionIndex, externalCharPrMap) => {
  const state = { n: 0 };
  // 섹션 내부 charPr + header charPr 합산 (섹션 값 우선)
  const localMap = buildCharPrMap(xml);
  const charPrMap = externalCharPrMap
    ? new Map([...externalCharPrMap, ...localMap])
    : localMap;

  const blocks = parseBlocks(xml, sectionIndex, state, charPrMap);
  return { blocks };
};

// 인제스트용: 서버→RAG 로 넘길 segment 목록 [{ id, text, block }] 추출 (계약서 ①단계)
export const extractIngestSegments = ({ sections }) =>
  sections.flatMap((s) => s.segments.map(({ id, text, block }) => ({ id, text, block })));

// 수정본 저장. editsBySection: { 'Contents/section0.xml': [text0, text1, ...] }
// outputType: 브라우저는 'blob'(기본), Node 테스트는 'nodebuffer'
export const saveHwpx = async ({ zip, sections }, editsBySection, outputType = 'blob') => {
  for (const section of sections) {
    const newTexts = editsBySection[section.name];
    if (!newTexts) continue;
    zip.file(section.name, applyEdits(section.xml, section.segments, newTexts));
  }
  // mimetype 은 비압축(STORE)으로 유지 (OCF 규격 안전)
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });

  return zip.generateAsync({
    type: outputType,
    mimeType: 'application/hwp+zip',
    compression: 'DEFLATE',
  });
};
