import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ZombiesGame from './ZombiesGame'
import './styles.css'

createRoot(document.getElementById('zombies-root')).render(
  <StrictMode><ZombiesGame /></StrictMode>,
)
