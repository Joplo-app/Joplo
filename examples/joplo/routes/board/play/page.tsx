import { page, Slot } from '@joplo-app/kit';

/** 功能演示页：画面、播放控制、步骤条。左栏和顶栏由方案堆叠。 */
export default page({ layout: 'board', title: '功能演示' }, <Slot name="main" />);
