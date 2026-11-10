import { Project, Step } from '../../src/schema.ts';
export const step = (name: string, i: number, key?: string) => Step.parse({ id: `invite.main.send#${i}`, ...(key ? { key } : {}), kind: 'system', action: { type: 'event', name }, caption: name });
export function diffProject(): Project {
  return Project.parse({ schemaVersion: 3, entryIds: ['invite'], mode: 'publish', name: 'Team invite',
    features: { invite: { id: 'invite', name: 'Invites', goal: 'Invite a teammate', workIds: ['invite.main'], pick: 'invite.main', alternatives: { 'invite.main': {decisionFocus:'',tradeoffs:[],coverage:{}} } } },
    works: { 'invite.main': { id: 'invite.main', key: 'main', featureId: 'invite', title: 'Email invite', summary: 'Preview then send' } },
    scenes: { '/': { id: '/', workId: null, route: '/', name: 'Invite', root: { id: 'screen', type: 'ui:Text', props: { text: '$ui.status' } } } },
    scenarios: { 'invite.main.send': { id: 'invite.main.send', workId: 'invite.main', name: 'Send invitation', mock: { label: 'Success', outcome: 'success' }, initial: { sceneId: '/', ui: { status: 'Ready' } }, steps: [step('Open', 1), step('Send', 2), step('Complete', 3)] } },
  });
}
