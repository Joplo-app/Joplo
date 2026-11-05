import { page, Slot } from '@joplo/kit';
import { Input } from '@joplo/kit/ui';

/** npmjs.com 上看到的包：方案把包的组织方式堆叠到 package 插槽。 */
export default page(
  { title: 'npmjs.com' },
  <>
    <Input id="npm_search" placeholder="搜索 joplo" unmodeled />
    <Slot name="package" />
  </>,
);
