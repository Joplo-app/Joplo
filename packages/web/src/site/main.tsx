import { I18nProvider } from '../i18n/context';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { SiteApp, readInlineIR } from './SiteApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider explicit={new URLSearchParams(window.location.search).get('diff') === '1' ? new URLSearchParams(window.location.search).get('locale') : undefined}><SiteApp data={readInlineIR()} /></I18nProvider>
  </StrictMode>,
);
