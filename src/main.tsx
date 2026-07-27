import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocaleProvider } from './i18n/LocaleContext';
import { ErrorLogProvider } from './errorLog/ErrorLogContext';
import { UpdateLogProvider } from './update/UpdateLogContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ErrorLogProvider>
        <UpdateLogProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </UpdateLogProvider>
      </ErrorLogProvider>
    </LocaleProvider>
  </StrictMode>,
);
