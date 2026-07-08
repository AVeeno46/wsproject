import { useState, useCallback, useMemo } from 'react';
import { openHwpx, saveHwpx, parseDocumentStructure } from '../models/hwpxModel';

// 중앙 작업공간의 .hwpx 텍스트 편집 상태를 담당하는 ViewModel.
// 열기(파싱) → 칸 수정 → 저장(수정본 blob 생성)까지의 상태/로직을 모음.
// 실제 XML 파싱·교체는 hwpxModel 이 담당하고, 여기선 React 상태만 다룬다.
export const useHwpxEditorViewModel = () => {
  const [doc, setDoc] = useState(null);          // { zip, sections } — hwpxModel 결과
  const [fields, setFields] = useState([]);      // [{ id, section, block, text }] (표시/편집용 평탄 목록)
  const [docBlocks, setDocBlocks] = useState([]); // 렌더링용 평탄 블록 리스트
  const [imageUrls, setImageUrls] = useState({}); // binId → blob objectURL
  const [fileName, setFileName] = useState('');
  const [pageInfo, setPageInfo] = useState(null);   // { width, height, left, right, top, bottom } (HWPUNIT) | null
  const [defaultFont, setDefaultFont] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [undoStack, setUndoStack] = useState([]); // [{ id, prevText }]

  // ArrayBuffer(또는 Buffer) 로 .hwpx 열기
  const open = useCallback(async (arrayBuffer, name) => {
    setError(null);
    try {
      const loaded = await openHwpx(arrayBuffer);
      setDoc(loaded);
      setFields(
        loaded.sections.flatMap((s) =>
          s.segments.map((seg) => ({
            id: seg.id,
            section: s.name,
            block: seg.block,
            text: seg.text,
          }))
        )
      );
      // 섹션별 블록을 하나의 평탄 리스트로 합쳐 연속 문서로 렌더
      const allBlocks = [];
      for (const s of loaded.sections) {
        const { blocks } = parseDocumentStructure(s.xml, s.sectionIndex, loaded.headerCharPrMap, loaded.headerParaPrMap);
        allBlocks.push(...blocks);
      }
      setDocBlocks(allBlocks);
      // 이전 문서의 blob URL 정리 후 교체
      setImageUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return loaded.imageUrls || {};
      });
      setFileName(name || '문서.hwpx');
      setPageInfo(loaded.pageInfo || null);
      setDefaultFont(loaded.defaultFont || null);
      setIsDirty(false);
      setUndoStack([]);
    } catch (err) {
      console.error('hwpx 파싱 실패:', err);
      setError('이 파일을 열 수 없습니다. (.hwpx 형식인지 확인해 주세요)');
    }
  }, []);

  // 칸 한 개 텍스트 수정 (되돌리기 스택에 이전값 기록)
  const setFieldText = useCallback((id, text) => {
    setFields((prev) => {
      const prevText = prev.find((f) => f.id === id)?.text ?? '';
      setUndoStack((s) => [...s, { id, prevText }]);
      return prev.map((f) => (f.id === id ? { ...f, text } : f));
    });
    setIsDirty(true);
  }, []);

  // 마지막 수정 한 단계 되돌리기
  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const { id, prevText } = prev[prev.length - 1];
      setFields((fields) => fields.map((f) => (f.id === id ? { ...f, text: prevText } : f)));
      return prev.slice(0, -1);
    });
  }, []);

  // 현재 수정값으로 .hwpx blob 생성 (로컬: 내려받기 / 추후: 서버 업로드)
  const exportBlob = useCallback(async () => {
    if (!doc) return null;
    setIsSaving(true);
    try {
      const editsBySection = {};
      for (const section of doc.sections) {
        editsBySection[section.name] = fields
          .filter((f) => f.section === section.name)
          .map((f) => f.text);
      }
      const blob = await saveHwpx(doc, editsBySection);
      setIsDirty(false);
      return blob;
    } catch (err) {
      console.error('hwpx 저장 실패:', err);
      setError('저장에 실패했습니다.');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [doc, fields]);

  const close = useCallback(() => {
    setDoc(null);
    setFields([]);
    setDocBlocks([]);
    setImageUrls((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
      return {};
    });
    setFileName('');
    setPageInfo(null);
    setDefaultFont(null);
    setIsDirty(false);
    setError(null);
    setUndoStack([]);
  }, []);

  // id → 현재 텍스트 빠른 조회용 맵
  const valueMap = useMemo(() => new Map(fields.map((f) => [f.id, f.text])), [fields]);

  return {
    doc,
    fields,
    docBlocks,
    imageUrls,
    valueMap,
    fileName,
    pageInfo,
    defaultFont,
    isDirty,
    isSaving,
    error,
    isOpen: Boolean(doc),
    canUndo: undoStack.length > 0,
    open,
    setFieldText,
    undo,
    exportBlob,
    close,
  };
};
