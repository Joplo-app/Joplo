import { $, set, type Bind } from '@joplo/kit';
import type { EffectDef, Flow } from '@joplo/kit';

/** 在终端输入一条命令并回车：flag 置为真，输出块随之出现，输入框清空。 */
export const run = (f: Flow, cmd: string, flag: Bind, caption: string, ...effects: EffectDef[]): Flow =>
  f
    .type('term_cmd', cmd)
    .click('term_enter', caption, set(flag, true), set($.inputs.term_cmd, ''), ...effects);

/** 在 Claude Code 里输入一句话并发送。 */
export const ask = (f: Flow, text: string, flag: Bind, caption: string): Flow =>
  f.type('agent_prompt', text).click('agent_send', caption, set(flag, true), set($.inputs.agent_prompt, ''));
