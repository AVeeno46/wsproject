import { useRef, useEffect, createContext, useContext } from 'react';

// 이미지 blob URL 맵(binId → objectURL)을 트리 전체에 전달
const ImageUrlsContext = createContext({});

// 이미지 블록 — HWPUNIT(÷75)로 px 환산, 페이지 폭 넘으면 자동 축소
function ImgBlock({ block }) {
  const imageUrls = useContext(ImageUrlsContext);
  const url = imageUrls?.[block.binId];
  if (!url) return null;
  const width = block.width ? `${Math.round(block.width / 75)}px` : undefined;
  return <img className="hwpxDocImg" src={url} alt="" style={{ width }} />;
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

// 단락 블록
function ParaBlock({ block, valueMap, onChange }) {
  if (block.segs.length === 0) return <p className="hwpxDocPara hwpxDocParaEmpty">&nbsp;</p>;
  const style = block.align ? { textAlign: block.align } : undefined;
  return (
    <p className="hwpxDocPara" style={style}>
      {block.segs.map((seg) => (
        <Seg key={seg.id} seg={seg} valueMap={valueMap} onChange={onChange} />
      ))}
    </p>
  );
}

// 셀/페이지 내부 블록 리스트 렌더 — 단락(p)·중첩 표(tbl)·이미지(img) 혼합
function BlockList({ blocks, valueMap, onChange }) {
  return (blocks ?? []).map((b, i) => {
    if (b.type === 'tbl') {
      return <TblBlock key={i} block={b} valueMap={valueMap} onChange={onChange} />;
    }
    if (b.type === 'img') {
      return <ImgBlock key={i} block={b} />;
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

// 셀에 텍스트가 하나라도 있는지 (중첩 표 포함)
function cellHasText(blocks, valueMap) {
  for (const b of blocks ?? []) {
    if (b.type === 'tbl') {
      if (b.rows.some((r) => r.cells.some((c) => cellHasText(c.blocks, valueMap)))) return true;
    } else if (b.segs?.some((s) => (valueMap.get(s.id) ?? s.text).trim() !== '')) {
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
  );
}

function PageBlocks({ blocks, valueMap, onSegmentChange }) {
  return blocks.map((block, i) => {
    if (block.type === 'tbl') {
      return <TblBlock key={i} block={block} valueMap={valueMap} onChange={onSegmentChange} />;
    }
    if (block.type === 'img') {
      return <ImgBlock key={i} block={block} />;
    }
    return <ParaBlock key={i} block={block} valueMap={valueMap} onChange={onSegmentChange} />;
  });
}

// 문서 전체 렌더러 — blocks 를 하나의 연속 문서로 렌더
export function HwpxDocView({ blocks, imageUrls, valueMap, onSegmentChange }) {
  return (
    <ImageUrlsContext.Provider value={imageUrls || {}}>
      <div className="hwpxDocPages">
        <div className="hwpxDocPage">
          <PageBlocks blocks={blocks} valueMap={valueMap} onSegmentChange={onSegmentChange} />
        </div>
      </div>
    </ImageUrlsContext.Provider>
  );
}
