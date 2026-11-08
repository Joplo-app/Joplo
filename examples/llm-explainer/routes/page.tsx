import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/kit/ui';

/** 画面都在方案的层级里（封面、聊天、词元、预测、温度、胡说）；路径页面只是占位。 */
export default page({ title: '大模型是怎么写出一句话的', layout: false }, <Stack p="lg"><Slot name="main" /></Stack>);
