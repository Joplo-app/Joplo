import { page, Slot } from '@joplo-app/kit';
import { Stack, Text } from '@joplo-app/kit/ui';
export default page({ title: '创作模型的设计过程', layout: false }, <Stack p="lg"><Text>从场景列表查看创作模型的取舍与行为。</Text><Slot name="main" /></Stack>);
