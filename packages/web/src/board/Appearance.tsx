import type { Text } from '../i18n/messages';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/board/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 外观按钮与外观浮层（D55 + @tokenroll/juice v0.2.0 SwatchGridPicker）：配色 / 字体 / 线条分开选。
 * - 配色网格直接采用 SwatchGridPicker（role="radiogroup"、columns=5、renderPreview 迷你舞台缩略图、悬停 150ms 预览与移开回退）。
 * - 字体卡片与线条分段均采用无重黑框同心色阶板与轻触音效。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, Info, PenLine, Plus, RotateCcw, Square, Wand2 } from 'lucide-react';
import { SwatchGridPicker, playJuiceSound, type SwatchPalette } from '@tokenroll/juice/primitives';
import { cn } from '@/lib/utils';
import { Btn, Kbd } from '../player/controls';
import { Popover } from '../player/popover';
import { FONT_STACKS, type Look } from '../renderer/appearance';
import type { ThemeInfo } from '../renderer/themes';
import type { BoardSettings } from '../runtime/dev-client';
import { FONT_CHOICES, STROKE_CHOICES, THEME_TEMPLATE, appearanceLabel, appearanceMessage, applyAppearance, isCellSelected, paletteCells, resetAppearance, setAsDefault, themeLine, themeSwatch, themeToWrite, type LookPatch, type PaletteCell, type Scope } from './appearance-model';

const PREVIEW_DELAY = 150;

/** 三个小色块（对齐 Juice .j-tri-swatch）：底色、墨色、强调色。 */
export function Swatch({ css, className }: { css: string; className?: string }) {
  const s = themeSwatch(css);
  return (
    <span aria-hidden className={cn('j-tri-swatch h-4 w-[22px] rounded-[5px]', className)}>
      <span style={{ background: s.bg }} />
      <span style={{ background: s.ink }} />
      <span style={{ background: s.accent }} />
    </span>
  );
}

/** 字体 / 线条组的方向键聚焦切换。 */
function onGroupKey(e: React.KeyboardEvent<HTMLDivElement>) {
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
    <section className={cn('flex flex-col gap-2 px-4 pb-3 pt-2.5', !first && 'border-t border-[var(--juice-edge)]')}>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold tracking-[1px] text-jb-muted">{title}</span>
        {right ? <span className="text-jb-faint">{right}</span> : null}
      </div>
      {children}
    </section>
  );
}

type ThemePaletteItem = SwatchPalette & {
  cell: PaletteCell;
  swatch: ReturnType<typeof themeSwatch>;
};

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
  save: (next: BoardSettings) => Promise<{ ok: true } | { ok: false; message: Text }>;
  /** 临时预览（null = 撤掉预览）。 */
  onPreview: (look: Look | null) => void;
  onFlash: (msg: ReactNode) => void;
  copy: (text: string) => Promise<boolean>;
};

export function AppearancePopover(p: AppearanceProps) {
  const { t: i18n } = useBoardI18n();

  const { look } = p;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  // 关闭时撤掉预览（点外面、Esc、再按 T）
  useEffect(() => {
    if (!p.open) {
      clearTimer();
      setPreviewId(null);
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
  const cells = useMemo(() => paletteCells(p.catalog, i18n), [p.catalog, i18n]);
  const palettes = useMemo<ThemePaletteItem[]>(
    () =>
      cells.map((cell) => {
        const swatch = themeSwatch(cell.css);
        return {
          id: cell.id,
          label: cell.title,
          colors: [swatch.bg, swatch.ink, swatch.accent] as const,
          cell,
          swatch,
        };
      }),
    [cells],
  );
  const selectedCellId = cells.find((c) => isCellSelected(c, look.theme))?.id ?? cells[0]?.id ?? '';
  const authorFiles = cells.filter((c) => c.title.endsWith('*')).map((c) => `themes/${c.id}.css`);

  const preview = (patch: LookPatch, now = false) => {
    clearTimer();
    const run = () => p.onPreview({ ...look, ...patch } as Look);
    if (now) run();
    else timer.current = setTimeout(run, PREVIEW_DELAY);
  };
  const unpreview = () => {
    clearTimer();
    setPreviewId(null);
    p.onPreview(null);
  };
  const apply = async (patch: LookPatch, msg: string) => {
    clearTimer();
    setPreviewId(null);
    playJuiceSound('tap');
    const r = await p.save(applyAppearance(p.settings, p.scope, p.projectId, patch));
    p.onPreview(null);
    if (!r.ok) p.onFlash(<LocalText value={m.board.couldNotSave(r.message)} />);
    else if (msg) p.onFlash(<LocalText value={msg} />);
  };
  const cellProps = (patch: LookPatch, onPick: () => void) => ({
    'data-cell': '',
    onMouseEnter: () => preview(patch),
    onMouseLeave: unpreview,
    onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && preview(patch, true),
    onClick: onPick,
  });

  const scopeText = p.scope === 'project' && p.projectId ? i18n.board.thisProjectOnly : i18n.board.defaultForAllProjects;
  return (
    <Popover open={p.open} anchor={p.anchor} onClose={p.onClose} placement="bottom-end" width={404} label={i18n.board.appearance} testid="appearance-popover" onKeyDown={onGroupKey} onMouseLeave={unpreview}>
      <div className="flex flex-col font-jb text-jb-fg">
        <header className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[16px] font-bold">{i18n.board.appearance}</h2>
            <span className="text-[12px] text-jb-muted" data-testid="appearance-scope">
              {scopeText}
            </span>
          </div>
          <Kbd>T</Kbd>
        </header>

        <Section first title={i18n.board.colors} right={authorFiles.length ? i18n.board.authorTheme(i18n.player.list(authorFiles)) : undefined}>
          <SwatchGridPicker
            role="radiogroup"
            aria-label={i18n.board.colors}
            columns={5}
            palettes={palettes}
            value={selectedCellId}
            preview={previewId}
            onPreview={(id) => {
              setPreviewId(id);
              const found = id ? cells.find((c) => c.id === id) : null;
              p.onPreview(found ? ({ ...look, theme: found.names[0] } as Look) : null);
            }}
            onCommit={(id) => {
              const found = cells.find((c) => c.id === id);
              if (!found) return;
              const write = themeToWrite(found, look.theme);
              if (write) void apply({ theme: write }, '');
              else unpreview();
            }}
            getCellProps={(palette) => ({
              'data-cell': '',
              'data-testid': `theme-${palette.id}`,
              title: palette.cell.names.join(' / '),
              className: 'jb-focus rounded-[11px] p-1.5 text-[11.5px]',
            })}
            renderPreview={(palette) => (
              <span
                className="flex h-[40px] w-full flex-col gap-1 rounded-[7px] p-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                style={{ background: palette.swatch.bg }}
                aria-hidden="true"
              >
                <span className="h-[4.5px] w-6 rounded-[2px]" style={{ background: palette.swatch.ink }} />
                <span className="h-1 w-9 max-w-full rounded-[2px]" style={{ background: palette.swatch.line }} />
                <span className="mt-auto flex items-center gap-1">
                  <span className="h-[8px] w-[20px] rounded-[2.5px]" style={{ background: palette.swatch.ink }} />
                  <span className="size-[8px] rounded-full" style={{ background: palette.swatch.accent }} />
                </span>
              </span>
            )}
            trailingCell={
              <button
                type="button"
                data-cell=""
                data-testid="theme-custom"
                title={i18n.board.copyThemeTemplateSaveAsThemesNameCssIn}
                onClick={() => {
                  playJuiceSound('pop');
                  void p.copy(THEME_TEMPLATE(i18n)).then((ok) => p.onFlash(<LocalText value={ok ? m.board.themeTemplateCopiedSaveAsThemesNameCssSee : m.board.clipboardUnavailable} />));
                }}
                className="j-swatch-cell jb-focus flex-col items-stretch gap-[5px] rounded-[11px] p-1.5 text-left text-[11.5px]"
              >
                <span className="flex h-[40px] w-full items-center justify-center rounded-[7px] bg-[var(--juice-w6)] text-jb-muted shadow-[inset_0_0_0_1px_var(--juice-edge)]">
                  <Plus className="size-4" aria-hidden />
                </span>
                <span className="truncate text-jb-muted">{i18n.board.custom}</span>
              </button>
            }
          />
        </Section>

        <Section title={i18n.board.font} right={i18n.board.appliesToTheStageAndCaptions}>
          <div role="radiogroup" aria-label={i18n.board.font} className="grid grid-cols-3 gap-2" data-cell-group="" data-cols="3">
            {FONT_CHOICES(i18n).map((f) => {
              const on = look.font === f.value;
              return (
                <button
                  key={f.value ?? 'auto'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-selected={on}
                  data-testid={`font-${f.value ?? 'auto'}`}
                  {...cellProps({ font: f.value }, () => (on ? unpreview() : void apply({ font: f.value }, '')))}
                  className={cn(
                    'j-swatch-cell jb-focus flex h-[54px] min-w-0 flex-col items-start justify-center gap-0.5 rounded-[12px] px-3 text-left',
                    on && 'bg-[color-mix(in_srgb,var(--jb-accent)_26%,var(--jb-bg-surface))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--jb-accent-press)_35%,transparent)]',
                  )}
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

        <Section title={i18n.board.strokes}>
          <div role="radiogroup" aria-label={i18n.board.strokes} className="j-seg flex h-9 w-full items-center rounded-[11px] p-[3px]" data-cell-group="" data-cols="3">
            {STROKE_CHOICES(i18n).map((k) => {
              const on = look.stroke === k.value;
              const Icon = k.value === 'rough' ? PenLine : k.value === 'clean' ? Square : Wand2;
              return (
                <button
                  key={k.value ?? 'auto'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-active={on ? 'true' : undefined}
                  data-testid={`stroke-${k.value ?? 'auto'}`}
                  {...cellProps({ stroke: k.value }, () => (on ? unpreview() : void apply({ stroke: k.value }, '')))}
                  className={cn('j-seg-btn jb-focus h-full flex-1 justify-center gap-1.5 whitespace-nowrap rounded-[8px] text-[13px]', on && 'font-semibold')}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {k.name}
                </button>
              );
            })}
          </div>
        </Section>

        <footer className="flex flex-col gap-2.5 rounded-b-[18px] border-t border-[var(--juice-edge)] bg-[var(--juice-w4)] px-4 pb-3.5 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Btn
              icon={<RotateCcw className="size-3.5" />}
              label={p.scope === 'project' && p.projectId ? i18n.board.resetToProjectDefault(p.configTheme) : i18n.board.clearChoicesForAllProjects}
              variant="ghost"
              size={28}
              sound="tap"
              className="max-w-full font-normal text-jb-muted [&_[data-jb-label]]:truncate"
              onClick={() => void p.save(resetAppearance(p.settings, p.scope, p.projectId)).then((r) => p.onFlash(<LocalText value={r.ok ? (p.scope === 'project' ? m.board.projectDefaultRestored(p.configTheme) : m.board.appearanceChoicesClearedForAllProjects) : m.board.couldNotSave(r.message)} />))}
              data-testid="appearance-reset"
            />
            {p.scope === 'project' && p.projectId ? (
              <Btn label={i18n.board.setAsDefaultForAllProjects} sound="tap" className="max-w-full [&_[data-jb-label]]:truncate" size={28} onClick={() => void p.save(setAsDefault(p.settings, p.projectId, look)).then((r) => p.onFlash(<LocalText value={r.ok ? m.board.allProjectsNowUseExceptProjectsWithTheirOwn(appearanceMessage(look, p.catalog)) : m.board.couldNotSave(r.message)} />))} data-testid="appearance-default" />
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <Info className="size-3.5 shrink-0 text-jb-faint" aria-hidden />
            <span className="min-w-0 flex-1 text-jb-faint">{i18n.board.thePublishedSiteUsesThemeFromJoploConfigTs}</span>
            <button
              type="button"
              className="jb-focus inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 font-medium text-jb-fg transition-colors hover:bg-[var(--juice-w6)]"
              onClick={() => {
                playJuiceSound('pop');
                void p.copy(themeLine(look.theme)).then((ok) => p.onFlash(<LocalText value={ok ? m.board.copiedPasteIntoJoploConfigTs(themeLine(look.theme)) : m.board.clipboardUnavailable} />));
              }}
              data-testid="appearance-copy-theme"
            >
              <Copy className="size-3" aria-hidden />
              {i18n.board.copyTheme}</button>
          </div>
        </footer>
      </div>
    </Popover>
  );
}

/** 外观按钮：三个小色块 + “外观 · 名字”（窄屏只剩色块）；按 T 开关浮层。 */
export function AppearanceButton({ look, catalog, wide, open, onToggle, btnRef, scopeLabel, variant = 'default' }: { look: Look; catalog: ThemeInfo[]; wide: boolean; open: boolean; onToggle: () => void; btnRef: (el: HTMLButtonElement | null) => void; /** 首页写“所有项目”（D55「首页」顶栏：外观 · 所有项目）。 */ scopeLabel?: string; /** 全屏控制胶囊里用 ghost。 */ variant?: 'default' | 'ghost' }) {
  const { t: i18n } = useBoardI18n();

  const css = catalog.find((t) => t.name === look.theme)?.css ?? '';
  const name = scopeLabel ?? appearanceLabel(look, catalog, i18n);
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
    <Btn data-full-label={i18n.board.appearanceButtonLabel(name)} ref={btnRef} variant={variant} sound="tap" icon={<Swatch css={css} />} label={wide ? i18n.board.appearanceButtonLabel(name) : i18n.board.appearance} iconOnly={!wide} title={wide ? undefined : i18n.board.appearanceButtonLabel(name)} kbd="T" selected={open} aria-haspopup="dialog" aria-expanded={open} onClick={onToggle} data-testid="appearance" data-appearance={`${look.theme}|${look.font ?? ''}|${look.stroke ?? ''}`} />
  );
}
