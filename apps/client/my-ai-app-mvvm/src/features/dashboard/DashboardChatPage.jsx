import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// [Component] 대시보드 챗봇 페이지
// 채팅 첫 화면, 메시지 목록, 파일 첨부 입력창만 담당합니다.

// 마크다운 이미지 로드 실패 시 브라우저 기본 깨진 아이콘 대신 안내 박스로 대체.
function MarkdownImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="chatImgFallback">🖼️ 이미지를 불러올 수 없습니다{alt ? ` (${alt})` : ""}</span>;
  }

  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

function DashboardChatPage({
  userName,
  chatInput,
  setChatInput,
  chatMessages,
  isThinking,
  sendMessage,
  selectedFiles,
  clearSelectedFiles,
  removeSelectedFile,
  getSelectedFileIconSrc,
  isDraggingInput,
  handleInputDragEnter,
  handleInputDragOver,
  handleInputDragLeave,
  handleInputDrop,
  handleFileSelect,
  chatTextareaRef,
  fileInputRef,
  chatMessagesEndRef,
}) {
  const hasMessages = chatMessages.length > 0;
  const displayName = userName?.trim() || "관리자";

  useEffect(() => {
    if (!hasMessages) return;

    requestAnimationFrame(() => {
      chatMessagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, [selectedFiles.length, hasMessages, chatMessagesEndRef, chatMessages.length]);

  const handleChatSubmit = () => {
    if (isThinking) return;

    const question = chatInput.trim();

    if (!question && selectedFiles.length === 0) return;

    const attachmentNote =
      selectedFiles.length > 0
        ? `\n(첨부 파일: ${selectedFiles.map((item) => item.name).join(", ")})`
        : "";

    sendMessage(`${question}${attachmentNote}`);
    setChatInput("");
    clearSelectedFiles();
  };

  return (
    <section
      className={`dashboardContent chatHomeContent ${
        hasMessages ? "chatModeActive" : ""
      } ${selectedFiles.length > 0 ? "hasComposerFiles" : ""}`}
    >
      <div className="chatHomeInner">
        {!hasMessages && (
          <div className="chatHeroText">
            <h2>안녕하세요, {displayName}님.</h2>
            <p>필요한 문서를 올리거나 질문을 입력해 주세요.</p>
          </div>
        )}

        {hasMessages && (
          <div className="chatMessageList">
            {chatMessages.map((message) => (
              <div
                className={`chatMessageRow ${
                  message.role === "user" ? "user" : "assistant"
                }`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="chatMessageAvatar">
                    <img src="/assets/2.png" alt="DocAI" />
                  </div>
                )}

                <div
                  className={`chatMessageStack ${
                    message.role === "user" ? "user" : "assistant"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="chatMessageBubble">
                      <strong className="chatMessageName"></strong>
                      {message.content ? (
                        <div className="chatMarkdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: MarkdownImage }}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p>{isThinking ? "답변 생성 중..." : ""}</p>
                      )}
                    </div>
                  )}

                  {message.role === "user" && (
                    <>
                      {message.files?.length > 0 && (
                        <div className="chatUploadedFileGrid">
                          {message.files.map((file) => (
                            <div className="chatUploadedFileCard" key={file.id}>
                              <div className="chatUploadedFileIcon">
                                <img
                                  src={
                                    file.iconSrc ||
                                    getSelectedFileIconSrc(file.type)
                                  }
                                  alt=""
                                  aria-hidden="true"
                                />
                              </div>

                              <strong title={file.name}>{file.name}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {message.content && (
                        <div className="chatMessageBubble userTextBubble">
                          <p>{message.content}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            <div
              className={`chatBottomSpacer ${
                selectedFiles.length > 0 ? "withComposerFiles" : ""
              }`}
            />
            <div ref={chatMessagesEndRef} />
          </div>
        )}

        <div
          className={`chatHomeInputWrap ${
            isDraggingInput ? "dragInputMode" : ""
          }`}
          onDragEnter={handleInputDragEnter}
          onDragOver={handleInputDragOver}
          onDragLeave={handleInputDragLeave}
          onDrop={handleInputDrop}
        >
          <div
            className={`chatHomeInputBox ${
              isDraggingInput ? "dragExpanded" : ""
            } ${selectedFiles.length > 0 ? "hasSelectedFiles" : ""}`}
          >
            {selectedFiles.length > 0 && (
              <div className="chatSelectedFileStrip">
                {selectedFiles.map((item) => (
                  <div className="chatSelectedFileCard" key={item.id}>
                    <button
                      type="button"
                      className="chatSelectedFileRemove"
                      aria-label={`${item.name} 삭제`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSelectedFile(item.id);
                      }}
                    >
                      ×
                    </button>

                    <div className="chatSelectedFileThumb">
                      <img
                        src={item.iconSrc || getSelectedFileIconSrc(item.type)}
                        alt=""
                        aria-hidden="true"
                      />
                    </div>

                    <strong title={item.name}>{item.name}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="chatComposerRow">
              <button
                type="button"
                className="chatAttachBtn"
                aria-label="파일 첨부"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M8.4 12.7l6.1-6.1a3.1 3.1 0 0 1 4.4 4.4l-7.4 7.4a5 5 0 0 1-7.1-7.1l7.8-7.8" />
                  <path d="M9.2 15.8l7.1-7.1" />
                </svg>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="chatFileInput"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.hwp,.hwpx,.ppt,.pptx,.xls,.xlsx,.txt"
                multiple
                hidden
              />

              <textarea
                ref={chatTextareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                }}
                placeholder="궁금한 내용을 입력해보세요"
                rows={1}
                disabled={isThinking}
              />

              <button
                type="button"
                className="chatSendBtn"
                onClick={handleChatSubmit}
                aria-label="질문 보내기"
                disabled={isThinking}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M5 12h12" />
                  <path d="M13 7l5 5-5 5" />
                </svg>
              </button>
            </div>

            {isDraggingInput && (
              <div className="chatInputDropOverlay">
                <div className="chatInputDropIcon">
                  <svg viewBox="0 0 32 36">
                    <path d="M7 3.5H20.5L26 9V32.5H7V3.5Z" />
                    <path d="M20.5 3.5V9H26" />
                    <path d="M16.5 15V25" />
                    <path d="M11.5 20H21.5" />
                  </svg>
                </div>

                <strong>파일을 여기에 드롭하세요</strong>
                <p>
                  여러 문서를 한 번에 추가하고, 채팅에서 바로 처리할 수 있어요.
                </p>
              </div>
            )}
          </div>

          <p className="chatHomeHint">
            Doc AI 답변은 참고용입니다. 중요한 내용은 원문 문서와 함께 확인해 주세요.
          </p>
        </div>
      </div>
    </section>
  );
}

export default DashboardChatPage;
