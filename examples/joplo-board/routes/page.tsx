import { page, Slot } from '@tokenroll/joplo-kit';

/** 首页：左栏是项目，右侧是所选项目的功能。 */
export default page({ title: '首页' }, <Slot name="main" />);
