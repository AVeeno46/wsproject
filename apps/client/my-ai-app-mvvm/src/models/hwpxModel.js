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
// extractTopLevel로 hp:tc 경계를 깊이 인식하며 찾는다 — 셀 안에 또 표가 있는
// 중첩 표에서는 비탐욕적 정규식(예전 방식)이 중첩된 셀의 닫는 태그에서 멈춰
// 버려 실제 셀 경계를 잘못 잡고, 그 결과 <hp:t>가 안 닫힌 채로 저장되어 한글이
// "손상된 파일"로 인식하는 문제가 있었다(실제 대형 문서로 검증: 중첩 표 셀
// 24개가 있는 문서에서 저장 후 hp:t 여는/닫는 태그 개수가 어긋남을 확인).
export const injectEmptyRuns = (xml) => {
  const tcs = extractTopLevel(xml, ['hp:tc']);
  if (tcs.length === 0) return xml;

  let out = '';
  let cursor = 0;
  for (const tc of tcs) {
    const start = xml.indexOf(tc.outer, cursor);
    out += xml.slice(cursor, start);
    if (/<hp:t>/.test(tc.outer)) {
      out += tc.outer; // 이미 텍스트 있음(중첩 표 포함) → 스킵
    } else {
      out += tc.outer.replace(/<(hp:run)([^/]*)\/>/g, '<$1$2><hp:t></hp:t></$1>');
    }
    cursor = start + tc.outer.length;
  }
  out += xml.slice(cursor);
  return out;
};

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
export const extractSegments = (xml, sectionIndex) => {
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

// 문서 원본 페이지 크기/여백 추출(<hp:secPr>의 <hp:pagePr>/<hp:margin>, HWPUNIT 단위).
// 보통 문서 첫 섹션의 첫 문단에 한 번만 정의됨. 못 찾으면 null(호출측이 기본값으로 대체).
const parsePageInfo = (xml) => {
  const secPrMatch = xml.match(/<hp:secPr\b[^>]*>[\s\S]*?<\/hp:secPr>/);
  if (!secPrMatch) return null;
  const secPr = secPrMatch[0];

  const pagePr = secPr.match(/<hp:pagePr\b([^>]*?)\/?>/);
  if (!pagePr) return null;
  const attrs = pagePr[1];
  const width = parseInt(attrs.match(/\bwidth="(\d+)"/)?.[1] || '0');
  const height = parseInt(attrs.match(/\bheight="(\d+)"/)?.[1] || '0');
  if (!width || !height) return null;

  const marginMatch = secPr.match(/<hp:margin\b([^>]*?)\/?>/);
  const marginAttrs = marginMatch?.[1] || '';
  const left = parseInt(marginAttrs.match(/\bleft="(\d+)"/)?.[1] || '0');
  const right = parseInt(marginAttrs.match(/\bright="(\d+)"/)?.[1] || '0');
  const top = parseInt(marginAttrs.match(/\btop="(\d+)"/)?.[1] || '0');
  const bottom = parseInt(marginAttrs.match(/\bbottom="(\d+)"/)?.[1] || '0');

  return { width, height, left, right, top, bottom };
};

// header.xml의 <hh:fontface> 정의에서 대표 폰트 하나만 추출(문서 전체에 적용).
// 런(run) 단위로 다른 폰트를 정확히 재현하려면 charPrMap에 fontRef까지 연결해야
// 하는데, 그건 별도 작업 범위라 여기서는 "문서 대표 폰트" 근사치만 사용한다.
const parseDefaultFont = (headerXml) => {
  return headerXml.match(/<hh:font\b[^>]*\bface="([^"]+)"/)?.[1] || null;
};

// .hwpx 열기. arrayBuffer(또는 Buffer) → { zip, sections, headerCharPrMap, headerParaPrMap, imageUrls, pageInfo, defaultFont }
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
  const headerParaPrMap = buildParaPrMap(headerXml);
  const imageUrls = await buildImageUrls(zip);
  const defaultFont = parseDefaultFont(headerXml);

  const names = Object.keys(zip.files)
    .filter((n) => SECTION_RE.test(n))
    .sort((a, b) => Number(a.match(/section(\d+)/)[1]) - Number(b.match(/section(\d+)/)[1]));

  const sections = [];
  let pageInfo = null;
  for (const name of names) {
    const sectionIndex = Number(name.match(/section(\d+)/)[1]);
    const rawXml = await zip.file(name).async('string');
    const xml = injectEmptyRuns(rawXml);
    if (!pageInfo) pageInfo = parsePageInfo(xml);
    sections.push({ name, sectionIndex, xml, segments: extractSegments(xml, sectionIndex) });
  }
  return { zip, sections, headerCharPrMap, headerParaPrMap, imageUrls, pageInfo, defaultFont };
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

// paraPr 정의를 읽어 Map<id, {align, lineSpacingType, lineSpacingValue, spaceBefore, spaceAfter}> 반환.
// header.xml: <hh:paraPr id="…">…</hh:paraPr> (실제 문서에서 문단 서식은 여기 참조로만
// 붙고 문단 자신에는 인라인 pPr이 없는 경우가 많음 — charPr과 같은 구조).
// hh:align/hh:lineSpacing/hh:margin이 hp:switch/hp:case·hp:default로 감싸여 있어도
// 값 자체는 케이스마다 동일해 첫 번째로 찾은 값만 쓰면 된다.
const buildParaPrMap = (xml) => {
  const map = new Map();
  const re = /<hh:paraPr\b([^>]*)>([\s\S]*?)<\/hh:paraPr>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1].match(/\bid="([^"]*)"/)?.[1];
    if (!id) continue;
    const inner = m[2];

    const alignVal = inner.match(/<hh:align\b[^>]*\bhorizontal="([^"]+)"/)?.[1] || null;
    let align = null;
    if (alignVal === 'CENTER') align = 'center';
    else if (alignVal === 'RIGHT') align = 'right';
    else if (alignVal === 'JUSTIFY') align = 'justify';

    const lsAttrs = inner.match(/<hh:lineSpacing\b([^>]*?)\/?>/)?.[1] || '';
    const lineSpacingType = lsAttrs.match(/\btype="([^"]+)"/)?.[1] || null;
    const lineSpacingValue = parseInt(lsAttrs.match(/\bvalue="(-?\d+)"/)?.[1] || '0');

    const marginBlock = inner.match(/<hh:margin\b[^>]*>[\s\S]*?<\/hh:margin>/)?.[0] || '';
    const spaceBefore = parseInt(marginBlock.match(/<hc:prev\b[^>]*\bvalue="(-?\d+)"/)?.[1] || '0');
    const spaceAfter = parseInt(marginBlock.match(/<hc:next\b[^>]*\bvalue="(-?\d+)"/)?.[1] || '0');

    map.set(id, { align, lineSpacingType, lineSpacingValue, spaceBefore, spaceAfter });
  }
  return map;
};

// hp:p 자신의 여는 태그에서 paraPrIDRef 추출 (charPrIDRef와 같은 참조 패턴)
const getParaPrId = (paraOuter) => {
  const headEnd = paraOuter.indexOf('>');
  if (headEnd === -1) return null;
  return paraOuter.slice(0, headEnd).match(/paraPrIDRef="([^"]*)"/)?.[1] ?? null;
};

// hp:p 자신에 인라인 <hp:pPr>가 있는 문서 대비용 폴백 — 실제로는 거의 안 쓰이지만
// 혹시 있으면 paraPrMap 참조보다 우선한다.
const getInlineParaAlign = (paraXml) => {
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

// 문단의 정렬/줄간격/앞뒤간격 — 인라인 pPr(있으면 우선) 또는 paraPrIDRef로
// header.xml의 paraPr 정의를 참조해 결정한다.
const getParaStyle = (paraOuter, paraPrMap) => {
  const refStyle = paraPrMap?.get(getParaPrId(paraOuter)) || null;
  const align = getInlineParaAlign(paraOuter) ?? refStyle?.align ?? null;
  const hasRefSpacing = refStyle && (refStyle.lineSpacingType || refStyle.spaceBefore || refStyle.spaceAfter);
  const spacing = hasRefSpacing
    ? {
        lineSpacingType: refStyle.lineSpacingType,
        lineSpacingValue: refStyle.lineSpacingValue,
        spaceBefore: refStyle.spaceBefore,
        spaceAfter: refStyle.spaceAfter,
      }
    : null;
  return { align, spacing };
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

// ─── 문단 내 개체(이미지·도형·표) 파싱 ─────────────────────────────
// 문단 안에서 자리를 차지하는 개체 태그들. parseBlocks가 문단을 이 태그 기준으로
// 쪼개 텍스트와 개체를 문서 등장 순서 그대로 처리한다(저장용 hp:t 순번 보존의 핵심).
const SHAPE_TAGS = [
  'hp:rect', 'hp:ellipse', 'hp:arc', 'hp:polygon', 'hp:curve', 'hp:line',
  'hp:connectLine', 'hp:textart', 'hp:ole', 'hp:equation', 'hp:container', 'hp:video',
];
const OBJECT_TAGS = ['hp:tbl', 'hp:pic', ...SHAPE_TAGS];

// 음수 오프셋이 부호(-) 없이 32비트 부호없는 정수의 2의 보수 표현 그대로
// 저장되는 경우가 있다(예: "4294967097" === 2^32 - 199, 즉 실제로는 -199).
// 2^31 이상이면 32비트 signed로 되돌린다.
const toSigned32 = (v) => (v >= 2 ** 31 ? v - 2 ** 32 : v);

// <hp:pos>에서 배치 정보 추출 — treatAsChar(글자처럼 취급)가 아니면 "떠있는" 개체.
// vertRelTo/horzRelTo: PARA(문단)|PAGE(쪽)|PAPER(종이)|COLUMN(단), offset은 HWPUNIT.
const parseObjPos = (outer) => {
  const pos = outer.match(/<hp:pos\b([^>]*?)\/?>/)?.[1] || '';
  const treatAsChar = /treatAsChar="1"/.test(pos);
  return {
    floating: pos !== '' && !treatAsChar,
    vertRelTo: pos.match(/vertRelTo="([^"]+)"/)?.[1] || 'PARA',
    horzRelTo: pos.match(/horzRelTo="([^"]+)"/)?.[1] || 'PARA',
    x: toSigned32(parseInt(pos.match(/horzOffset="(-?\d+)"/)?.[1] || '0')),
    y: toSigned32(parseInt(pos.match(/vertOffset="(-?\d+)"/)?.[1] || '0')),
  };
};

const parseObjSize = (outer) => {
  const sz = outer.match(/<hp:sz\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
  return { width: sz ? parseInt(sz[1]) : 0, height: sz ? parseInt(sz[2]) : 0 };
};

// hp:pic 한 개 → img 블록. 캡션 등 내부 텍스트도 반드시 이 위치(어휘 순서)에서
// 재귀 수집해야 저장용 hp:t 순번과 어긋나지 않는다.
const parsePicBlock = (obj, sectionIndex, state, charPrMap, paraPrMap) => ({
  type: 'img',
  binId: obj.outer.match(/binaryItemIDRef="([^"]+)"/)?.[1] || null,
  ...parseObjSize(obj.outer),
  ...parseObjPos(obj.outer),
  blocks: parseBlocks(obj.inner, sectionIndex, state, charPrMap, paraPrMap),
});

// 도형 한 개 → shape 블록. 글상자(drawText) 텍스트는 내부 블록으로 재귀 파싱해
// 그대로 편집 가능하게 유지한다(hp:t 순번 보존 필수).
const parseShapeBlock = (obj, sectionIndex, state, charPrMap, paraPrMap) => {
  const head = obj.outer.slice(0, obj.outer.indexOf('>'));
  const lineShape = obj.outer.match(/<hp:lineShape\b([^>]*)/)?.[1] || '';
  const fillColor = obj.outer.match(/<hc:winBrush\b[^>]*faceColor="([^"]+)"/)?.[1] || null;
  return {
    type: 'shape',
    kind: obj.tag.replace('hp:', ''),
    behindText: /textWrap="BEHIND_TEXT"/.test(head),
    lineColor: lineShape.match(/\bcolor="([^"]+)"/)?.[1] || null,
    lineWidth: parseInt(lineShape.match(/\bwidth="(\d+)"/)?.[1] || '0'),
    fillColor: fillColor && fillColor !== 'none' ? fillColor : null,
    ...parseObjSize(obj.outer),
    ...parseObjPos(obj.outer),
    blocks: parseBlocks(obj.inner, sectionIndex, state, charPrMap, paraPrMap),
  };
};

// 텍스트/개체(표·이미지·도형)가 섞인 한 구간(문단 또는 문단 없이 개체가 바로 있는
// 구간)을 파싱해 블록 하나로 만든다. hp:t 순번은 이 구간 안 등장 순서 그대로 부여.
const buildParaBlock = (unitXml, align, spacing, sectionIndex, state, charPrMap, paraPrMap) => {
  const objects = extractTopLevel(unitXml, OBJECT_TAGS);

  if (objects.length === 0) {
    return { type: 'p', align, spacing, segs: collectTFromXml(unitXml, sectionIndex, state, charPrMap) };
  }

  // 개체를 품은 구간 — 텍스트/개체가 섞인 혼합 블록(pmix)으로 유지해서,
  // 떠있는 개체의 위치 기준(앵커 좌상단)을 렌더 시 제공할 수 있게 한다.
  const parts = [];
  let pos = 0;
  for (const obj of objects) {
    const start = unitXml.indexOf(obj.outer, pos);
    const segs = collectTFromXml(unitXml.slice(pos, start), sectionIndex, state, charPrMap);
    if (segs.length) parts.push({ kind: 'segs', segs });

    if (obj.tag === 'hp:tbl') {
      parts.push({ kind: 'tbl', block: parseTblBlock(obj.outer, obj.inner, sectionIndex, state, charPrMap, paraPrMap) });
    } else if (obj.tag === 'hp:pic') {
      parts.push({ kind: 'img', block: parsePicBlock(obj, sectionIndex, state, charPrMap, paraPrMap) });
    } else {
      parts.push({ kind: 'shape', block: parseShapeBlock(obj, sectionIndex, state, charPrMap, paraPrMap) });
    }
    pos = start + obj.outer.length;
  }
  const tailSegs = collectTFromXml(unitXml.slice(pos), sectionIndex, state, charPrMap);
  if (tailSegs.length) parts.push({ kind: 'segs', segs: tailSegs });

  return { type: 'pmix', align, spacing, parts };
};

// 컨테이너(섹션·셀 subList·도형/그룹 내부) → 블록 리스트.
// 각 문단(hp:p)을 개체(표·이미지·도형) 기준으로 쪼개 등장 순서 그대로 처리한다.
// hp:t 순번(state.n)은 저장용 extractSegments와 동일한 어휘 순서로 부여된다.
//
// 그룹 도형(hp:container)의 멤버 도형은 <hp:p> 없이 바로 형제로 나열되는데
// (예: <hp:container>…<hp:rect>…</hp:rect>…</hp:container>), 문단 단위로만
// 훑으면 이 구간 전체가 통째로 스킵되어 그 안의 hp:t가 순번 계산에서 빠지고,
// 이후 모든 세그먼트 id가 저장용 extractSegments 순번과 어긋나 버린다
// (실제 대형 문서로 검증: 렌더 카운트가 저장용보다 적게 나오는 걸 확인함).
// 그래서 <hp:p>를 하나도 못 찾으면, 이 구간 전체를 문단 하나처럼 취급해
// 안에 있는 개체/텍스트를 그대로 처리해 순번이 밀리지 않게 한다.
const parseBlocks = (containerXml, sectionIndex, state, charPrMap, paraPrMap) => {
  const paras = extractTopLevel(containerXml, ['hp:p']);

  if (paras.length > 0) {
    return paras.map((para) => {
      const { align, spacing } = getParaStyle(para.outer, paraPrMap);
      return buildParaBlock(para.inner, align, spacing, sectionIndex, state, charPrMap, paraPrMap);
    });
  }

  const block = buildParaBlock(containerXml, null, null, sectionIndex, state, charPrMap, paraPrMap);
  const isEmpty = block.type === 'p' ? block.segs.length === 0 : block.parts.length === 0;
  return isEmpty ? [] : [block];
};

// hp:tbl 한 개 → tbl 블록.
// OWPML 의 cellAddr/cellSpan 을 그대로 신뢰한다(rowspan 으로 덮인 자리에는 셀이 없음).
// 셀 내용은 parseBlocks 로 재귀 파싱해 중첩 표·다단락을 보존한다.
const parseTblBlock = (tblOuter, tblInner, sectionIndex, state, charPrMap, paraPrMap) => {
  const colCnt = parseInt(tblOuter.match(/colCnt="(\d+)"/)?.[1] || '0');
  // 표 자체 너비(HWPUNIT) — ÷75 로 px 환산해 렌더에서 사용
  const tblWidth = parseInt(tblOuter.match(/<hp:tblSz\b[^>]*\bwidth="(\d+)"/)?.[1] || '0');
  const colW = new Array(colCnt).fill(0);
  const rows = [];
  const captionBlocks = [];

  // 캡션(hp:caption)도 hp:t를 가지므로, 순번 보존을 위해 행과 함께 어휘 순서대로 처리
  for (const el of extractTopLevel(tblInner, ['hp:tr', 'hp:caption'])) {
    if (el.tag === 'hp:caption') {
      captionBlocks.push(...parseBlocks(el.inner, sectionIndex, state, charPrMap, paraPrMap));
      continue;
    }
    const cells = [];
    for (const tc of extractTopLevel(el.inner, ['hp:tc'])) {
      const { content, meta } = splitTc(tc.inner);
      const { col, colspan, rowspan, width } = getTcInfo(meta);
      const blocks = parseBlocks(content, sectionIndex, state, charPrMap, paraPrMap);
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

  return { type: 'tbl', colCnt, colPcts, tblWidth, rows, captionBlocks };
};

// section XML 한 개 → 평탄한 블록 리스트 ({ blocks })
// 페이지 분할은 더 이상 추정하지 않는다 — 실제 렌더 높이를 측정하는 View 가 담당.
// 각 블록에는 명시적 페이지 브레이크 여부(pageBreak)만 표시해 둔다.
// OWPML 구조: hp:tbl 은 hp:p 의 자식으로 존재 (parseBlocks 가 재귀 처리)
// externalCharPrMap/externalParaPrMap: header.xml 에서 미리 만들어 온 Map (없으면 섹션 내부만 사용)
export const parseDocumentStructure = (xml, sectionIndex, externalCharPrMap, externalParaPrMap) => {
  const state = { n: 0 };
  // 섹션 내부 charPr + header charPr 합산 (섹션 값 우선)
  const localCharMap = buildCharPrMap(xml);
  const charPrMap = externalCharPrMap
    ? new Map([...externalCharPrMap, ...localCharMap])
    : localCharMap;
  const localParaMap = buildParaPrMap(xml);
  const paraPrMap = externalParaPrMap
    ? new Map([...externalParaPrMap, ...localParaMap])
    : localParaMap;

  const blocks = parseBlocks(xml, sectionIndex, state, charPrMap, paraPrMap);
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
    // createFolders: false — JSZip은 기본적으로 파일을 추가/수정할 때 상위 폴더
    // 엔트리(예: "Contents/")를 자동으로 만드는데, 원본 zip엔 그런 디렉터리
    // 엔트리가 없어서 이게 끼어들면 한글이 "손상된 파일"로 인식해 못 연다.
    zip.file(section.name, applyEdits(section.xml, section.segments, newTexts), { createFolders: false });
  }
  // mimetype 은 비압축(STORE)으로 유지 (OCF 규격 안전)
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE', createFolders: false });

  return zip.generateAsync({
    type: outputType,
    mimeType: 'application/hwp+zip',
    compression: 'DEFLATE',
  });
};
