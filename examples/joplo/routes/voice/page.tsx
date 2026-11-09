import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/plugin-ui';

/** 画面都在方案的层级里（看板、节奏、作者电脑、背后、发布站）；路径页面只是占位。 */
export default page({ title: '导演模式朗读', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
