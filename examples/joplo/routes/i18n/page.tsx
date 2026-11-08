import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/kit/ui';

/** 画面都在方案的层级里（看板、作者电脑、分享页、背后）；路径页面只是占位。 */
export default page({ title: '作者内容多语言', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
