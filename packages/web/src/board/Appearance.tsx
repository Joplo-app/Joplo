/**
 * 外观按钮与外观浮层（D55「演示页 · 外观已打开」「交互约定」）：配色 / 字体 / 线条分开选。
 * - 打开：按钮或 T；关闭：点外面或 Esc（Esc 同时撤掉预览，恢复预览前的外观）。浮层是 e1（portal），盖在画面右上方，不压缩布局。
 * - 应用：点一下立即应用并保存（useBoardSettings.save → PUT /__joplo/settings）。范围：演示页里只改这个项目；首页是所有项目。
 * - 预览：悬停 150ms 临时预览（onPreview，不保存），移开恢复；键盘方向键移动焦点同样预览，Enter 应用。
 * - 「恢复项目默认」「设为所有项目的默认」；底部写明发布站只用 joplo.config.ts 的 theme（字体与线条暂不发布），并提供“复制 theme”。
 * 模型（读取、写入、配色格）在 appearance-model.ts。创作侧，不进发布站。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Info, PenLine, Plus, RotateCcw, Square, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, Kbd } from '../player/controls';
import { Popover } from '../player/popover';
import { FONT_STACKS, type Look } from '../renderer/appearance';
import type { ThemeInfo } from '../renderer/themes';
import type { BoardSettings } from '../runtime/dev-client';
import { FONT_CHOICES, STROKE_CHOICES, THEME_TEMPLATE, appearanceLabel, applyAppearance, isCellSelected, paletteCells, resetAppearance, setAsDefault, themeLine, themeSwatch, themeToWrite, type LookPatch, type Scope } from './appearance-model';

const PREVIEW_DELAY = 150;

/** 三个小色块：底色、墨色、强调色。 */
export function Swatch({ css, className }: { css: string; className?: string }) {
  const s = themeSwatch(css);
  return (
    <span aria-hidden className={cn('flex h-4 w-[22px] shrink-0 overflow-hidden rounded-[4px] border border-jb-line', className)}>
      <span className="flex-1" style={{ background: s.bg }} />
      <span className="flex-1" style={{ background: s.ink }} />
      <span className="flex-1" style={{ background: s.accent }} />
    </span>
  );
}

/** 键盘：方向键在同一组里移动（上下按列数跳），焦点移到哪就预览哪；Enter / 空格由按钮自己应用。 */
function onGridKey(e: React.KeyboardEvent<HTMLDivElement>) {
  const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up' } as Record<string, number | 'down' | 'up'>)[e.key];
  if (!d) return;
  const t = e.target as HTMLElement;
  const group = t.closest<HTMLElement>('[data-cell-group]');
  if (!group) return;
  const cells = [...group.querySelectorAll<HTMLElement>('[data-cell]')];
  const i = cells.indexOf(t.closest<HTMLElement>('[data-cell]')!);
  if (i < 0) return;
  const cols = Number(group.dataset.cols ?? cells.length);
  const n = d === 'down' ? i + cols : d === 'up' ? i - cols : i + (d as number);
  const next = cells[Math.max(0, Math.min(cells.length - 1, n))];
  e.preventDefault();
  next?.focus();
}

function Section({ title, right, children, first }: { title: string; right?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section className={cn('flex flex-col gap-2 px-4 pb-3 pt-2', !first && 'border-t border-jb-line')}>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold tracking-[1px] text-jb-muted">{title}</span>
        {right ? <span className="text-jb-faint">{right}</span> : null}
      </div>
      {children}
    </section>
  );
}

export type AppearanceProps = {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  scope: Scope;
  projectId: string | null;
  /** 项目 config 的主题（「恢复项目默认」里显示）。 */
  configTheme: string;
  catalog: ThemeInfo[];
  settings: BoardSettings | null;
  /** 当前（已保存的）外观。 */
  look: Look;
  save: (next: BoardSettings) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** 临时预览（null = 撤掉预览）。 */
  onPreview: (look: Look | null) => void;
  onFlash: (msg: string) => void;
  copy: (text: string) => Promise<boolean>;
};

export function AppearancePopover(p: AppearanceProps) {
  const { look } = p;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  // 关闭时撤掉预览（点外面、Esc、再按 T）
  useEffect(() => {
    if (!p.open) {
      clearTimer();
      p.onPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);
  // 打开时聚焦当前选中的配色（不聚焦第一格：键盘聚焦会触发预览）
  useEffect(() => {
    if (!p.open) return;
    const id = requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="appearance-popover"] [data-cell][aria-checked="true"]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [p.open]);
  const cells = paletteCells(p.catalog);
  const authorFiles = cells.filter((c) => c.title.endsWith('*')).map((c) => `themes/${c.id}.css`);

  const preview = (patch: LookPatch, now = false) => {
    clearTimer();
    const run = () => p.onPreview({ ...look, ...patch } as Look);
    if (now) run();
    else timer.current = setTimeout(run, PREVIEW_DELAY);
  };
  const unpreview = () => {
    clearTimer();
    p.onPreview(null);
  };
  const apply = async (patch: LookPatch, msg: string) => {
    clearTimer();
    const r = await p.save(applyAppearance(p.settings, p.scope, p.projectId, patch));
    p.onPreview(null);
    if (!r.ok) p.onFlash(`保存失败：${r.message}`);
    else if (msg) p.onFlash(msg);
  };
  // 一格的公共属性：悬停 150ms 预览、聚焦（键盘）立即预览、点击应用
  const cellProps = (patch: LookPatch, onPick: () => void) => ({
    'data-cell': '',
    onMouseEnter: () => preview(patch),
    onMouseLeave: unpreview,
    onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && preview(patch, true),
    onClick: onPick,
  });

  const scopeText = p.scope === 'project' && p.projectId ? '只改这个项目' : '所有项目的默认';
  return (
    <Popover open={p.open} anchor={p.anchor} onClose={p.onClose} placement="bottom-end" width={392} label="外观" testid="appearance-popover" onKeyDown={onGridKey} onMouseLeave={unpreview}>
      <div className="flex flex-col font-jb text-jb-fg">
        <header className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-bold">外观</h2>
            <span className="text-[12px] text-jb-muted" data-testid="appearance-scope">
              {scopeText}
            </span>
          </div>
          <Kbd>T</Kbd>
        </header>

        <Section first title="配色" right={authorFiles.length ? `* 作者主题 ${authorFiles.join('、')}` : undefined}>
          <div role="radiogroup" aria-label="配色" className="grid grid-cols-5 gap-[7px]" data-cell-group="" data-cols="5">
            {cells.map((c) => {
              const on = isCellSelected(c, look.theme);
              const sw = themeSwatch(c.css);
              const write = themeToWrite(c, look.theme);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`theme-${c.id}`}
                  title={c.names.join(' / ')}
                  {...cellProps({ theme: c.names[0] }, () => (write ? void apply({ theme: write }, '') : unpreview()))}
                  className="jb-focus group flex min-w-0 flex-col gap-[5px] rounded-[8px] text-left"
                >
                  <span className={cn('flex h-[42px] w-full flex-col gap-1 rounded-[7px] p-[7px]', on ? 'outline-2 outline-jb-ink' : 'outline-1 outline-jb-line group-hover:outline-jb-ink')} style={{ background: sw.bg, outlineStyle: 'solid' }}>
                    <span className="h-[5px] w-7 rounded-[2px]" style={{ background: sw.ink }} />
                    <span className="h-1 w-10 max-w-full rounded-[2px]" style={{ background: sw.line }} />
                    <span className="flex items-center gap-1">
                      <span className="h-[9px] w-[22px] rounded-[2px]" style={{ background: sw.ink }} />
                      <span className="size-[9px] rounded-full" style={{ background: sw.accent }} />
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    {on ? (
                      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-jb-ink bg-jb-accent">
                        <Check className="size-2.5" strokeWidth={3} aria-hidden />
                      </span>
                    ) : null}
                    <span className={cn('truncate text-[12px]', on ? 'font-semibold text-jb-fg' : 'text-jb-muted')}>{c.title}</span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              data-cell=""
              data-testid="theme-custom"
              title="复制主题模板：保存为项目里的 themes/<名字>.css，再在 joplo.config.ts 写 theme: '<名字>'（说明见 docs/themes.md）"
              onClick={() => void p.copy(THEME_TEMPLATE).then((ok) => p.onFlash(ok ? '已复制主题模板：保存为 themes/<名字>.css（说明见 docs/themes.md）' : '无法访问剪贴板'))}
              className="jb-focus group flex min-w-0 flex-col gap-[5px] rounded-[8px] text-left"
            >
              <span className="flex h-[42px] w-full items-center justify-center rounded-[7px] bg-jb-subtle text-jb-muted outline-1 outline-jb-line group-hover:outline-jb-ink" style={{ outlineStyle: 'solid' }}>
                <Plus className="size-4" aria-hidden />
              </span>
              <span className="text-[12px] text-jb-muted">自定义</span>
            </button>
          </div>
        </Section>

        <Section title="字体" right="画面、字幕一起换">
          <div role="radiogroup" aria-label="字体" className="grid grid-cols-3 gap-2" data-cell-group="" data-cols="3">
            {FONT_CHOICES.map((f) => {
              const on = look.font === f.value;
              return (
                <button
                  key={f.value ?? 'auto'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`font-${f.value ?? 'auto'}`}
                  {...cellProps({ font: f.value }, () => (on ? unpreview() : void apply({ font: f.value }, '')))}
                  className={cn('jb-focus flex h-[50px] min-w-0 flex-col justify-center gap-0.5 rounded-[8px] px-2.5 text-left', on ? 'border-[1.5px] border-jb-ink bg-jb-selected' : 'border border-jb-line bg-jb-surface hover:bg-jb-hover')}
                >
                  <span className={cn('flex items-center gap-1 truncate leading-5', f.value ? 'text-[18px] text-jb-fg' : 'text-[15px] text-jb-muted')} style={f.value ? { fontFamily: FONT_STACKS[f.value] } : undefined}>
                    {f.value ? null : <Wand2 className="size-3.5" aria-hidden />}
                    {f.sample}
                  </span>
                  <span className={cn('truncate text-[12px] text-jb-fg', on ? 'font-semibold' : 'font-medium')}>{f.name}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="线条">
          <div role="radiogroup" aria-label="线条" className="flex h-9 items-center gap-[3px] rounded-[8px] bg-jb-sunken p-[3px]" data-cell-group="" data-cols="3">
            {STROKE_CHOICES.map((k) => {
              const on = look.stroke === k.value;
              const Icon = k.value === 'rough' ? PenLine : k.value === 'clean' ? Square : Wand2;
              return (
                <button
                  key={k.value ?? 'auto'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`stroke-${k.value ?? 'auto'}`}
                  {...cellProps({ stroke: k.value }, () => (on ? unpreview() : void apply({ stroke: k.value }, '')))}
                  className={cn('jb-focus flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] text-[13px]', on ? 'border-[1.5px] border-jb-ink bg-jb-surface font-semibold text-jb-fg' : 'text-jb-muted hover:text-jb-fg')}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {k.name}
                </button>
              );
            })}
          </div>
        </Section>

        <footer className="flex flex-col gap-2.5 rounded-b-[9px] border-t border-jb-line bg-jb-subtle px-4 pb-3.5 pt-3">
          <div className="flex items-center justify-between gap-2">
            <Btn
              icon={<RotateCcw className="size-3.5" />}
              label={p.scope === 'project' && p.projectId ? `恢复项目默认（${p.configTheme}）` : '清除所有项目的选择'}
              variant="ghost"
              size={28}
              className="font-normal text-jb-muted"
              onClick={() => void p.save(resetAppearance(p.settings, p.scope, p.projectId)).then((r) => p.onFlash(r.ok ? (p.scope === 'project' ? `已恢复项目默认（${p.configTheme}）` : '已清除所有项目的外观选择') : `保存失败：${r.message}`))}
              data-testid="appearance-reset"
            />
            {p.scope === 'project' && p.projectId ? (
              <Btn label="设为所有项目的默认" size={28} onClick={() => void p.save(setAsDefault(p.settings, p.projectId, look)).then((r) => p.onFlash(r.ok ? `所有项目改用 ${appearanceLabel(look, p.catalog)}（单独设置过的项目除外）` : `保存失败：${r.message}`))} data-testid="appearance-default" />
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <Info className="size-3.5 shrink-0 text-jb-faint" aria-hidden />
            <span className="min-w-0 flex-1 text-jb-faint">发布站只用 joplo.config.ts 的 theme，字体和线条暂不发布</span>
            <button type="button" className="jb-focus inline-flex shrink-0 items-center gap-1 rounded-[4px] font-medium text-jb-fg underline-offset-2 hover:underline" onClick={() => void p.copy(themeLine(look.theme)).then((ok) => p.onFlash(ok ? `已复制 ${themeLine(look.theme)}（粘进 joplo.config.ts）` : '无法访问剪贴板'))} data-testid="appearance-copy-theme">
              <Copy className="size-3" aria-hidden />
              复制 theme
            </button>
          </div>
        </footer>
      </div>
    </Popover>
  );
}

/** 外观按钮：三个小色块 + “外观 · 名字”（窄屏只剩色块）；按 T 开关浮层。 */
export function AppearanceButton({ look, catalog, wide, open, onToggle, btnRef, scopeLabel, variant = 'default' }: { look: Look; catalog: ThemeInfo[]; wide: boolean; open: boolean; onToggle: () => void; btnRef: (el: HTMLButtonElement | null) => void; /** 首页写“所有项目”（D55「首页」顶栏：外观 · 所有项目）。 */ scopeLabel?: string; /** 全屏控制胶囊里用 ghost。 */ variant?: 'default' | 'ghost' }) {
  const css = catalog.find((t) => t.name === look.theme)?.css ?? '';
  const name = scopeLabel ?? appearanceLabel(look, catalog);
  // T 开关（输入框、修饰键、菜单里不触发）
  const toggle = useRef(onToggle);
  toggle.current = onToggle;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key !== 't' && e.key !== 'T') || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input,textarea,select,[contenteditable],[role="menu"]')) return;
      e.preventDefault();
      toggle.current();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <Btn ref={btnRef} variant={variant} icon={<Swatch css={css} />} label={wide ? `外观 · ${name}` : '外观'} iconOnly={!wide} title={wide ? undefined : `外观 · ${name}`} kbd="T" selected={open} aria-haspopup="dialog" aria-expanded={open} onClick={onToggle} data-testid="appearance" data-appearance={`${look.theme}|${look.font ?? ''}|${look.stroke ?? ''}`} />
  );
}

