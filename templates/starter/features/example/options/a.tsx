import { option, flow, done } from '@joplo-app/kit';
import { Button } from '@joplo-app/plugin-ui';
export default option({
  name: 'Option A', idea: 'Complete the action with one button',
  on: { '/': { actions: <Button id="start">Start</Button> } },
  scenarios: { happy: flow('Complete successfully', { cases: ['happy'], start: '/' }).click('start', 'Click Start', done('Completed')) },
});
