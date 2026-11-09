import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/plugin-ui';

/** 画面都在方案的层级里（作者电脑、分享里有什么、小周的浏览器）；路径页面只是占位。 */
export default page({ title: '按场景保密分享', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
