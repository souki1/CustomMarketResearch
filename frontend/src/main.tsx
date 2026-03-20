import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { readStoredUiTheme } from '@/lib/uiTheme'
import { store } from './store'

try {
  document.documentElement.dataset.uiTheme = readStoredUiTheme()
} catch {
  document.documentElement.dataset.uiTheme = 'sky'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Provider store={store}>
        <App />
      </Provider>
    </ThemeProvider>
  </StrictMode>,
)
