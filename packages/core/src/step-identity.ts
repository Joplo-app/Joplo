/** Stable author identities are separate from public playback IR for strict legacy readers. */
import { z } from 'zod';
import { Id, Project, Qid, SCHEMA_VERSION } from './schema.ts';
import { JoploError } from './result.ts';

export const StepIdentity = z.strictObject({
  formatVersion: z.literal(1),
  scenarios: z.record(Qid, z.record(Qid, Id)),
});
export type StepIdentity = z.infer<typeof StepIdentity>;

/** Only stable keys and existing public playback addresses; no authoring metadata. */
export function stepIdentity(project: Project): StepIdentity | undefined {
  const scenarios = Object.fromEntries(Object.values(project.scenarios).flatMap(s => {
    const entries = s.steps.filter(st => st.key !== undefined).map(st => [st.id, st.key!] as const);
    return entries.length ? [[s.id, Object.fromEntries(entries)]] : [];
  }));
  if (!Object.keys(scenarios).length) return undefined;
  const identity = StepIdentity.parse({ formatVersion: 1, scenarios });
  applyStepIdentity(project, identity);
  return identity;
}

/** Validate references and uniqueness before enriching an in-memory IR. Never mutate the serialized public IR. */
export function applyStepIdentity(value: unknown, metadata: unknown): Project {
  const parsed = Project.safeParse(value), parsedIdentity = StepIdentity.safeParse(metadata);
  if (!parsed.success || !parsedIdentity.success) throw new JoploError('INVALID_SCHEMA', 'Invalid or unsupported public step identity; rebuild both versions with a compatible CLI');
  const project = parsed.data, identity = parsedIdentity.data;
  for (const [id, keys] of Object.entries(identity.scenarios)) {
    const scenario = project.scenarios[id];
    if (!scenario || scenario.id !== id) throw new JoploError('INVALID_REFERENCE', 'Step identity refers to a missing scenario');
    if (new Set(scenario.steps.map(st => st.id)).size !== scenario.steps.length) throw new JoploError('INVALID_REFERENCE', 'Step identity has ambiguous playback addresses');
    for (const [stepId, key] of Object.entries(keys)) {
      const step = scenario.steps.find(st => st.id === stepId);
      if (!step) throw new JoploError('INVALID_REFERENCE', 'Step identity refers to a missing step');
      if (step.key !== undefined && step.key !== key) throw new JoploError('INVALID_REFERENCE', 'Conflicting step identities');
      step.key = key;
    }
    const all = scenario.steps.flatMap(st => st.key === undefined ? [] : [st.key]);
    if (new Set(all).size !== all.length) throw new JoploError('INVALID_REFERENCE', 'Stable step keys must be unique within each scenario');
  }
  return project;
}

/** Read inert JSON only; never execute either build. Unknown IR versions remain explicit incompatible inputs. */
export function readFeatureDiffBuild(html: string): unknown {
  const read = (id: string, required: boolean) => {
    const matches = [...html.matchAll(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)<\\/script>`, 'g'))];
    if (matches.length > 1 || required && matches.length !== 1) throw new JoploError('INVALID_SCHEMA', `Expected one ${id} payload. Rebuild both versions; a missing baseline is not a new feature`);
    if (!matches.length) return undefined;
    try { return JSON.parse(matches[0]![1]!); }
    catch { throw new JoploError('INVALID_SCHEMA', `Invalid ${id} JSON`); }
  };
  const payload = read('joplo-ir', true);
  if (!payload || typeof payload !== 'object' || !payload.project) throw new JoploError('INVALID_SCHEMA', 'Missing public playback project');
  // Future IR must reach featureDiff's explicit incompatible result, never be parsed as today's Project.
  if (payload.project.schemaVersion !== SCHEMA_VERSION) return payload.project;
  const identity = read('joplo-step-keys', false);
  return identity === undefined ? payload.project : applyStepIdentity(payload.project, identity);
}
