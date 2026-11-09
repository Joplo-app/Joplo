import { page, Slot } from '@joplo-app/kit';
import { Stack, TextInput } from '@joplo-app/plugin-ui';

/** npmjs.com 上看到的包：方案把包的组织方式堆叠到 package 插槽。 */
export default page(
  { layout: 'distribution', title: 'npmjs.com' },
  <Stack gap="md">
    <TextInput id="npm_search" placeholder="搜索 joplo" unmodeled />
    <Slot name="package" />
  </Stack>,
);
