import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { printConsoleBanner, watchForDevTools } from './lib/flavour'

printConsoleBanner()
watchForDevTools()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
