import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const CHUNK_RELOAD_KEY = 'expandonesia.chunkReloadAt'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()

  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - lastReload < 30_000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch (error) {
    console.error('Tidak dapat memulihkan aplikasi dari cache versi lama.', error)
    return
  }

  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
