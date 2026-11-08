import type { Bind, CondExpr } from '@joplo-app/kit';
import { Terminal } from '@joplo-app/kit/ui';

/** 终端里的一条命令及其输出（放在 <Terminal> 里）；when 为真时出现。id 落在输出块上，规则用它引用。 */
export const Cmd = (p: { id: string; when: Bind | CondExpr; cmd: string; out: string; tone?: 'plain' | 'ok' | 'warn' | 'error' }) => (
  <>
    <Terminal.Command when={p.when}>{p.cmd}</Terminal.Command>
    <Terminal.Output id={p.id} when={p.when} tone={p.tone ?? 'plain'}>{p.out}</Terminal.Output>
  </>
);
