/**
 * 角色头像（D56 / D61）：角色色的圆，里面是名字的首字。字幕里的说话人、换人的过渡卡共用，与层级标签上的头像同一来源（RoleInfo）。
 */
import type { RoleInfo } from '@joplo-app/core';

const initial = (name: string) => [...name.trim()][0] ?? '?';

/** 次级文字色（系统事件的说明、封面说明、过渡卡副标题）：只由舞台的 --jp-ink 与 --jp-bg 混出来，跟随主题。 */
export const JP_SECONDARY = 'color-mix(in srgb, var(--jp-ink) 70%, var(--jp-bg))';

export function RoleAvatar({ role, size }: { role: RoleInfo; size: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white" style={{ width: size, height: size, background: role.color, fontSize: Math.round(size * 0.46) }} data-role-avatar={role.id}>
      {initial(role.name)}
    </span>
  );
}
