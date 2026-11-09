/** 影片只在入口展开为现有创作定义；步骤、层级与插件继续走同一个编译器。 */
import { Flow, type FilmDef, type FlowOpts } from '@joplo-app/kit';
import { isNode } from '@joplo-app/kit/node';
import type { AuthoringProject, CompileMode } from './compile.ts';
import type { Diagnostic } from './result.ts';

type Report = (code: string, message: string, at?: string, severity?: Diagnostic['severity']) => void;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const replacements: Record<string, string> = {
  cases: 'Remove cases; chapters do not cover feature cases.',
  start: 'Use from: null to restart from the film initial state, or from: "chapter-key" to continue another chapter.',
  mock: 'Remove mock; chapters do not simulate feature outcomes.',
  outcome: 'Remove outcome; use chapter steps to tell the story.',
  expected: 'Use takeaway to describe what the audience should understand.',
};

export function lowerFilms(src: AuthoringProject, mode: CompileMode, report: Report): { source: AuthoringProject; films: Map<string, FilmDef> } {
  const films = new Map<string, FilmDef>();
  if (!Object.keys(src.films ?? {}).length) return { source: src, films };
  const features = { ...src.features };
  for (const [key, f] of Object.entries(src.films ?? {})) {
    const at = f?.source ?? `${f?.file ?? `films/${key}.tsx`}:1:1`;
    if (Object.hasOwn(features, key)) {
      report('FILM_ID_CONFLICT', `Film ${key} conflicts with features/${key}; rename the film file or the feature directory`, at);
      continue;
    }
    if (!f || f.kind !== 'film') {
      report('FILM_INVALID', `films/${key} must default export film({...})`, at);
      continue;
    }
    if (mode !== 'dev' && f.draft === true) {
      report('FILM_DRAFT_SKIPPED', `Draft film "${f.title}" was skipped; remove draft: true when it is ready to publish or review`, at, 'info');
      continue;
    }
    if (typeof f.title !== 'string' || !f.title.trim() || typeof f.summary !== 'string' || !f.summary.trim()
      || (f.stage !== undefined) === (f.layers !== undefined) || f.stage !== undefined && !isNode(f.stage)
      || f.layers !== undefined && !record(f.layers) || !record(f.chapters)) {
      report('FILM_INVALID', `Film ${key} requires non-empty title and summary, exactly one of stage or layers, and a chapters object of chapter(...) entries`, at);
      continue;
    }
    const scenarios: Record<string, Flow> = {};
    let previous: string | undefined;
    for (const [chapterKey, ch] of Object.entries(f.chapters)) {
      if (!ch || ch.kind !== 'chapter' || !record(ch.chapterOptions) || !Array.isArray(ch.steps)) {
        report('FILM_INVALID', `Film ${key} chapter "${chapterKey}" must be chapter(title, options?)`, ch?.source ?? at);
        continue;
      }
      const options = ch.chapterOptions;
      for (const [name, replacement] of Object.entries(replacements)) if (Object.hasOwn(options, name))
        report('FILM_CHAPTER_OPTION', `Chapter "${chapterKey}" does not support ${name}. ${replacement}`, ch.source ?? at);
      for (const st of ch.steps) for (const effect of st.effects) if (effect.type === 'go' || effect.type === 'uses')
        report('FILM_EFFECT_UNSUPPORTED', `Chapter "${chapterKey}" does not support ${effect.type}(). ${effect.type === 'go' ? 'Use layers and shot() to change the picture; films have no route pages.' : 'Remove uses(); films do not have feature rules.'}`, st.source ?? ch.source ?? at);
      // 接续默认值只在这里应用一次；null 显式清除，之后的编译与播放只消费 FlowOpts / Scenario.from。
      const from = options.from === undefined ? previous : options.from;
      const { takeaway, from: _from, ...rest } = options;
      const opts: FlowOpts = { ...rest, ...(from !== null && from !== undefined ? { from } : {}), ...(takeaway !== undefined ? { expected: takeaway } : {}) };
      scenarios[chapterKey] = Object.assign(new Flow(ch.name, opts), { steps: ch.steps, source: ch.source });
      previous = chapterKey;
    }
    if (!Object.keys(f.chapters).length)
      report('FILM_EMPTY', `Film "${f.title}" has no chapters. Add chapters: { opening: chapter('Opening').system('Begin', narrate('Your opening line')) }`, at, 'info');
    films.set(key, f);
    features[key] = {
      def: { kind: 'feature', name: f.title, goal: f.summary, cases: {}, pick: 'main', roles: f.roles, order: f.order, source: f.source, file: f.file },
      options: { main: {
        kind: 'option', name: f.title, idea: f.summary, state: f.state, free: f.free, scenarios,
        layers: f.stage !== undefined ? { stage: { kind: 'layer', title: f.title, tree: f.stage, viewport: f.viewport, source: f.source } } : f.layers,
        source: f.source, file: f.file,
      } },
    };
  }
  return { source: { ...src, features }, films };
}
