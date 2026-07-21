import { useRef, useState } from "react";

import excelIcon from "../../assets/excel.png";
import fileIcon from "../../assets/file.png";
import hwpIcon from "../../assets/hwp.png";
import pdfIcon from "../../assets/pdf.png";
import pptIcon from "../../assets/ppt.png";
import wordIcon from "../../assets/word.png";

const businessUnits = [
  "AI융합대학원",
  "학생지원팀",
  "학사팀",
  "교육혁신원",
  "산학협력단",
  "시설관리팀",
  "도서관",
  "홍보팀",
];

const topicCategories = [
  "학사 안내",
  "학사일정",
  "장학금",
  "기숙사",
  "수강신청",
  "졸업요건",
  "시설/복지",
  "학생지원",
  "공지사항",
  "기타",
];

function FilePlusIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 56"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 3H30L40 13V53H8V3Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M30 3V14H40"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M24 24V40"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M16 32H32"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 실제 소스 status(processing/ready/failed) → 화면 표시용 한글 상태
const STATUS_LABELS = {
  processing: "등록 중",
  ready: "등록 완료",
  failed: "등록 오류",
};

export default function DashboardProcessingPage({
  pageMode = "file",
  sources = [],
  isUploading,
  uploadError,
  clearUploadError,
  registerFiles,
  registerExternalSource,
  onDeleteSource,
}) {
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);

  const registerType = pageMode === "api" ? "openapi" : "file";
  const [pendingFiles, setPendingFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [documentName, setDocumentName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("AI융합대학원");
  const [topic, setTopic] = useState("학사 안내");
  const [description, setDescription] = useState("");
  const [collectUrl, setCollectUrl] = useState("");

  const [selectedBusiness, setSelectedBusiness] = useState("전체");
  const [selectedTopic, setSelectedTopic] = useState("전체");

  const selectedFile = pendingFiles.find((item) => item.id === selectedFileId);

  const currentSourceType = registerType === "file" ? "file" : "api";

  const currentModeSources = sources.filter(
    (source) => source.type === currentSourceType
  );

  const processingSourcesOnly = currentModeSources.filter(
    (source) => source.status !== "ready"
  );

  const filteredSources = processingSourcesOnly.filter((source) => {
    const matchesBusiness =
      selectedBusiness === "전체" || source.business === selectedBusiness;

    const matchesTopic =
      selectedTopic === "전체" || source.topic === selectedTopic;

    return matchesBusiness && matchesTopic;
  });

  const doneCount = currentModeSources.filter((s) => s.status === "ready").length;
  const processingCount = currentModeSources.filter((s) => s.status === "processing").length;
  const errorCount = currentModeSources.filter((s) => s.status === "failed").length;
  // "등록 대기 중"은 실제 서버 상태값이 아니라, 아직 제출 전에 선택만 해 둔 파일 수.
  const waitingCount = registerType === "file" ? pendingFiles.length : 0;

  const makePendingFile = (file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    file,
    name: file.name,
    size: file.size,
    ext: file.name.split(".").pop()?.toUpperCase() || "FILE",
    title: file.name.replace(/\.[^/.]+$/, ""),
    business: "",
    topic: "",
    description: "",
  });

  const getPendingFileIcon = (extension = "") => {
    const normalizedExtension = extension.toLowerCase().replace(".", "");

    if (normalizedExtension === "pdf") return pdfIcon;
    if (["hwp", "hwpx"].includes(normalizedExtension)) return hwpIcon;
    if (["doc", "docx"].includes(normalizedExtension)) return wordIcon;
    if (["xls", "xlsx", "csv"].includes(normalizedExtension)) return excelIcon;
    if (["ppt", "pptx"].includes(normalizedExtension)) return pptIcon;

    return fileIcon;
  };

  const formatSize = (size) => {
    if (!size) return "0KB";

    if (size >= 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(1)}MB`;
    }

    return `${Math.max(1, Math.round(size / 1024))}KB`;
  };

  // 실제 서버가 %를 안 주므로(등록 진행률은 processing/ready/failed 3단계뿐)
  // 애니메이션 없이 완료 여부만 표시한다.
  const getSourceProgress = (source) => (source.status === "ready" ? 100 : 0);

  const getProgressClassName = (source) => {
    if (source.status === "failed") return "error";
    return "working";
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleSelectFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newFiles = files.map((file, index) => makePendingFile(file, index));
    setPendingFiles((prev) => [...prev, ...newFiles]);

    event.target.value = "";
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }

    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current -= 1;

    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const addPendingFiles = (files) => {
    if (files.length === 0) return;

    const newFiles = files.map((file, index) => makePendingFile(file, index));
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files || []);
    addPendingFiles(files);
  };

  const handleRemovePendingFile = (id) => {
    setPendingFiles((prev) => prev.filter((item) => item.id !== id));

    if (selectedFileId === id) {
      setSelectedFileId(null);
    }
  };

  const handleClearPendingFiles = () => {
    setPendingFiles([]);
    setSelectedFileId(null);
  };

  const handleChangePendingFile = (id, field, value) => {
    setPendingFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleCollectUrl = () => {
    if (!collectUrl.trim()) {
      alert("연결할 외부 자료 주소를 입력해 주세요.");
      return;
    }

    alert("외부 데이터 연결 대기 중입니다.");
  };

  const handleRegisterDocument = async () => {
    if (registerType === "file") {
      if (pendingFiles.length === 0) {
        alert("등록할 파일을 선택해 주세요.");
        return;
      }

      const hasEmptyInfo = pendingFiles.some(
        (item) =>
          !item.title.trim() ||
          !(item.business || businessUnit) ||
          !(item.topic || topic)
      );

      if (hasEmptyInfo) {
        alert("각 파일의 자료 제목, 사업단, 주제 분류를 확인해 주세요.");
        return;
      }

      const entries = pendingFiles.map((item) => ({
        file: item.file,
        business: item.business || businessUnit,
        topic: item.topic || topic,
        description: item.description || description,
      }));

      const registered = await registerFiles?.(entries);

      // 하나도 등록되지 않았으면(예: 대화 미선택) 선택 목록을 지우지 않고
      // uploadError 배너로 실패를 알린다 — 조용히 사라진 것처럼 보이지 않게 한다.
      if (registered?.length > 0) {
        setPendingFiles([]);
        setSelectedFileId(null);
      }
      return;
    }

    if (!documentName.trim()) {
      alert("자료 제목을 입력해 주세요.");
      return;
    }

    if (!businessUnit) {
      alert("사업단을 선택해 주세요.");
      return;
    }

    if (!topic) {
      alert("주제 분류를 선택해 주세요.");
      return;
    }

    if (!collectUrl.trim()) {
      alert("연결할 외부 자료 주소를 입력해 주세요.");
      return;
    }

    const registered = await registerExternalSource?.({
      url: collectUrl,
      title: documentName,
      business: businessUnit,
      topic,
      description,
    });

    if (registered) {
      setDocumentName("");
      setCollectUrl("");
      setDescription("");
    }
  };

  const handleDeleteSource = (id) => {
    const target = currentModeSources.find((source) => source.id === id);

    const isConfirmed = window.confirm(
      `"${target?.name || "선택한 문서"}"를 정말 삭제하시겠습니까?`
    );

    if (!isConfirmed) return;

    onDeleteSource?.(id);
  };

  return (
    <section className="processingPage resourcePage inlineProcessingPage">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="processingHiddenFileInput"
        onChange={handleSelectFiles}
      />

      <div className="inlineUploadCard">
        <div className="inlineUploadCardHeader">
          <h2>{registerType === "file" ? "파일 자료 등록" : "외부 자료 연결"}</h2>
        </div>

        {uploadError && (
          <div className="uploadErrorBanner">
            {uploadError}
            <button type="button" onClick={clearUploadError}>
              ✕
            </button>
          </div>
        )}

        {registerType === "file" ? (
          <div className={`inlineUploadBody ${selectedFile ? "hasFileEdit" : ""}`}>
            <div className="inlineUploadLeft">
              {pendingFiles.length > 0 && (
                <div className="inlineUploadListTop">
                  <span>선택된 파일 {pendingFiles.length}개</span>

                  <button
                    type="button"
                    className="inlineClearFilesBtn"
                    onClick={handleClearPendingFiles}
                  >
                    전체 삭제
                  </button>
                </div>
              )}
              <div
                className={`inlineFileDropArea ${
                  isDragging ? "dragging" : ""
                } ${pendingFiles.length > 0 ? "hasFiles" : "emptyFiles"}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {pendingFiles.length === 0 && (
                  <button
                    type="button"
                    className="inlineDropzone"
                    onClick={handleOpenFilePicker}
                  >
                    <div className="inlineDropIcon">
                      <FilePlusIcon className="inlineFilePlusIcon" />
                    </div>

                    <strong>파일을 여기에 놓아주세요</strong>
                    <p>
                      여러 문서를 한 번에 추가하고, 채팅에서 바로 처리할 수
                      있어요.
                    </p>
                  </button>
                )}

                {pendingFiles.length > 0 && isDragging && (
                  <div className="inlineDragOverlay" aria-hidden="true">
                    <div className="inlineDragPanel">
                      <div className="inlineDragIcon">
                        <FilePlusIcon className="inlineFilePlusIcon" />
                      </div>
                      <strong>여기에 드롭하세요</strong>
                      <p>놓으면 선택된 파일 목록에 추가됩니다.</p>
                    </div>
                  </div>
                )}

                {pendingFiles.length > 0 && (
                  <div className="inlineFileList">
                    {pendingFiles.map((item) => (
                      <div
                        className={`inlineFileItem ${
                          selectedFileId === item.id ? "selected" : ""
                        }`}
                        key={item.id}
                      >
                        <div className="inlineFileTop">
                          <div className="inlineFileMain">
                            <span className="inlineFileExt">
                              <img
                                src={getPendingFileIcon(item.ext)}
                                alt={`${item.ext} 파일 아이콘`}
                              />
                            </span>

                            <div>
                              <strong title={item.name}>{item.name}</strong>
                              <p>{formatSize(item.size)}</p>
                            </div>
                          </div>

                          <div className="inlineFileActions">
                            <span className="inlineFileStatus">등록 대기 중</span>

                            <button
                              type="button"
                              className={`inlineFileEditBtn ${
                                selectedFileId === item.id ? "active" : ""
                              }`}
                              onClick={() =>
                                setSelectedFileId(selectedFileId === item.id ? null : item.id)
                              }
                            >
                              개별설정
                            </button>

                            <button
                              type="button"
                              className="inlineRemoveBtn"
                              onClick={() => handleRemovePendingFile(item.id)}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingFiles.length > 0 && (
                <div className="inlineInfoBox">
                  오른쪽 정보는 선택한 파일 모두에 공통으로 적용돼요. 파일마다
                  다르게 하려면 각 줄의 개별 설정을 눌러주세요.
                </div>
              )}
            </div>

            <div className={`inlineUploadRight ${selectedFile ? "fileEditMode" : ""}`}>
              {selectedFile ? (
                <>
                  <div className="selectedFileEditHeader">
                    <span>개별 설정</span>
                    <strong title={selectedFile.name}>{selectedFile.name}</strong>
                  </div>

                  <label className="inlineFormField editTitleField">
                    자료 제목
                    <input
                      value={selectedFile.title}
                      onChange={(event) =>
                        handleChangePendingFile(
                          selectedFile.id,
                          "title",
                          event.target.value
                        )
                      }
                      placeholder="자료 제목 입력"
                    />
                  </label>

                  <label className="inlineFormField">
                    사업단
                    <select
                      value={selectedFile.business}
                      onChange={(event) =>
                        handleChangePendingFile(
                          selectedFile.id,
                          "business",
                          event.target.value
                        )
                      }
                    >
                      <option value="">공통 설정 사용</option>
                      {businessUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inlineFormField">
                    주제 분류
                    <select
                      value={selectedFile.topic}
                      onChange={(event) =>
                        handleChangePendingFile(
                          selectedFile.id,
                          "topic",
                          event.target.value
                        )
                      }
                    >
                      <option value="">공통 설정 사용</option>
                      {topicCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="inlineIndividualSettingBottom">
                    <label className="inlineFormField editDescriptionField">
                      설명
                      <textarea
                        value={selectedFile.description}
                        onChange={(event) =>
                          handleChangePendingFile(
                            selectedFile.id,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="이 파일만 따로 설명할 내용이 있으면 입력하세요"
                      />
                    </label>

                    <div className="inlineIndividualActions">
                      <button
                        type="button"
                        className="inlineIndividualCancelBtn"
                        onClick={() => setSelectedFileId(null)}
                      >
                        취소
                      </button>

                      <button
                        type="button"
                        className="inlineIndividualConfirmBtn"
                        onClick={() => setSelectedFileId(null)}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="commonInfoHeader">공통 정보</div>

                  <label className="inlineFormField">
                    사업단
                    <select
                      value={businessUnit}
                      onChange={(event) => setBusinessUnit(event.target.value)}
                    >
                      <option value="">선택해주세요</option>
                      {businessUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inlineFormField">
                    주제 분류
                    <select
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                    >
                      <option value="">선택해주세요</option>
                      {topicCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inlineFormField">
                    설명
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="간단한 설명 입력"
                    />
                  </label>

                  <div className="inlineSideActions">
                    <button
                      type="button"
                      className="inlineSubmitBtn"
                      onClick={handleRegisterDocument}
                      disabled={pendingFiles.length === 0 || isUploading}
                    >
                      {isUploading ? "등록 중..." : "AI 검색에 등록"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="inlineUploadBody apiUploadBody">
            <div className="inlineUploadLeft apiUploadLeft apiLeftFixed">
              <h3 className="apiLeftTitle"></h3>

              <div className="apiLeftCard">
                <div className="apiAddressBlock">
                  <label className="apiAddressLabel">외부 자료 주소</label>

                  <div className="apiAddressRow">
                    <input
                      value={collectUrl}
                      onChange={(event) => setCollectUrl(event.target.value)}
                      placeholder="외부 자료 주소를 입력하세요"
                    />

                    <button type="button" onClick={handleCollectUrl}>
                      불러오기
                    </button>
                  </div>
                </div>

                <div className="apiPreviewBlock">
                  <div className="apiPreviewBlockHeader">
                    <strong>불러온 자료 미리보기</strong>
                    <span>연결 대기 중...</span>
                  </div>

                  <div className="apiPreviewInner">
                    <div className="apiPreviewIcon">⌁</div>

                    <p>
                      외부 자료 주소를 입력하고 불러오면
                      <br />
                      내용이 여기에 표시됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="inlineUploadRight fileEditMode apiUploadRight">
              <div className="selectedFileEditHeader apiEditHeader">
                <span>등록 정보</span>
                <strong>외부 자료 연결</strong>
              </div>

              <label className="inlineFormField editTitleField apiTitleField">
                자료 제목
                <input
                  value={documentName}
                  onChange={(event) => setDocumentName(event.target.value)}
                  placeholder="자료 제목 입력"
                />
              </label>

              <label className="inlineFormField">
                사업단
                <select
                  value={businessUnit}
                  onChange={(event) => setBusinessUnit(event.target.value)}
                >
                  <option value="">선택해주세요</option>
                  {businessUnits.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inlineFormField">
                주제 분류
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                >
                  <option value="">선택해주세요</option>
                  {topicCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inlineIndividualSettingBottom apiSettingBottom">
                <label className="inlineFormField editDescriptionField apiDescriptionField">
                  설명
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="이 자료가 어떤 내용인지 간단히 적어주세요"
                  />
                </label>

                <div className="inlineIndividualActions apiSettingActions">
                  <button
                    type="button"
                    className="inlineIndividualCancelBtn"
                    onClick={() => {
                      setDocumentName("");
                      setDescription("");
                    }}
                  >
                    취소
                  </button>

                  <button
                    type="button"
                    className="inlineIndividualConfirmBtn"
                    onClick={handleRegisterDocument}
                    disabled={isUploading}
                  >
                    {isUploading ? "등록 중..." : "저장"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="inlineStatsGrid">
        <article>
          <span className="dot gray"></span>
          <p>전체 자료</p>
          <strong>{currentModeSources.length}</strong>
          <em>건</em>
        </article>

        <article className="done">
          <span className="dot green"></span>
          <p>등록 완료</p>
          <strong>{doneCount}</strong>
          <em>건</em>
        </article>

        <article className="working">
          <span className="dot blue"></span>
          <p>등록 중</p>
          <strong>{processingCount}</strong>
          <em>건</em>
        </article>

        <article className="waiting">
          <span className="dot orange"></span>
          <p>등록 대기 중</p>
          <strong>{waitingCount}</strong>
          <em>건</em>
        </article>

        <article className="error">
          <span className="dot red"></span>
          <p>등록 오류</p>
          <strong>{errorCount}</strong>
          <em>건</em>
        </article>
      </div>

      <div className="inlineResourceCard">
        <div className="inlineListHeader">
          <div>
            <h2>등록 진행 중인 자료</h2>
            <span>· {filteredSources.length}건</span>
          </div>

          <div className="inlineFilters">
            <select
              value={selectedBusiness}
              onChange={(event) => setSelectedBusiness(event.target.value)}
            >
              <option value="전체">사업단 전체</option>
              {businessUnits.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>

            <select
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value)}
            >
              <option value="전체">주제 전체</option>
              {topicCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="inlineResourceTable">
          <div className="inlineResourceTableHead">
            <span>자료 제목</span>
            <span>사업단</span>
            <span>주제 분류</span>
            <span>등록 진행률</span>
            <span>상태</span>
            <span>작업</span>
          </div>

          {filteredSources.length === 0 ? (
            <div className="inlineResourceEmptyRow">
              <strong>처리 중인 문서가 없습니다.</strong>
              <p>등록이 완료된 문서는 문서 보기 목록에서 확인할 수 있습니다.</p>
            </div>
          ) : (
            filteredSources.map((source) => (
              <div className="inlineResourceTableRow" key={source.id}>
                <div className="inlineTitleCell">
                  <strong title={source.name}>{source.name}</strong>
                </div>

                <span>{source.business || "-"}</span>
                <span>{source.topic || "-"}</span>

                <span className="inlineProgressCell">
                  <em className={`inlineProgressTrack ${getProgressClassName(source)}`}>
                    <i style={{ width: `${getSourceProgress(source)}%` }} />
                  </em>

                  <small>{getSourceProgress(source)}%</small>
                </span>

                <span>
                  <em
                    className={`inlineStatusBadge ${
                      source.status === "ready"
                        ? "done"
                        : source.status === "processing"
                        ? "working"
                        : "error"
                    }`}
                  >
                    {STATUS_LABELS[source.status] || source.status}
                  </em>
                </span>

                <span className="inlineTableActions">
                  <button type="button" onClick={() => handleDeleteSource(source.id)}>
                    삭제
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
