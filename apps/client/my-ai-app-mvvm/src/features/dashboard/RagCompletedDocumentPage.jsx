import { useEffect, useMemo, useState } from "react";
import "../../styles/RagCompletedDocumentPage.css";

import excelIcon from "../../assets/excel.png";
import fileIcon from "../../assets/file.png";
import hwpIcon from "../../assets/hwp.png";
import pdfIcon from "../../assets/pdf.png";
import pptIcon from "../../assets/ppt.png";
import wordIcon from "../../assets/word.png";

const PAGE_SIZE = 5;

const getFileType = (source) => {
  if (source.type === "api") return "URL";

  const ext = String(source.name || "").split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
};

const formatSize = (size) => {
  if (!size) return "-";

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))}KB`;
};

const formatDate = (createdAt) => {
  if (!createdAt) return "-";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const getDocumentIcon = (fileType = "") => {
  const type = String(fileType).toLowerCase();

  if (type.includes("pdf")) return pdfIcon;
  if (type.includes("hwp") || type.includes("hwpx")) return hwpIcon;
  if (type.includes("doc") || type.includes("docx")) return wordIcon;
  if (type.includes("xls") || type.includes("xlsx") || type.includes("csv")) {
    return excelIcon;
  }
  if (type.includes("ppt") || type.includes("pptx")) return pptIcon;

  return fileIcon;
};

export default function RagCompletedDocumentPage({ sources = [], onRequestSummary }) {
  const [searchText, setSearchText] = useState("");
  const [businessFilter, setBusinessFilter] = useState("전체");
  const [topicFilter, setTopicFilter] = useState("전체");
  const [sortType, setSortType] = useState("latest");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailDocument, setDetailDocument] = useState(null);

  // "등록 완료"된 자료만 이 목록에 보인다 — status는 임베딩 처리 상태를 뜻한다
  // (자료 등록 페이지와 동일한 useSourceViewModel().sources를 그대로 재사용).
  const completedDocuments = useMemo(() => {
    return sources
      .filter((source) => source.status === "ready")
      .map((source) => ({
        id: source.id,
        title: source.name,
        description: source.description || "",
        fileType: getFileType(source),
        size: formatSize(source.size),
        business: source.business || "",
        topic: source.topic || "",
        date: formatDate(source.createdAt),
        createdAt: source.createdAt,
      }));
  }, [sources]);

  const businessOptions = useMemo(() => {
    return [
      "전체",
      ...new Set(completedDocuments.map((document) => document.business).filter(Boolean)),
    ];
  }, [completedDocuments]);

  const topicOptions = useMemo(() => {
    return [
      "전체",
      ...new Set(completedDocuments.map((document) => document.topic).filter(Boolean)),
    ];
  }, [completedDocuments]);

  const filteredDocuments = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    const nextDocuments = completedDocuments.filter((document) => {
      const searchableText = [
        document.title,
        document.description,
        document.fileType,
        document.business,
        document.topic,
      ]
        .join(" ")
        .toLowerCase();

      const keywordMatched = !keyword || searchableText.includes(keyword);

      const businessMatched =
        businessFilter === "전체" || document.business === businessFilter;

      const topicMatched =
        topicFilter === "전체" || document.topic === topicFilter;

      return keywordMatched && businessMatched && topicMatched;
    });

    return [...nextDocuments].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();

      if (sortType === "oldest") {
        return aTime - bTime;
      }

      return bTime - aTime;
    });
  }, [searchText, businessFilter, topicFilter, sortType, completedDocuments]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDocuments.length / PAGE_SIZE)
  );

  const paginatedDocuments = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredDocuments.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredDocuments, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, businessFilter, topicFilter, sortType]);

  const handleOpenDetail = (document) => {
    setDetailDocument(document);
  };

  const handleCloseDetail = () => {
    setDetailDocument(null);
  };

  const handleSummaryClick = (document) => {
    onRequestSummary?.(document);
  };

  const handleOpenDocument = () => {
    // 문서 뷰어(hwpx/pdf 열람)는 새 대시보드 디자인에 아직 넣을 자리가 없어
    // 보류 중 — 자리가 정해지면 DocWorkspace/DocViewer로 연결한다.
    alert("문서 뷰어는 아직 이 화면에 연결되지 않았습니다. 추후 연결 예정입니다.");
  };

  return (
    <section className="documentViewPage documentRagListPage">
      <div className="documentRagListCard">
        <div className="documentRagListHeader">
          <div className="documentRagListTitle">
            <h2>등록 완료 문서</h2>
            <span>{filteredDocuments.length}건</span>
          </div>

          <div className="documentRagListTools">
            <div className="documentRagSearchBox documentRagSearchBoxInCard">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="5.8" />
                <path d="M15 15l4.5 4.5" />
              </svg>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="문서명, 사업단, 주제, 키워드 검색"
              />
            </div>

            <div className="documentRagFilterRow documentRagFilterRowInCard">
              <select
                value={businessFilter}
                onChange={(event) => setBusinessFilter(event.target.value)}
              >
                {businessOptions.map((business) => (
                  <option key={business} value={business}>
                    {business === "전체" ? "사업단 전체" : business}
                  </option>
                ))}
              </select>

              <select
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value)}
              >
                {topicOptions.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic === "전체" ? "주제 전체" : topic}
                  </option>
                ))}
              </select>

              <select
                value={sortType}
                onChange={(event) => setSortType(event.target.value)}
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
              </select>
            </div>
          </div>
        </div>

        <div className="documentRagTable">
          <div className="documentRagTableHead">
            <span>자료 제목</span>
            <span>파일 형식</span>
            <span>사업단</span>
            <span>주제 분류</span>
            <span>등록일</span>
            <span>작업</span>
          </div>

          {filteredDocuments.length === 0 ? (
            <div className="documentRagEmpty">
              <strong>등록 완료된 문서가 없습니다.</strong>
              <p>자료 등록에서 파일을 올리면 완료되는 대로 여기에 표시됩니다.</p>
            </div>
          ) : (
            paginatedDocuments.map((document) => (
              <article className="documentRagTableRow" key={document.id}>
                <div className="documentRagTitleCell">
                  <div className="documentRagFileBadge documentRagFileImageBadge">
                    <img
                      src={getDocumentIcon(document.fileType)}
                      alt={`${document.fileType} 파일 아이콘`}
                    />
                  </div>

                  <div>
                    <strong>{document.title}</strong>
                    <p>{document.description}</p>
                  </div>
                </div>

                <div>
                  <span className="documentRagTypeBadge">{document.fileType}</span>
                </div>

                <div>
                  <span>{document.business || "-"}</span>
                </div>

                <div>
                  <span>{document.topic || "-"}</span>
                </div>

                <div>
                  <span>{document.date}</span>
                </div>

                <div className="documentRagTableActions">
                  <button type="button" onClick={() => handleOpenDetail(document)}>
                    세부정보
                  </button>

                  <button type="button" className="primary" onClick={handleOpenDocument}>
                    문서 열기
                  </button>
                </div>
              </article>
            ))
          )}

          {filteredDocuments.length > 0 && (
            <div className="documentRagPagination">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                이전
              </button>

              <div className="documentRagPageNumbers">
                {Array.from({ length: totalPages }, (_, index) => {
                  const pageNumber = index + 1;

                  return (
                    <button
                      type="button"
                      key={pageNumber}
                      className={currentPage === pageNumber ? "active" : ""}
                      onClick={() => setCurrentPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>

      {detailDocument && (
        <>
          <button
            type="button"
            className="documentDrawerBackdrop"
            onClick={handleCloseDetail}
            aria-label="파일 세부정보 닫기"
          />

          <aside className="documentDetailDrawer">
            <div className="documentDetailHeader">
              <h2>파일 세부정보</h2>

              <button type="button" onClick={handleCloseDetail}>
                ×
              </button>
            </div>

            <div className="documentDetailBody">
              <h3>{detailDocument.title}</h3>

              <dl className="documentInfoList">
                <div>
                  <dt>파일 형식</dt>
                  <dd>{detailDocument.fileType}</dd>
                </div>

                <div>
                  <dt>파일 크기</dt>
                  <dd>{detailDocument.size}</dd>
                </div>

                <div>
                  <dt>사업단</dt>
                  <dd>{detailDocument.business || "-"}</dd>
                </div>

                <div>
                  <dt>주제 분류</dt>
                  <dd>{detailDocument.topic || "-"}</dd>
                </div>

                <div>
                  <dt>등록일</dt>
                  <dd>{detailDocument.date}</dd>
                </div>
              </dl>

              <h4>빠른 작업</h4>

              <div className="documentQuickActions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    handleCloseDetail();
                    handleSummaryClick(detailDocument);
                  }}
                >
                  ✨ AI로 요약
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
