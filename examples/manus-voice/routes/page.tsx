import { page, Slot } from '@joplo-app/kit';

/** 画面都在方案的“输入框”层里；路径页面只是占位。 */
export default page({ title: 'Manus 语音输入', layout: false }, <Slot name="main" />);
