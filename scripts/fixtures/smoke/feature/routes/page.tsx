import { page, Slot } from '@joplo-app/kit';
import { Group, Stack, Title } from '@joplo-app/plugin-ui';
export default page({ title: 'Home' },
  <Stack gap="md">
    <Title id="welcome" order={2}>Start designing</Title>
    <Group gap="sm"><Slot name="actions" /></Group>
  </Stack>,
);
