import { $, work, chapter, narrate, set } from '@joplo-app/kit';
import { Stack, Text, TextInput, Title } from '@joplo-app/plugin-ui';

export default work({
  title: 'A show you can change',
  summary: 'Follow a line of code into a picture, then pause and make it yours.',
  audience: 'Anyone making their first Joplo show',
  state: { ui: { message: 'Ready to play', caption: 'The stage starts from this state.' } },
  stage: (
    <Stack gap="lg" p="xl" pt={64}>
      {/* Edit this literal, save the file, and watch the picture update. */}
      <Title order={1}>Change this line. Change the picture.</Title>
      <Text>{$.ui.caption}</Text>
      <TextInput id="message" label="Your message" value={$.ui.message} />
      <Title order={2}>{$.ui.message}</Title>
      <Text>Pause and type your own message. Play or Reset restores the script.</Text>
    </Stack>
  ),
  scenarios: {
    script: chapter('Code becomes a picture', { expected: 'See the same state in the input and the picture' })
      .system('Change the state',
        set($.ui.message, 'One state, two views'),
        set($.ui.caption, 'A step changes state. Both views update together.'),
        narrate('This picture is written in code. A step changes one value, and both the input and the heading show it.')),
    explore: chapter('Make it yours', { expected: 'Pause, edit the message, then return to the script' })
      .type('message', 'A show you can try',
        set($.ui.message, 'A show you can try'),
        set($.ui.caption, 'This chapter continues from the previous picture.'),
        narrate('The next chapter keeps the previous state. This scripted input updates the same value.'))
      .system('Try your own words',
        set($.ui.caption, 'Pause here and type. Your changes are local; Play or Reset returns to the script.'),
        narrate('Pause and type a different message. To change the show itself, edit the heading in works/explainer.tsx and save.')),
  },
});
