import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'react-grid-layout/css/styles.css'
import './theme.css'
import './style.css'

if (typeof window !== 'undefined' && !window.process) {
  window.process = { env: { NODE_ENV: 'development' } }
}

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
