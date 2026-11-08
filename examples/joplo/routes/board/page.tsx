import { page, Slot } from '@joplo-app/kit';

/** 首页：左栏是项目，右侧是所选项目的功能。 */
export default page({ layout: 'board', title: '首页' }, <Slot name="main" />);
