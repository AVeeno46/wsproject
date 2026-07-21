import { useRef, useEffect, createContext, useContext } from 'react';

// 이미지 blob URL 맵(binId → objectURL)을 트리 전체에 전달
const ImageUrlsContext = createContext({});

// HWPUNIT(1/7200인치) → px 숫자, 96dpi 기준(= ÷75)
const toPx = (v) => Math.round(v / 75);

// 실제 모양을 그릴 수 있는 도형 종류 — 그 외(그룹·다각형·글맵시·OLE 등)는
// 위치 근사치가 부정확해 렌더하면 본문 위에 지저분하게 겹쳐 보이므로 렌더하지 않는다.
const DRAWABLE_SHAPE_KINDS = new Set(['rect', 'ellipse', 'line', 'connectLine']);

// 개체 배치 래퍼 — 글자처럼 취급(treatAsChar)이면 글줄 안에(inline-block),
// 떠있는 개체면 앵커 문단 좌상단 기준 절대좌표(hp:pos offset)로 배치한다.
// vertRelTo/horzRelTo가 PAGE(쪽)인 경우도 페이지 분할이 없어 실제 쪽 좌표를 알 수
// 없으므로, 여백을 보정하려 하지 않고 앵커 문단 기준 오프셋으로 그대로 근사한다.
// (섣부른 여백 보정은 앵커 문단이 페이지 상단이 아닐 때 오히려 훨씬 크게 어긋난다.)
function ObjPositioner({ block, children }) {
  if (!block.floating) {
    return <div className="hwpxInlineObj">{children}</div>;
  }
  // 쪽/종이(PAGE·PAPER) 기준 개체는 페이지 분할이 없어 좌표를 신뢰할 수 없다 —
  // 페이지 전체 크기의 배경 이미지 등이 앵커 문단 기준으로 그대로 렌더되면, 문서
  // 전체를 하나로 이어붙인 화면에서 자기 앵커 지점부터 페이지 한 장 높이만큼
  // 아래로 뻗어나가며 전혀 관계없는 뒤쪽 내용을 덮어버린다(reservedHeight에서
  // 자리 예약을 안 하는 것과 같은 이유 — 실제 재현: 표지 배경 이미지가 목차/본문
  // 위에 겹쳐 보임). 위치를 신뢰할 수 없는 개체이므로 아예 렌더링하지 않는다.
  if (block.vertRelTo === 'PAGE' || block.vertRelTo === 'PAPER') {
    return null;
  }
  return (
    <div
      className={`hwpxFloatObj${block.behindText ? ' behind' : ''}`}
      style={{ left: `${toPx(block.x)}px`, top: `${toPx(block.y)}px` }}
    >
      {children}
    </div>
  );
}

// 이미지 블록 — 크기는 HWPUNIT(÷75) px 환산, 캡션이 있으면 이미지 아래에 렌더
function ImgBlock({ block, valueMap, onChange }) {
  const imageUrls = useContext(ImageUrlsContext);
  const url = block.binId ? imageUrls?.[block.binId] : null;
  const hasInner = block.blocks?.length > 0;
  if (!url && !hasInner) return null;
  const width = block.width ? `${toPx(block.width)}px` : undefined;
  return (
    <>
      {url && <img className="hwpxDocImg" src={url} alt="" style={{ width }} />}
      {hasInner && (
        <div className="hwpxPicCaption">
          <BlockList blocks={block.blocks} valueMap={valueMap} onChange={onChange} />
        </div>
      )}
    </>
  );
}

// 도형 블록 — 사각형/타원/선은 실제로 그리고, 그 외에는 자리표시 상자로 표시.
// 글상자(drawText) 텍스트는 내부 블록으로 렌더되어 그대로 편집 가능하다.
function ShapeBlock({ block, valueMap, onChange }) {
  const w = block.width ? toPx(block.width) : 0;
  const h = block.height ? toPx(block.height) : 0;
  const stroke = block.lineColor && block.lineColor !== 'none' ? block.lineColor : null;
  const strokeW = Math.max(1, toPx(block.lineWidth || 0));

  if (block.kind === 'line' || block.kind === 'connectLine') {
    // 시작/끝점 좌표는 파싱하지 않음 — 크기 상자의 대각선(수평선이면 수평)으로 근사
    const sw = Math.max(w, 1);
    const sh = Math.max(h, 1);
    return (
      <svg width={sw} height={sh} style={{ display: 'block', maxWidth: '100%' }}>
        <line x1="0" y1="0" x2={w} y2={h} stroke={stroke || '#333'} strokeWidth={strokeW} />
      </svg>
    );
  }

  if (block.kind === 'rect' || block.kind === 'ellipse') {
    const inner = block.blocks?.length > 0 ? (
      <BlockList blocks={block.blocks} valueMap={valueMap} onChange={onChange} />
    ) : null;
    return (
      <div
        className="hwpxShapeBox"
        style={{
          width: w || undefined,
          height: h || undefined,
          border: stroke ? `${strokeW}px solid ${stroke}` : '1px solid #333',
          background: block.fillColor || 'transparent',
          borderRadius: block.kind === 'ellipse' ? '50%' : undefined,
        }}
      >
        {inner}
      </div>
    );
  }

  // 그룹(container)·다각형·글맵시·OLE 등 실제 모양을 못 그리는 도형 —
  // 위치 근사치가 부정확해 렌더하면(내부에 텍스트가 있어도) 본문 위에 지저분하게
  // 겹쳐 보이므로 아예 렌더하지 않는다. 다만 내부의 hp:t는 파싱 단계(parseBlocks)
  // 에서는 항상 정상적으로 순번을 세고 있어야 저장 시 위치가 안 밀린다 — 안 보이는
  // 것과 안 세는 것은 다른 문제다(hwpxModel.js buildParaBlock 참고).
  return null;
}

// 단일 hp:t 세그먼트 — contentEditable 인라인 span
function Seg({ seg, valueMap, onChange }) {
  const ref = useRef(null);
  const value = valueMap.get(seg.id) ?? seg.text;
  const isEmpty = value.trim() === '';

  // 외부 value 변경 시 DOM 동기화 (포커스 중엔 건드리지 않음)
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  const handleBlur = (e) => {
    const next = e.currentTarget.textContent || '';
    if (next !== value) onChange(seg.id, next);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const style = {};
  if (seg.bold) style.fontWeight = 'bold';
  if (seg.italic) style.fontStyle = 'italic';
  if (seg.fontSize) style.fontSize = seg.fontSize;
  if (seg.color) style.color = seg.color;

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`hwpxSeg${isEmpty ? ' hwpxSegEmpty' : ''}`}
      style={Object.keys(style).length ? style : undefined}
    />
  );
}

// "31.0pt" 같은 폰트 크기 문자열 → px(96dpi 기준, 1pt = 4/3px)
const fontSizeToPx = (fontSizeStr) => {
  const pt = parseFloat(fontSizeStr);
  return pt ? pt * (96 / 72) : null;
};

// 문단 안 세그먼트 중 가장 큰 글자 크기(px) — 줄간격 %를 이 크기 기준으로 계산해야 한다.
const getDominantFontPx = (segs) => {
  let max = 0;
  for (const seg of segs ?? []) {
    if (!seg.fontSize) continue;
    const px = fontSizeToPx(seg.fontSize);
    if (px && px > max) max = px;
  }
  return max || null;
};

// 문단의 줄간격/앞뒤 간격을 CSS로 변환. 문서에 값이 없으면 빈 객체(기존 기본값 유지).
// dominantFontPx: 이 문단 안에서 가장 큰 글자 크기(px) — 줄간격 %는 문단 자신의
// 기본 글자 크기(예: 14px)가 아니라 실제로 보이는 글자 크기 기준으로 계산해야 한다.
// 안 그러면 제목처럼 큰 글자가 좁은 줄 상자 안에 눌려 다음 문단과 겹쳐 보인다.
const spacingStyle = (spacing, dominantFontPx) => {
  if (!spacing) return null;
  const style = {};
  if (spacing.spaceBefore) style.marginTop = `${toPx(spacing.spaceBefore)}px`;
  if (spacing.spaceAfter) style.marginBottom = `${toPx(spacing.spaceAfter)}px`;
  if (spacing.lineSpacingType === 'PERCENT' && spacing.lineSpacingValue) {
    const basePx = dominantFontPx || 14; // 기본 본문 글자 크기(px, hwpxDocPage 기본값)
    style.lineHeight = `${Math.round((basePx * spacing.lineSpacingValue) / 100)}px`;
  } else if (spacing.lineSpacingValue) {
    // FIXED 등 절대값(HWPUNIT) 줄간격 — px 고정 줄높이로 환산
    style.lineHeight = `${toPx(spacing.lineSpacingValue)}px`;
  }
  return Object.keys(style).length ? style : null;
};

// 단락 블록
function ParaBlock({ block, valueMap, onChange }) {
  // 빈 문단(줄바꿈용)도 줄간격/여백 스타일을 반드시 적용해야 한다 — 실제 문서에서
  // 문단 사이 간격은 spaceBefore/After보다 "빈 문단 여러 개 + 줄간격 %"로 표현되는
  // 경우가 많아서, 여기서 스타일을 빼먹으면 세로 여백이 대부분 사라져 보인다.
  if (block.segs.length === 0) {
    const emptyStyle = spacingStyle(block.spacing);
    return (
      <p className="hwpxDocPara hwpxDocParaEmpty" style={emptyStyle || undefined}>
        &nbsp;
      </p>
    );
  }
  const dominantFontPx = getDominantFontPx(block.segs);
  const style = {
    ...(block.align ? { textAlign: block.align } : null),
    ...spacingStyle(block.spacing, dominantFontPx),
  };
  return (
    <p className="hwpxDocPara" style={Object.keys(style).length ? style : undefined}>
      {block.segs.map((seg) => (
        <Seg key={seg.id} seg={seg} valueMap={valueMap} onChange={onChange} />
      ))}
    </p>
  );
}

// 떠있는(position:absolute) 개체는 문서 흐름에서 빠져 부모 문단의 높이에
// 기여하지 못한다. 방치하면 다음 문단이 이미지 자리 위로 그대로 올라와 겹치므로,
// 앵커 문단에 (세로offset + 높이)만큼 min-height를 줘서 자리를 예약해 둔다.
const reservedHeight = (parts) => {
  let max = 0;
  for (const part of parts) {
    if ((part.kind !== 'img' && part.kind !== 'shape') || !part.block.floating) continue;
    // 못 그리는 도형(그룹·다각형 등)은 ShapeBlock에서 내부 내용 유무와 무관하게
    // 항상 렌더를 안 하므로(순번 보존을 위해 내부는 파싱해도 화면엔 안 그림),
    // 여기서도 내용 유무를 보지 말고 "그려지는 종류인가"만 보고 예약 여부를 정해야
    // 한다 — 안 그러면 그룹 도형 내부에 텍스트가 있을 때만 빈 공간이 남는 것처럼
    // 보이는 불일치가 생긴다(실제 대형 문서로 검증: 그룹 105개 전부 내부 콘텐츠가
    // 있어서 전부 예약되고 있었음).
    if (part.kind === 'shape' && !DRAWABLE_SHAPE_KINDS.has(part.block.kind)) continue;
    // 쪽/종이(PAGE·PAPER) 기준 개체는 페이지 분할이 없어 좌표를 신뢰할 수 없다
    // (예: 표지 전면 배경사진이 PAPER 기준 0,0에 페이지 전체 높이로 앵커되면,
    // 문단 기준 근사치로는 그 문단 뒤에 페이지 하나 분량의 빈 공간이 그대로
    // 예약돼 스크롤 범위가 크게 부풀어 오른다). 이런 개체는 자리를 예약하지 않는다.
    if (part.block.vertRelTo === 'PAGE' || part.block.vertRelTo === 'PAPER') continue;
    const bottom = toPx(part.block.y) + toPx(part.block.height || 0);
    if (bottom > max) max = bottom;
  }
  return max;
};

// 텍스트와 개체(표·이미지·도형)가 섞인 혼합 문단.
// position:relative(hwpxParaMix) — 떠있는 개체(hwpxFloatObj)의 좌표 기준점.
// cell: 표 셀 내부에서 쓰일 때는 페이지 문단(hwpxDocPara) 대신 셀 문단(hwpxCellPara)
// 여백을 써야 다른 셀 텍스트와 간격이 어긋나지 않는다.
function PmixBlock({ block, valueMap, onChange, cell = false }) {
  const minH = reservedHeight(block.parts);
  const dominantFontPx = Math.max(
    0,
    ...block.parts
      .filter((part) => part.kind === 'segs')
      .map((part) => getDominantFontPx(part.segs) || 0)
  ) || null;
  const style = {
    ...(block.align ? { textAlign: block.align } : null),
    ...spacingStyle(block.spacing, dominantFontPx),
    ...(minH ? { minHeight: `${minH}px` } : null),
  };
  return (
    <div
      className={`${cell ? 'hwpxCellPara' : 'hwpxDocPara'} hwpxParaMix`}
      style={style}
    >
      {block.parts.map((part, i) => {
        if (part.kind === 'segs') {
          return part.segs.map((seg) => (
            <Seg key={seg.id} seg={seg} valueMap={valueMap} onChange={onChange} />
          ));
        }
        if (part.kind === 'tbl') {
          return <TblBlock key={i} block={part.block} valueMap={valueMap} onChange={onChange} />;
        }
        if (part.kind === 'img') {
          return (
            <ObjPositioner key={i} block={part.block}>
              <ImgBlock block={part.block} valueMap={valueMap} onChange={onChange} />
            </ObjPositioner>
          );
        }
        return (
          <ObjPositioner key={i} block={part.block}>
            <ShapeBlock block={part.block} valueMap={valueMap} onChange={onChange} />
          </ObjPositioner>
        );
      })}
    </div>
  );
}

// 셀/페이지 내부 블록 리스트 렌더 — 단락·혼합 단락·표·이미지·도형 혼합
function BlockList({ blocks, valueMap, onChange }) {
  return (blocks ?? []).map((b, i) => {
    if (b.type === 'tbl') {
      return <TblBlock key={i} block={b} valueMap={valueMap} onChange={onChange} />;
    }
    if (b.type === 'pmix') {
      return <PmixBlock key={i} block={b} valueMap={valueMap} onChange={onChange} cell />;
    }
    if (b.type === 'img') {
      return (
        <ObjPositioner key={i} block={b}>
          <ImgBlock block={b} valueMap={valueMap} onChange={onChange} />
        </ObjPositioner>
      );
    }
    if (b.type === 'shape') {
      return (
        <ObjPositioner key={i} block={b}>
          <ShapeBlock block={b} valueMap={valueMap} onChange={onChange} />
        </ObjPositioner>
      );
    }
    return (
      <div
        key={i}
        className="hwpxCellPara"
        style={b.align ? { textAlign: b.align } : undefined}
      >
        {b.segs.length === 0 ? (
          <span>&nbsp;</span>
        ) : (
          b.segs.map((seg) => (
            <Seg key={seg.id} seg={seg} valueMap={valueMap} onChange={onChange} />
          ))
        )}
      </div>
    );
  });
}

const segsHaveText = (segs, valueMap) =>
  (segs ?? []).some((s) => (valueMap.get(s.id) ?? s.text).trim() !== '');

const tblHasText = (tbl, valueMap) =>
  tbl.rows.some((r) => r.cells.some((c) => cellHasText(c.blocks, valueMap)))
  || cellHasText(tbl.captionBlocks, valueMap);

// 셀에 텍스트가 하나라도 있는지 (중첩 표·혼합 문단·개체 내부 글상자 포함)
function cellHasText(blocks, valueMap) {
  for (const b of blocks ?? []) {
    if (b.type === 'tbl') {
      if (tblHasText(b, valueMap)) return true;
    } else if (b.type === 'pmix') {
      for (const part of b.parts) {
        if (part.kind === 'segs' && segsHaveText(part.segs, valueMap)) return true;
        if (part.kind === 'tbl' && tblHasText(part.block, valueMap)) return true;
        if ((part.kind === 'img' || part.kind === 'shape') && cellHasText(part.block.blocks, valueMap)) return true;
      }
    } else if (b.type === 'img' || b.type === 'shape') {
      if (cellHasText(b.blocks, valueMap)) return true;
    } else if (segsHaveText(b.segs, valueMap)) {
      return true;
    }
  }
  return false;
}

// 표 블록 — cellAddr 기반이라 셀을 순서대로 출력하면 브라우저가 병합을 정렬
function TblBlock({ block, valueMap, onChange }) {
  const tblStyle = block.tblWidth > 0
    ? { width: `${Math.round(block.tblWidth / 75)}px`, maxWidth: '100%' }
    : { width: '100%' };
  return (
    <>
      <table className="hwpxDocTable" style={tblStyle}>
        {block.colPcts.length > 0 && (
          <colgroup>
            {block.colPcts.map((pct, i) => (
              <col key={i} style={{ width: pct }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.cells.map((cell, ci) => {
                const isEmpty = !cellHasText(cell.blocks, valueMap);
                return (
                  <td
                    key={ci}
                    colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                    rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                    className={`hwpxDocCell${isEmpty ? ' hwpxDocCellEmpty' : ''}`}
                  >
                    <BlockList blocks={cell.blocks} valueMap={valueMap} onChange={onChange} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {block.captionBlocks?.length > 0 && (
        <div className="hwpxTblCaption">
          <BlockList blocks={block.captionBlocks} valueMap={valueMap} onChange={onChange} />
        </div>
      )}
    </>
  );
}

function PageBlocks({ blocks, valueMap, onSegmentChange }) {
  return blocks.map((block, i) => {
    if (block.type === 'tbl') {
      return <TblBlock key={i} block={block} valueMap={valueMap} onChange={onSegmentChange} />;
    }
    if (block.type === 'pmix') {
      return <PmixBlock key={i} block={block} valueMap={valueMap} onChange={onSegmentChange} />;
    }
    if (block.type === 'img') {
      return (
        <ObjPositioner key={i} block={block}>
          <ImgBlock block={block} valueMap={valueMap} onChange={onSegmentChange} />
        </ObjPositioner>
      );
    }
    if (block.type === 'shape') {
      return (
        <ObjPositioner key={i} block={block}>
          <ShapeBlock block={block} valueMap={valueMap} onChange={onSegmentChange} />
        </ObjPositioner>
      );
    }
    return <ParaBlock key={i} block={block} valueMap={valueMap} onChange={onSegmentChange} />;
  });
}

// HWPUNIT(1/7200인치) → px 문자열, 96dpi 기준(= ÷75). 이미지/표 렌더와 동일한 환산.
const hwpunitToPx = (v) => `${Math.round(v / 75)}px`;

// 문서 전체 렌더러 — blocks 를 하나의 연속 문서로 렌더.
// (페이지 단위 분할은 근사치로 시도했으나 떠있는 개체 위치가 어긋나 보류함 — 지금은
// 예전처럼 이어진 하나의 문서로 렌더하고, 페이지 폭/여백/폰트만 원본 값을 반영한다.)
// scale: 확대/축소 배율 — transform:scale로 적용.
// pageInfo/defaultFont: 문서 원본의 실제 페이지 폭·여백·대표 폰트(있으면 CSS 기본값 대신 사용).
export function HwpxDocView({ blocks, imageUrls, valueMap, onSegmentChange, scale = 1, pageInfo, defaultFont }) {
  const pageStyle = {};
  if (scale !== 1) {
    pageStyle.transform = `scale(${scale})`;
    pageStyle.transformOrigin = 'top center';
  }
  if (pageInfo) {
    // 실제 문서 페이지 폭을 그대로 쓰지 않고 뷰어 폭에 맞춰 하나의 큰 페이지로
    // 채운다(width/max-width는 CSS 기본값 100% 유지) — 여백(padding)만 원본
    // 값을 반영해 페이지 안 내용 배치는 그대로 유지한다.
    pageStyle.paddingTop = hwpunitToPx(pageInfo.top);
    pageStyle.paddingBottom = hwpunitToPx(pageInfo.bottom);
    pageStyle.paddingLeft = hwpunitToPx(pageInfo.left);
    pageStyle.paddingRight = hwpunitToPx(pageInfo.right);
  }
  if (defaultFont) {
    pageStyle.fontFamily = `'${defaultFont}', 'Malgun Gothic', '맑은 고딕', sans-serif`;
  }

  return (
    <ImageUrlsContext.Provider value={imageUrls || {}}>
      <div className="hwpxDocPages">
        <div className="hwpxDocPage" style={pageStyle}>
          <PageBlocks blocks={blocks} valueMap={valueMap} onSegmentChange={onSegmentChange} />
        </div>
      </div>
    </ImageUrlsContext.Provider>
  );
}
