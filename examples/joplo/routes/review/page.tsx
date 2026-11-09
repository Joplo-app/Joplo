import { page, Slot } from '@joplo-app/kit';
import { Stack } from '@joplo-app/plugin-ui';

export default page({ title: '本地评审', layout: false }, <Stack><Slot name="main" /></Stack>);
