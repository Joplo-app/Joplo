import type { Bind, CondExpr } from '@joplo/kit';

const TONE = { plain: 'text-[#4a4a4a]', ok: 'text-[#2b8a3e]', warn: 'text-[#b45309]', error: 'text-[#c92a2a]' } as const;

/** 终端里的一条命令及其输出；when 为真时出现。 */
export const Cmd = (p: { id: string; when: Bind | CondExpr; cmd: string; out: string; tone?: keyof typeof TONE }) => (
  <div id={p.id} when={p.when} className="flex flex-col gap-1">
    <code>$ {p.cmd}</code>
    <div className={`whitespace-pre-wrap ${TONE[p.tone ?? 'plain']}`}>{p.out}</div>
  </div>
);
