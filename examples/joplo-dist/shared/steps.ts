import { $, set, type Bind } from '@tokenroll/joplo-kit';
import type { EffectDef, Flow } from '@tokenroll/joplo-kit';

/** 在终端输入一条命令并回车：flag 置为真，命令和输出随之出现，输入行清空。 */
export const run = (f: Flow, cmd: string, flag: Bind, caption: string, ...effects: EffectDef[]): Flow =>
  f.type('term_cmd', cmd, caption, set(flag, true), set($.inputs.term_cmd, ''), ...effects);

/** 在 Claude Code 里输入一句话并发送。 */
export const ask = (f: Flow, text: string, flag: Bind, caption: string): Flow =>
  f.type('agent_prompt', text, '用户在 Claude Code 里提需求').click('agent_send', caption, set(flag, true), set($.inputs.agent_prompt, ''));
