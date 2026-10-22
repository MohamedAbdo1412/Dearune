import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
// Listens for the browser's install prompt from the first line of the app,
// so the offer is never missed.
import '@/pwa/install'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={200}>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)