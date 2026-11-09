import { Project, Step } from '../../src/schema.ts';
export const step = (name: string, i: number, key?: string) => Step.parse({ id: `invite.main.send#${i}`, ...(key ? { key } : {}), kind: 'system', action: { type: 'event', name }, caption: name });
export function diffProject(): Project {
  return Project.parse({ schemaVersion: 2, mode: 'publish', name: 'Team invite',
    features: { invite: { id: 'invite', name: 'Invites', goal: 'Invite a teammate', optionIds: ['invite.main'], pick: 'invite.main' } },
    options: { 'invite.main': { id: 'invite.main', key: 'main', featureId: 'invite', name: 'Email invite', idea: 'Preview then send' } },
    scenes: { '/': { id: '/', optionId: null, route: '/', name: 'Invite', root: { id: 'screen', type: 'ui:Text', props: { text: '$ui.status' } } } },
    scenarios: { 'invite.main.send': { id: 'invite.main.send', optionId: 'invite.main', name: 'Send invitation', mock: { label: 'Success', outcome: 'success' }, initial: { sceneId: '/', ui: { status: 'Ready' } }, steps: [step('Open', 1), step('Send', 2), step('Complete', 3)] } },
  });
}
