// [Chat] 문서 패널(캔버스) 상태를 앱 전역에서 공유하는 Context.
// "어떤 소스가 선택됐는지"와 "문서 패널이 열려있는지"를 분리해서 관리합니다.
// 이렇게 분리해두면 채팅 메시지에서 직접 문서를 열고 닫는 상호작용을
// prop-drilling 없이 구현할 수 있습니다. (ThemeContext.jsx와 동일한 패턴)
import { createContext, useContext, useState, useCallback } from 'react';

const DocPanelContext = createContext(null);

export const DocPanelProvider = ({ children }) => {
  const [activeSource, setActiveSource] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((source) => {
    setActiveSource(source);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <DocPanelContext.Provider value={{ activeSource, isOpen, open, close, setActiveSource }}>
      {children}
    </DocPanelContext.Provider>
  );
};

export const useDocPanel = () => useContext(DocPanelContext);
