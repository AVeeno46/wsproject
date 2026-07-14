// [Component] 대시보드 설정 페이지
import { useRef } from "react";
import "../../styles/DashboardSettingsPage.css";

function DashboardSettingsPage({
  theme,
  setTheme,
  profileLabel,
  profileName,
  profileRole,
  profileImage,
  setProfileImage,
  requestLogout,
}) {
  const fileInputRef = useRef(null);

  const handleProfileImageSelect = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있습니다.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const imageUrl = String(reader.result || "");
      setProfileImage(imageUrl);
      localStorage.setItem("docaiProfileImage", imageUrl);
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveProfileImage = () => {
    setProfileImage("");
    localStorage.removeItem("docaiProfileImage");
  };

  return (
    <section className="dashboardContent settingsSimplePage">
      <div className="settingsSimpleShell">
        <div className="settingsSimpleTitle">
          <h2>설정</h2>
          <p>계정 정보와 화면 모드를 관리합니다.</p>
        </div>

        <div className="settingsSimpleGroup">
          <h3>계정 정보</h3>

          <div className="settingsProfileRow">
            <button
              type="button"
              className="settingsProfileAvatar"
              onClick={() => fileInputRef.current?.click()}
              aria-label="프로필 이미지 변경"
            >
              {profileImage ? (
                <img src={profileImage} alt="프로필" />
              ) : (
                <span>{profileLabel}</span>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfileImageSelect}
              hidden
            />

            <div className="settingsProfileInfo">
              <strong>{profileName}</strong>
              <span>{profileRole}</span>

              <div className="settingsProfileActions">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  프로필 변경
                </button>

                {profileImage && (
                  <button type="button" onClick={handleRemoveProfileImage}>
                    기본으로
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              className="settingsSimpleLogout"
              onClick={requestLogout}
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="settingsSimpleGroup">
          <h3>화면 설정</h3>

          <div className="settingsSimpleRow">
            <div>
              <strong>화면 모드</strong>
              <span>{theme === "dark" ? "어두운 모드" : "밝은 모드"}</span>
            </div>

            <div className="settingsSimpleToggle">
              <button
                type="button"
                className={theme === "light" ? "active" : ""}
                onClick={() => setTheme("light")}
              >
                밝게
              </button>

              <button
                type="button"
                className={theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark")}
              >
                어둡게
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardSettingsPage;
