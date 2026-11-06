import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/kit/ui';

/** 这个项目的画面都在方案的层级里（小雨的电脑、阿杰的手机）；路径页面只是占位。 */
export default page({ title: '营地助手', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
