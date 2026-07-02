import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 保留 StrictMode：useGSAP() 的自动 revert 在双调用下是幂等的，
// 正好验证我们的 GSAP 集成没有重复绑定 / 泄漏 ScrollTrigger。
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
