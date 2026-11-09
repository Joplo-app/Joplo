import { page, Slot } from '@joplo-app/kit';

/** 画面都在方案的“白板”层里；路径页面只是占位。 */
export default page({ title: '免密登录', layout: false }, <Slot name="main" />);
