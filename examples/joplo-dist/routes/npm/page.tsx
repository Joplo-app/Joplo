import { page, Slot } from '@joplo/kit';
import { Stack, TextInput } from '@joplo/kit/ui';

/** npmjs.com 上看到的包：方案把包的组织方式堆叠到 package 插槽。 */
export default page(
  { title: 'npmjs.com' },
  <Stack gap="md">
    <TextInput id="npm_search" placeholder="搜索 joplo" unmodeled />
    <Slot name="package" />
  </Stack>,
);
