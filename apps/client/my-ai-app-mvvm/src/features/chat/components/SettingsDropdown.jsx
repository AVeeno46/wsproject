// [Chat] 설정 드롭다운 — 화면 테마, 계정/로그아웃.
export function SettingsDropdown({ isOpen, onClose, theme, onThemeChange, profileName, userRole, onLogout }) {
  if (!isOpen) return null;

  return (
    <div className="conversationSettingBg" onClick={onClose}>
      <div className="conversationSettingDropdown" onClick={(e) => e.stopPropagation()}>
        <div className="settingHoverItem">
          <button className="settingMenuItem" type="button">
            <span className="settingIcon displayIcon"></span>
            <strong>화면</strong>
            <em>›</em>
          </button>
          <div className="settingSubMenu">
            <button onClick={() => onThemeChange("light")} type="button">
              <span className="sunMiniIcon"></span>밝은 모드
            </button>
            <button onClick={() => onThemeChange("dark")} type="button">
              <span className="moonMiniIcon"></span>어두운 모드
            </button>
          </div>
        </div>

        <div className="settingHoverItem">
          <button className="settingMenuItem" type="button">
            <span className="settingIcon accountIcon"></span>
            <strong>계정</strong>
            <em>›</em>
          </button>
          <div className="settingSubMenu">
            <div className="accountSubInfo">
              <strong>{profileName}</strong>
              <p>{userRole || "User"}</p>
            </div>
            <button className="logoutSubBtn" onClick={onLogout} type="button">
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
