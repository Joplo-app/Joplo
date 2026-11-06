import { I18nProvider } from './i18n/context';
import { boardDictionary } from './i18n/board/dictionaries';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { BoardApp } from './board/App';
import { RenderApp } from './RenderApp';

const isRender = new URLSearchParams(location.search).get('render') === '1';
if (isRender) document.documentElement.dataset.render = '1';

createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider extend={boardDictionary} explicit={isRender ? new URLSearchParams(location.search).get('locale') : undefined}>{isRender ? <RenderApp /> : <BoardApp />}</I18nProvider></StrictMode>);
