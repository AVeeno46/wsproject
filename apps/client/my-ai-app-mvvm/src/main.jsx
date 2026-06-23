// 앱의 진입점(entry). 여기서 React 앱을 실제 HTML(#root)에 그려 넣습니다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
