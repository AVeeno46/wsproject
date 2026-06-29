import { useRef, useEffect, useCallback } from 'react';
import { useHwpxEditorViewModel } from '../../../viewmodels/hwpxEditorViewModel';
import { HwpxDocView } from './HwpxDocView';

export function HwpxEditor({ source }) {
  const {
    docBlocks, imageUrls, valueMap,
    fileName, isDirty, isSaving, error, isOpen,
    canUndo, open, close, setFieldText, undo, exportBlob,
  } = useHwpxEditorViewModel();
  const inputRef = useRef(null);

  // source가 바뀌면 에디터 리셋 후 자동 로드
  useEffect(() => {
    close();
    if (!source) return;

    const name = source.name || source.filename || '문서.hwpx';

    // 업로드 직후: 인메모리 File 객체가 있으면 바로 로드
    if (source.file instanceof File) {
      source.file.arrayBuffer().then((buf) => open(buf, name));
      return;
    }

    // 서버 모드: fileUrl이 있으면 fetch 후 로드
    if (source.fileUrl) {
      fetch(source.fileUrl)
        .then((r) => r.arrayBuffer())
        .then((buf) => open(buf, name))
        .catch(() => {});
    }

    // 둘 다 없으면 수동 선택 대기 (아래 UI에서 버튼 표시)
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = () => inputRef.current?.click();

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await open(buffer, file.name);
    e.target.value = '';
  };

  const handleSave = useCallback(async () => {
    const blob = await exportBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.hwpx$/i, '') + '_수정.hwpx';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportBlob, fileName]);

  // Ctrl+S: 저장(다운로드), Ctrl+Z: 되돌리기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, isSaving, canUndo, handleSave, undo]);

  const hiddenInput = (
    <input ref={inputRef} type="file" accept=".hwpx" hidden onChange={handlePick} />
  );

  if (!isOpen) {
    const sourceName = source?.name || source?.filename || '한글 문서';
    const needsManualPick = source && !(source.file instanceof File) && !source.fileUrl;

    return (
      <div className="docPreviewBox">
        <div className="docIcon">📝</div>
        <h2>{sourceName}</h2>
        {needsManualPick ? (
          <p>새로고침으로 파일 정보가 초기화되었습니다.<br />파일을 다시 선택해 주세요.</p>
        ) : (
          <p>파일을 불러오는 중입니다...</p>
        )}
        {error && <p className="hwpxError">{error}</p>}
        {needsManualPick && (
          <button type="button" className="hwpxOpenBtn" onClick={pickFile}>
            파일 다시 선택 (.hwpx)
          </button>
        )}
        {hiddenInput}
      </div>
    );
  }

  return (
    <div className="hwpxEditor">
      <div className="hwpxToolbar">
        <div className="hwpxToolbarLeft">
          <strong className="hwpxFileName" title={fileName}>{fileName}</strong>
          {isDirty && <span className="hwpxDirty">● 수정됨</span>}
        </div>
        <div className="hwpxToolbarRight">
          <button
            type="button"
            className="hwpxGhostBtn"
            onClick={undo}
            disabled={!canUndo}
            title="되돌리기 (Ctrl+Z)"
          >
            ↩ 되돌리기
          </button>
          <button type="button" className="hwpxGhostBtn" onClick={pickFile}>
            다른 파일
          </button>
          <button
            type="button"
            className="hwpxPrimaryBtn"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            title="저장 (Ctrl+S)"
          >
            {isSaving ? '저장 중…' : '저장 (.hwpx 내려받기)'}
          </button>
        </div>
        {hiddenInput}
      </div>

      {error && <p className="hwpxError">{error}</p>}

      <div className="hwpxDocScroll">
        <HwpxDocView
          blocks={docBlocks}
          imageUrls={imageUrls}
          valueMap={valueMap}
          onSegmentChange={setFieldText}
        />
      </div>
    </div>
  );
}
