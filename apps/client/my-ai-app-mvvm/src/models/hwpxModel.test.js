import { describe, it, expect } from 'vitest';
import { extractSegments, parseDocumentStructure, injectEmptyRuns } from './hwpxModel';

// 회귀 방지 테스트 — 그룹 도형(hp:container) 멤버는 <hp:p> 없이 바로 형제로
// 나열되는데(<hp:container>…<hp:rect>…</hp:rect>…</hp:container>), 예전엔
// parseBlocks가 <hp:p> 단위로만 훑어서 이 구간의 hp:t가 순번 계산에서 통째로
// 스킵되고, 그 뒤로 모든 세그먼트 id가 저장용(extractSegments) 기준과 어긋나
// 편집 저장 시 텍스트가 엉뚱한 위치에 들어갈 수 있는 버그가 있었다(실제 대형
// 문서로 검증: section0 기준 렌더 1918개 vs 저장 1944개, 26개 누락).
const SECTION_XML = `
<hs:sec>
<hp:p><hp:run><hp:t>T0-plain</hp:t></hp:run></hp:p>
<hp:p>
  <hp:run><hp:t>T1-before-rect</hp:t></hp:run>
  <hp:run>
    <hp:rect id="1" textWrap="SQUARE">
      <hp:sz width="15000" height="7500"/>
      <hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="750" horzOffset="1500"/>
      <hp:lineShape color="#FF0000" width="26"/>
      <hp:fillBrush><hc:winBrush faceColor="#EEEEEE"/></hp:fillBrush>
      <hp:drawText><hp:subList>
        <hp:p><hp:run><hp:t>T2-in-rect</hp:t></hp:run></hp:p>
      </hp:subList></hp:drawText>
    </hp:rect>
  </hp:run>
  <hp:run><hp:t>T3-after-rect</hp:t></hp:run>
</hp:p>
<hp:p><hp:run>
  <hp:pic binaryItemIDRef="img1">
    <hp:sz width="7500" height="7500"/>
    <hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/>
    <hp:caption><hp:subList>
      <hp:p><hp:run><hp:t>T4-pic-caption</hp:t></hp:run></hp:p>
    </hp:subList></hp:caption>
  </hp:pic>
</hp:run></hp:p>
<hp:p><hp:run>
  <hp:tbl colCnt="1">
    <hp:caption><hp:subList>
      <hp:p><hp:run><hp:t>T5-tbl-caption</hp:t></hp:run></hp:p>
    </hp:subList></hp:caption>
    <hp:tr><hp:tc>
      <hp:subList><hp:p><hp:run><hp:t>T6-cell</hp:t></hp:run></hp:p></hp:subList>
      <hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="7500"/>
    </hp:tc></hp:tr>
  </hp:tbl>
</hp:run></hp:p>
<hp:p><hp:run>
  <hp:container id="1557044724" zOrder="512" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="483302901">
    <hp:offset x="0" y="0"/><hp:orgSz width="13734" height="1666"/><hp:curSz width="0" height="0"/>
    <hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="6867" centerY="833" rotateimage="1"/>
    <hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/>
    <hp:rect id="0" zOrder="0" numberingType="NONE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="1" instid="483302902" ratio="0">
      <hp:sz width="5000" height="1666"/>
      <hp:drawText><hp:subList>
        <hp:p><hp:run><hp:t>T7-group-member-rect</hp:t></hp:run></hp:p>
      </hp:subList></hp:drawText>
    </hp:rect>
  </hp:container>
</hp:run></hp:p>
<hp:p><hp:run><hp:t>T8-tail</hp:t></hp:run></hp:p>
</hs:sec>`;

// 블록 트리에서 모든 세그먼트를 { id, text } 형태로 평탄화 수집
function collectRenderedSegments(blocks) {
  const out = [];
  const collectTbl = (tbl) => {
    tbl.rows.forEach((r) => r.cells.forEach((c) => collect(c.blocks)));
    collect(tbl.captionBlocks);
  };
  const collect = (list) => {
    for (const b of list ?? []) {
      if (b.type === 'p') b.segs.forEach((s) => out.push({ id: s.id, text: s.text }));
      else if (b.type === 'tbl') collectTbl(b);
      else if (b.type === 'img' || b.type === 'shape') collect(b.blocks);
      else if (b.type === 'pmix') {
        for (const part of b.parts) {
          if (part.kind === 'segs') part.segs.forEach((s) => out.push({ id: s.id, text: s.text }));
          else if (part.kind === 'tbl') collectTbl(part.block);
          else collect(part.block.blocks);
        }
      }
    }
  };
  collect(blocks);
  return out;
}

describe('hwpxModel — 저장/렌더 세그먼트 순번 정합성', () => {
  it('그룹 도형(hp:container) 멤버처럼 <hp:p> 없이 있는 텍스트도 렌더 순번에 포함되어야 한다', () => {
    // 저장 기준(실제 extractSegments) — hp:t 전역 스캔, 등장 순서 그대로 ordinal 부여
    const saveSegments = extractSegments(SECTION_XML, 0).map(({ id, text }) => ({ id, text }));

    const { blocks } = parseDocumentStructure(SECTION_XML, 0);
    // 표는 캡션/셀을 별도 필드(captionBlocks/rows)로 나눠 들고 있어서, 이 테스트용
    // 수집기가 둘을 방문하는 순서가 실제 XML 등장 순서와 항상 같다는 보장은 없다
    // (표마다 캡션이 셀보다 먼저/나중에 올 수 있음). 그래서 배열 순서가 아니라
    // id(=진짜 등장 순번)로 정렬해 비교한다 — 순번 보존이라는 실제 불변식만 검증.
    const ordinalOf = (id) => parseInt(id.split(':')[1], 10);
    const renderSegments = collectRenderedSegments(blocks)
      .sort((a, b) => ordinalOf(a.id) - ordinalOf(b.id));

    // 개수만 같은 게 아니라 id별 텍스트까지 정확히 일치해야 한다
    // (개수만 맞고 순서가 밀려 우연히 같아지는 경우까지 잡아내기 위함)
    expect(renderSegments.length).toBe(saveSegments.length);
    expect(renderSegments).toEqual(saveSegments);

    // 어휘 등장 순서 그대로 나와야 한다는 것도 저장 기준(extractSegments)과
    // 대조해서 함께 확인 — 그룹 멤버 도형 텍스트(T7)가 순번에서 빠지지 않는지가 핵심.
    expect(renderSegments.map((s) => s.text)).toEqual(saveSegments.map((s) => s.text));
  });
});

// 회귀 방지 테스트 — 실제 파일 손상 버그(2건 중 1건)의 원인이었던 injectEmptyRuns의
// 셀 경계 탐지. 예전엔 비탐욕적 정규식(/<hp:tc[^>]*>[\s\S]*?<\/hp:tc>/g)을 써서
// 표 셀 안에 또 표(중첩 표)가 있으면 바깥 셀의 실제 닫는 태그가 아니라 중첩 셀의
// 첫 닫는 태그에서 매칭이 끝나버렸다(실제 대형 문서로 검증: 중첩 표 셀 24개가
// 있는 문서에서 저장 후 <hp:t> 여는/닫는 태그 개수가 2034/2033으로 어긋나
// 한글이 "손상된 파일"로 인식). extractTopLevel(깊이 인식 매칭)로 바꿔서 고침.
const NESTED_TABLE_XML = `
<hs:sec>
<hp:p><hp:run>
  <hp:tbl colCnt="2">
    <hp:tr>
      <hp:tc>
        <hp:subList>
          <hp:p><hp:run><hp:t>Outer-before</hp:t></hp:run></hp:p>
          <hp:p><hp:run>
            <hp:tbl colCnt="1">
              <hp:tr><hp:tc>
                <hp:subList><hp:p><hp:run><hp:t>Nested-cell-text</hp:t></hp:run></hp:p></hp:subList>
                <hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000"/>
              </hp:tc></hp:tr>
            </hp:tbl>
          </hp:run></hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000"/>
      </hp:tc>
      <hp:tc>
        <hp:subList><hp:p><hp:run/></hp:p></hp:subList>
        <hp:cellAddr colAddr="1" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000"/>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
</hp:run></hp:p>
</hs:sec>`;

describe('hwpxModel — injectEmptyRuns 중첩 표 셀 경계', () => {
  it('중첩 표가 있는 셀은 그대로 보존하고, 진짜 빈 셀에는 정확히 <hp:t>를 주입해야 한다', () => {
    const result = injectEmptyRuns(NESTED_TABLE_XML);

    // hp:t 여는/닫는 태그 개수가 반드시 일치해야 한다(실제 손상 버그의 핵심 증상).
    const openCount = (result.match(/<hp:t>/g) || []).length;
    const closeCount = (result.match(/<\/hp:t>/g) || []).length;
    expect(openCount).toBe(closeCount);

    // 바깥 셀(중첩 표 포함)의 텍스트는 잘리거나 중복되지 않고 정확히 1번씩 남아야 한다.
    expect(result.match(/Outer-before/g)?.length).toBe(1);
    expect(result.match(/Nested-cell-text/g)?.length).toBe(1);

    // 셀 개수(바깥 2개 + 중첩 1개 = 3개)가 그대로 유지되어야 한다 — 경계 오탐으로
    // 셀이 통째로 스킵되거나 중복 처리되지 않았는지 확인.
    expect((result.match(/<hp:tc[ >]/g) || []).length).toBe(3);

    // 진짜 빈 셀(두 번째 hp:tc)의 <hp:run/>은 <hp:run><hp:t></hp:t></hp:run>으로
    // 주입되어야 편집 가능한 세그먼트로 잡힌다.
    expect(result).toContain('<hp:run><hp:t></hp:t></hp:run>');

    // 저장 기준(extractSegments)으로도 세그먼트가 정확히 3개(바깥 전+중첩+주입된 빈칸)
    // 뽑히고, 순서와 내용이 예상대로여야 한다.
    const segments = extractSegments(result, 0);
    expect(segments.map((s) => s.text)).toEqual(['Outer-before', 'Nested-cell-text', '']);
  });
});
