import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import '@fontsource-variable/inter'
import './index.css'
import { App } from './App'
import { DataProvider } from './app/DataProvider'
import { UIProvider } from './app/UIProvider'
import { ConfirmProvider } from './components/ui/confirm'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <DataProvider>
        <ConfirmProvider>
          <UIProvider>
            <App />
            <Toaster position="bottom-right" theme="system" toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' } }} />
          </UIProvider>
        </ConfirmProvider>
      </DataProvider>
    </HashRouter>
  </React.StrictMode>,
)
