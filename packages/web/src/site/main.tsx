import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { SiteApp, readInlineIR } from './SiteApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteApp data={readInlineIR()} />
  </StrictMode>,
);
