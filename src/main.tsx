import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './refinement.css'
import './product-design.css'
import './agenda.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
