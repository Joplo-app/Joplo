import { page, Slot } from '@joplo-app/kit';
import { Stack, Text } from '@joplo-app/plugin-ui';
export default page({ title: '功能差异的设计过程', layout: false }, <Stack p="lg"><Text>从场景列表选择一条真实设计过程。</Text><Slot name="main" /></Stack>);
