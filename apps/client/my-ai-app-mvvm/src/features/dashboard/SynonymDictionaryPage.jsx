import { useMemo, useState } from "react";
import "../../styles/SynonymDictionaryPage.css";

export default function SynonymDictionaryPage({
  items,
  addItem,
  updateKeyword,
  updateSynonyms,
  deleteItem,
  save,
}) {
  const [dictionarySearchText, setDictionarySearchText] = useState("");
  const [editingDictionaryId, setEditingDictionaryId] = useState(null);

  const filteredDictionaryItems = useMemo(() => {
    const keyword = dictionarySearchText.trim().toLowerCase();

    if (!keyword) return items;

    return items.filter((item) => {
      return (
        item.keyword.toLowerCase().includes(keyword) ||
        item.synonyms.toLowerCase().includes(keyword)
      );
    });
  }, [items, dictionarySearchText]);

  const handleAddDictionaryItem = () => {
    const newId = addItem();
    setEditingDictionaryId(newId);
  };

  const handleDeleteDictionaryItem = (id) => {
    const targetItem = items.find((item) => item.id === id);

    const isConfirmed = window.confirm(
      `"${targetItem?.keyword || "선택한 단어"}"를 삭제하시겠습니까?`
    );

    if (!isConfirmed) return;

    deleteItem(id);

    if (editingDictionaryId === id) {
      setEditingDictionaryId(null);
    }
  };

  const handleSaveDictionary = () => {
    setEditingDictionaryId(null);
    save();
    alert("유사어 사전이 저장되었습니다.");
  };

  const handleDictionaryInputKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    setEditingDictionaryId(null);
    event.currentTarget.blur();
  };

  return (
    <section className="synonymDictionaryPage">
      <div className="synonymPageHeader">
        <div>
          <h1>유사어 사전 관리</h1>
          <p>
            검색어와 함께 인식할 유사어를 등록하고 수정할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="synonymSummaryGrid">
        <article>
          <span>등록된 원본 단어</span>
          <strong>{items.length}개</strong>
          <em>직접 등록한 대표 단어</em>
        </article>

        <article>
          <span>관리 방식</span>
          <strong>수동 등록</strong>
          <em>이 브라우저에만 저장(로컬)</em>
        </article>

        <article>
          <span>적용 위치</span>
          <strong>문서 검색(예정)</strong>
          <em>실제 검색 반영은 서버 연동 후 적용</em>
        </article>
      </div>

      <div className="synonymCard">
        <div className="synonymCardHeader">
          <div>
            <h2>동의어 목록</h2>
            <p>쉼표로 구분해서 여러 동의어를 입력할 수 있습니다.</p>
          </div>

          <div className="synonymHeaderActions">
            <input
              value={dictionarySearchText}
              onChange={(event) =>
                setDictionarySearchText(event.target.value)
              }
              placeholder="검색어를 입력하세요"
            />

            <button type="button" onClick={handleAddDictionaryItem}>
              + 단어 추가
            </button>
          </div>
        </div>

        <div className="synonymTable">
          <div className="synonymTableHead">
            <span>원본 단어</span>
            <span>동의어</span>
            <span>작업</span>
          </div>

          <div className="synonymTableBody">
            {filteredDictionaryItems.length === 0 ? (
              <div className="synonymEmptyRow">검색 결과가 없습니다.</div>
            ) : (
              filteredDictionaryItems.map((item) => {
                const isEditing = editingDictionaryId === item.id;

                return (
                  <div
                    className={`synonymTableRow ${
                      isEditing ? "editing" : ""
                    }`}
                    key={item.id}
                  >
                    <input
                      value={item.keyword}
                      onFocus={() => setEditingDictionaryId(item.id)}
                      onKeyDown={handleDictionaryInputKeyDown}
                      onChange={(event) =>
                        updateKeyword(item.id, event.target.value)
                      }
                      placeholder="원본 단어"
                    />

                    <input
                      value={item.synonyms}
                      onFocus={() => setEditingDictionaryId(item.id)}
                      onKeyDown={handleDictionaryInputKeyDown}
                      onChange={(event) =>
                        updateSynonyms(item.id, event.target.value)
                      }
                      placeholder="동의어를 쉼표로 구분해서 입력"
                    />

                    <div className="synonymRowActions">
                      <button
                        type="button"
                        className="synonymDoneBtn"
                        onClick={() => setEditingDictionaryId(null)}
                      >
                        완료
                      </button>

                      <button
                        type="button"
                        className="synonymDeleteBtn"
                        onClick={() => handleDeleteDictionaryItem(item.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="synonymFooter">
          <button
            type="button"
            className="synonymCancelBtn"
            onClick={() => setEditingDictionaryId(null)}
          >
            취소
          </button>

          <button
            type="button"
            className="synonymSaveBtn"
            onClick={handleSaveDictionary}
          >
            저장
          </button>
        </div>
      </div>
    </section>
  );
}
