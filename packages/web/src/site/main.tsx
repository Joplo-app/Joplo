import { I18nProvider } from '../i18n/context';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { SiteApp, readInlineIR } from './SiteApp';
import { langParam } from '../i18n/content';

const params = new URLSearchParams(window.location.search);
// 功能差异页用 locale=（与截图一致）；观众链接用 lang=（D83，发布站与嵌入），只决定这次打开，不写回 storage
const explicit = params.get('diff') === '1' ? params.get('locale') : langParam(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider explicit={explicit}><SiteApp data={readInlineIR()} /></I18nProvider>
  </StrictMode>,
);
