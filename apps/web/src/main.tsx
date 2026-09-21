import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.jsx';
import { ProbeProvider } from './state/probe.jsx';
import { SyncProvider } from './state/sync.jsx';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SyncProvider>
        <ProbeProvider>
          <App />
        </ProbeProvider>
      </SyncProvider>
    </BrowserRouter>
  </StrictMode>,
);
