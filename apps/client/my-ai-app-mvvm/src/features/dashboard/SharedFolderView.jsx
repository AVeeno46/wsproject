import { useEffect, useRef, useState } from "react";

function SharedFolderIcon({ folder }) {
  return (
    <div className="sharedFolderIcon">
      <div className="sharedFolderTab" />

      <div className="sharedFolderBody sharedFolderInfoBody">
        <strong className="sharedFolderInfoTitle">{folder.title}</strong>

        <span className="sharedFolderInfoOwner">
          만든 사람: {folder.owner}
        </span>

        <div className="sharedFolderInfoMeta">
          <span>코드 {folder.code}</span>
        </div>
      </div>
    </div>
  );
}

function JoinedSharedFolderCard({
  folder,
  menuKey,
  onOpen,
  canManage,
  canLeave,
  isMenuOpen,
  onToggleMenu,
  onCopyCode,
  onRename,
  onPasswordCheck,
  onDelete,
  onLeave,
}) {
  const hasMenu = canManage || canLeave;

  return (
    <div
      className="sharedFolderTile sharedJoinedTile"
      onClick={() => onOpen(folder)}
    >
      {hasMenu && (
        <>
          <button
            className="sharedTileMenuBtn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(menuKey);
            }}
          >
            ⋮
          </button>

          {isMenuOpen && (
            <div className="sharedOwnedMenu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => onCopyCode(folder)}>
                공유코드 복사
              </button>

              {canManage && (
                <>
                  <button type="button" onClick={() => onRename(folder)}>
                    제목 수정
                  </button>
                  <button type="button" onClick={() => onPasswordCheck(folder)}>
                    암호 확인
                  </button>
                  <button
                    className="danger"
                    type="button"
                    onClick={() => onDelete(folder)}
                  >
                    삭제
                  </button>
                </>
              )}

              {canLeave && (
                <button
                  className="danger"
                  type="button"
                  onClick={() => onLeave(folder)}
                >
                  공유폴더 탈퇴
                </button>
              )}
            </div>
          )}
        </>
      )}

      <SharedFolderIcon folder={folder} />
    </div>
  );
}

function SharedSearchResultItem({ folder, onEnter }) {
  const creatorName = folder.owner || "사용자";

  const descriptionText =
    folder.description &&
    !folder.description.includes("내가 만든") &&
    !folder.description.includes("내 폴더에서")
      ? folder.description
      : `${creatorName}님이 만든 공유폴더입니다.`;

  return (
    <div className="sharedResultItem">
      <div className="sharedResultFolderIcon">
        <span className="sharedLockIcon">🔒</span>
      </div>

      <div className="sharedResultMain">
        <h3>
          {folder.title}
          <span className="lockText">암호 필요</span>
        </h3>

        <p>
          {folder.owner}
          <span>|</span>
          {folder.department}
        </p>

        <p>
          공유코드 {folder.code}
        </p>
      </div>

      <div className="sharedResultDesc">
        <p>{descriptionText}</p>
        <span>생성일 {folder.createdAt}</span>
      </div>

      <button
        className="sharedEnterBtn"
        type="button"
        onClick={() => onEnter(folder)}
      >
        입장하기
      </button>
    </div>
  );
}

export function SharedFolderView({
  searchText = "",
  sharedFolderFilter = "joined",
  joinedFolders = [],
  ownedFolders = [],
  searchResults = [],
  isSearching = false,
  onOpenSharedFolder,
  onJoinSharedFolder,
  onUpdateOwnedSharedFolderTitle,
  onDeleteOwnedSharedFolder,
  onLeaveJoinedSharedFolder,
}) {
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [openOwnedMenuId, setOpenOwnedMenuId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef(null);

  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const [passwordCheckTarget, setPasswordCheckTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [isAllModalOpen, setIsAllModalOpen] = useState(false);
  const [allModalSearchText, setAllModalSearchText] = useState("");
  const [allModalSortType, setAllModalSortType] = useState("latest");
  const [isAllSortOpen, setIsAllSortOpen] = useState(false);

  const [joinedPage, setJoinedPage] = useState(1);
  const joinedPageSize = 5;
  const keyword = searchText.trim();
  const isOwnedMode = sharedFolderFilter === "owned";

  const visibleSharedFolders = isOwnedMode ? ownedFolders : joinedFolders;

  const joinedTotalPages = Math.max(
    1,
    Math.ceil(visibleSharedFolders.length / joinedPageSize)
  );

  const safeJoinedPage = Math.min(joinedPage, joinedTotalPages);

  const pagedVisibleSharedFolders = visibleSharedFolders.slice(
    (safeJoinedPage - 1) * joinedPageSize,
    safeJoinedPage * joinedPageSize
  );

  useEffect(() => {
    setJoinedPage(1);
  }, [sharedFolderFilter, visibleSharedFolders.length]);

const getFolderSortTime = (folder) => {
  const idTime = Number(String(folder.id).replace(/\D/g, ""));
  if (Number.isFinite(idTime) && idTime > 0) return idTime;

  const dateTime = new Date(folder.createdAt).getTime();
  return Number.isFinite(dateTime) ? dateTime : 0;
};

const allModalFolders = [...visibleSharedFolders]
  .filter((folder) => {
    const keyword = allModalSearchText.trim().toLowerCase();

    if (!keyword) return true;

    return [folder.title, folder.owner, folder.code, folder.department]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  })
  .sort((a, b) => {
    if (allModalSortType === "title") {
      return (a.title || "").localeCompare(b.title || "", "ko");
    }

    return getFolderSortTime(b) - getFolderSortTime(a);
  });

  const sharedSectionTitle = isOwnedMode
    ? "내가 만든 공유폴더"
    : "참가 중인 공유폴더";

  const emptyMessage = isOwnedMode
    ? "아직 만든 공유폴더가 없습니다."
    : "아직 참가 중인 공유폴더가 없습니다.";

  const descriptionText = isOwnedMode ? (
    <>
      내가 생성한 공유폴더가 이 목록에 표시됩니다.
      <br />
      공유폴더를 만들면 다른 사용자가 암호로 입장할 수 있습니다.
    </>
  ) : (
    <>
      암호를 입력했던 공유폴더는 참여 목록에 저장되어
      <br />
      다음부터 암호 없이 바로 입장할 수 있습니다.
    </>
  );

  const showToast = (message) => {
    setToastMessage(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage("");
    }, 1400);
  };

  const closePasswordModal = () => {
    setPasswordTarget(null);
    setPassword("");
    setPasswordError("");
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleToggleMenu = (menuKey) => {
    setOpenOwnedMenuId((prev) => (prev === menuKey ? null : menuKey));
  };

  const handleCopyCode = async (folder) => {
    try {
      await navigator.clipboard.writeText(folder.code);
      showToast("공유코드가 복사되었습니다.");
    } catch {
      showToast("복사에 실패했습니다.");
    }

    setOpenOwnedMenuId(null);
  };

  const handleRenameOpen = (folder) => {
    setRenameTarget(folder);
    setRenameValue(folder.title || "");
    setOpenOwnedMenuId(null);
  };

  const handleRenameSave = async () => {
    const nextTitle = renameValue.trim();

    if (!renameTarget || !nextTitle) {
      return;
    }

    try {
      await onUpdateOwnedSharedFolderTitle?.(renameTarget.id, nextTitle);
      closeRenameModal();
    } catch {
      showToast("제목 수정에 실패했습니다.");
    }
  };

  const handlePasswordCheckOpen = (folder) => {
    setPasswordCheckTarget(folder);
    setOpenOwnedMenuId(null);
  };

  const handleDeleteOpen = (folder) => {
    setDeleteTarget(folder);
    setOpenOwnedMenuId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      await onDeleteOwnedSharedFolder?.(deleteTarget.id);
      setDeleteTarget(null);
      showToast("공유폴더가 삭제되었습니다.");
    } catch {
      showToast("공유폴더 삭제에 실패했습니다.");
    }
  };

  const handleLeaveOpen = (folder) => {
    setLeaveTarget(folder);
    setOpenOwnedMenuId(null);
  };

  const handleLeaveConfirm = async () => {
    if (!leaveTarget) return;

    try {
      await onLeaveJoinedSharedFolder?.(leaveTarget.id);
      setLeaveTarget(null);
      showToast("공유폴더에서 탈퇴했습니다.");
    } catch {
      showToast("공유폴더 탈퇴에 실패했습니다.");
    }
  };

  const handleEnterFolder = async () => {
    if (!passwordTarget) return;

    const inputPassword = password.trim();

    if (!inputPassword) {
      setPasswordError("암호를 입력하세요.");
      return;
    }

    try {
      await onJoinSharedFolder(passwordTarget.id, inputPassword);
      closePasswordModal();
    } catch {
      setPasswordError("암호가 틀렸거나 입장할 수 없습니다.");
    }
  };

  return (
    <div className="sharedFolderView" onClick={() => setOpenOwnedMenuId(null)}>
      {toastMessage && (
        <div className="sharedToast" role="status">
          {toastMessage}
        </div>
      )}

      <section className="sharedJoinedSection noCreateCard">
        <div className="sharedJoinedContent">
          <div className="sharedSectionHeader">
            <div>
              <h2>
                {sharedSectionTitle}
                <span>{visibleSharedFolders.length}개</span>
              </h2>
              <p>{descriptionText}</p>
            </div>

        <button
  className="sharedSeeAllBtn"
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    setIsAllModalOpen(true);
  }}
>
  모두 보기 ›
</button>
          </div>

          <div className="joinedPagedGrid">
            {pagedVisibleSharedFolders.length > 0 ? (
              pagedVisibleSharedFolders.map((folder) => (
                <JoinedSharedFolderCard
                  key={folder.id}
                  folder={folder}
                  menuKey={`main-${folder.id}`}
                  onOpen={onOpenSharedFolder}
                  canManage={isOwnedMode}
                  canLeave={!isOwnedMode}
                  isMenuOpen={openOwnedMenuId === `main-${folder.id}`}
                  onToggleMenu={handleToggleMenu}
                  onCopyCode={handleCopyCode}
                  onRename={handleRenameOpen}
                  onPasswordCheck={handlePasswordCheckOpen}
                  onDelete={handleDeleteOpen}
                  onLeave={handleLeaveOpen}
                />
              ))
            ) : (
              <div className="sharedEmptyJoined">{emptyMessage}</div>
            )}
          </div>

          {visibleSharedFolders.length > joinedPageSize && (
            <div className="sharedPageNav">
              <button
                type="button"
                disabled={safeJoinedPage === 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinedPage((prev) => Math.max(1, prev - 1));
                }}
              >
                ‹
              </button>

              {Array.from({ length: joinedTotalPages }, (_, index) => {
                const pageNumber = index + 1;

                return (
                  <button
                    key={pageNumber}
                    type="button"
                    className={safeJoinedPage === pageNumber ? "active" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      setJoinedPage(pageNumber);
                    }}
                  >
                    {pageNumber}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={safeJoinedPage === joinedTotalPages}
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinedPage((prev) =>
                    Math.min(joinedTotalPages, prev + 1)
                  );
                }}
              >
                ›
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="sharedSearchSection">
   <div className="sharedSearchTitle">
  <h2>공유폴더 검색</h2>
</div>

        <div className="sharedResultList">
          {!keyword && (
            <p className="sharedGuideText">
              상단 검색창으로 제목, 만든 사람, 공유코드를 검색할 수 있습니다.
            </p>
          )}

          {isSearching && <p className="sharedGuideText">검색 중...</p>}

          {keyword &&
            !isSearching &&
            searchResults.map((folder) => (
              <SharedSearchResultItem
                key={folder.id}
                folder={folder}
                onEnter={(selectedFolder) => {
                  setPasswordTarget(selectedFolder);
                  setPassword("");
                  setPasswordError("");
                }}
              />
            ))}

          {keyword && !isSearching && searchResults.length === 0 && (
            <p className="sharedGuideText">검색된 공유폴더가 없습니다.</p>
          )}
        </div>

        <p className="sharedSecurityText">
          🔒 암호가 설정된 공유폴더는 암호 입력 후 입장할 수 있습니다.
        </p>
      </section>

{isAllModalOpen && (
  <div
    className="sharedAllModalBg"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setIsAllModalOpen(false);
        setAllModalSearchText("");
      }
    }}
  >
    <div
      className="sharedAllModal"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sharedAllModalHeader">
        <div>
          <h2>{sharedSectionTitle} 전체</h2>
          <p>
            총 {visibleSharedFolders.length}개의 공유폴더를 확인할 수 있습니다.
          </p>
        </div>

        <button
          className="sharedAllModalClose"
          type="button"
          onClick={() => {
            setIsAllModalOpen(false);
            setAllModalSearchText("");
          }}
        >
          ×
        </button>
      </div>

  <div className="sharedAllModalControls">
  <div className="sharedAllSearchBox">
    <input
      value={allModalSearchText}
      onChange={(e) => setAllModalSearchText(e.target.value)}
      placeholder="공유폴더 검색 (제목, 만든 사람, 공유코드)"
    />
    <button
      className="sharedAllSearchBtn"
      type="button"
      aria-label="공유폴더 검색"
    >
      <span className="sharedAllSearchIcon"></span>
    </button>
  </div>

  <div className="sharedAllSortWrap">
    <button
      className="sharedAllSortBtn"
      type="button"
      onClick={() => setIsAllSortOpen((prev) => !prev)}
    >
      {allModalSortType === "latest" ? "최신순" : "제목순"} ▾
    </button>

    {isAllSortOpen && (
      <div className="sharedAllSortMenu">
        <button
          type="button"
          className={allModalSortType === "latest" ? "active" : ""}
          onClick={() => {
            setAllModalSortType("latest");
            setIsAllSortOpen(false);
          }}
        >
          최신순
        </button>

        <button
          type="button"
          className={allModalSortType === "title" ? "active" : ""}
          onClick={() => {
            setAllModalSortType("title");
            setIsAllSortOpen(false);
          }}
        >
          제목순
        </button>
      </div>
    )}
  </div>
</div>

      <div className="sharedAllModalGrid">
        {allModalFolders.length > 0 ? (
          allModalFolders.map((folder) => (
            <JoinedSharedFolderCard
              key={folder.id}
              folder={folder}
              menuKey={`modal-${folder.id}`}
              onOpen={(selectedFolder) => {
                setIsAllModalOpen(false);
                setAllModalSearchText("");
                onOpenSharedFolder(selectedFolder);
              }}
              canManage={isOwnedMode}
              canLeave={!isOwnedMode}
              isMenuOpen={openOwnedMenuId === `modal-${folder.id}`}
              onToggleMenu={handleToggleMenu}
              onCopyCode={handleCopyCode}
              onRename={handleRenameOpen}
              onPasswordCheck={handlePasswordCheckOpen}
              onDelete={handleDeleteOpen}
              onLeave={handleLeaveOpen}
            />
          ))
        ) : (
          <div className="sharedAllModalEmpty">
            표시할 공유폴더가 없습니다.
          </div>
        )}
      </div>

      <div className="sharedAllModalFooter">
        <button
          type="button"
          onClick={() => {
            setIsAllModalOpen(false);
            setAllModalSearchText("");
          }}
        >
          닫기
        </button>
      </div>
    </div>
  </div>
)}

      {passwordTarget && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePasswordModal();
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <label>공유폴더 암호 입력</label>

            <div className="sharedPasswordInfo">
              <strong>{passwordTarget.title}</strong>
              <p>만든 사람: {passwordTarget.owner}</p>
              <p>공유코드: {passwordTarget.code}</p>
            </div>

            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEnterFolder();
                if (e.key === "Escape") closePasswordModal();
              }}
              placeholder="암호를 입력하세요"
              autoFocus
            />

            {passwordError && (
              <p className="sharedPasswordError">{passwordError}</p>
            )}

            <div className="renameActions">
              <button type="button" onClick={closePasswordModal}>
                취소
              </button>
              <button type="button" onClick={handleEnterFolder}>
                입장
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeRenameModal();
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <label>공유폴더 제목 수정</label>

            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSave();
                if (e.key === "Escape") closeRenameModal();
              }}
              placeholder="공유폴더 제목을 입력하세요"
              autoFocus
            />

            <div className="renameActions">
              <button type="button" onClick={closeRenameModal}>
                취소
              </button>
              <button type="button" onClick={handleRenameSave}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordCheckTarget && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPasswordCheckTarget(null);
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <label>공유폴더 암호 확인</label>

            <div className="sharedPasswordCheckBox">
              <strong>{passwordCheckTarget.title}</strong>
              <p>현재 암호</p>
              <code>{passwordCheckTarget.password || "확인 가능한 암호가 없습니다."}</code>
            </div>

            <div className="renameActions">
              <button type="button" onClick={() => setPasswordCheckTarget(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveTarget && (
        <div
          className="deleteModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLeaveTarget(null);
          }}
        >
          <div
            className="deleteModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>공유폴더 탈퇴</h2>
            <p>
              <strong>{leaveTarget.title}</strong> 공유폴더에서 탈퇴하시겠습니까?
              <br />
              탈퇴하면 참가 중 목록에서 사라지고, 다시 들어가려면 공유코드나 제목으로 검색 후 암호를 입력해야 합니다.
            </p>

            <div className="deleteActions">
              <button type="button" onClick={() => setLeaveTarget(null)}>
                취소
              </button>
              <button type="button" onClick={handleLeaveConfirm}>
                탈퇴
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="deleteModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            className="deleteModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>공유폴더 삭제</h2>
            <p>
              <strong>{deleteTarget.title}</strong> 공유폴더를 삭제하시겠습니까?
            </p>

            <div className="deleteActions">
              <button type="button" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button type="button" onClick={handleDeleteConfirm}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
