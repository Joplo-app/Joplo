import { createContext, useContext } from 'react';
import type { ContentInfo } from './content';

/** 发布站与嵌入的内容语言（D84）：语言菜单给有作者内容的语言打 ✓、退回提示、朗读的声音都读它。看板与没有 i18n 的项目为 null。 */
export const ContentContext = createContext<ContentInfo | null>(null);
export const useContent = () => useContext(ContentContext);
