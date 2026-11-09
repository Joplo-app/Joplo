import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/plugin-ui';

/** 画面都在方案的层级里（选票、国会、地图、历史、权力）；路径页面只是占位。 */
export default page({ title: '2026 美国中期选举', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
