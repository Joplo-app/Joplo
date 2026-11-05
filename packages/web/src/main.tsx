import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { WorkspaceApp } from './workspace/App';
import { RenderApp } from './RenderApp';

const isRender = new URLSearchParams(location.search).get('render') === '1';
if (isRender) document.documentElement.dataset.render = '1';

createRoot(document.getElementById('root')!).render(<StrictMode>{isRender ? <RenderApp /> : <WorkspaceApp />}</StrictMode>);
