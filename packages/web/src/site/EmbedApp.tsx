/**
 * 发布站的嵌入模式（`?embed=1`，云端嵌入契约 · 方案 A「大播放按钮」）：给博客等第三方页面的 iframe 用的精简播放器。
 *
 * - 没有顶栏、左栏、层级标签、复制链接、语言菜单这类浏览外壳；画面跟随导演（不能手动切层）。
 * - 封面（默认）：起始场景的初始画面压暗，中央一个大的「播放演示」，下面是标题和场景数；底部一行「用 Joplo 制作」与“播放后可暂停、逐步、全屏”。
 *   整块封面都可以点；只有 `autoplay=1` 才跳过封面直接播放。
 * - 播放后：画面 + 字幕 + 精简控制条（上一步 · 播放 / 暂停 · 下一步 │ 步骤 2 / 5 + 进度 │ 场景切换（多个场景时）· Joplo ↗ · 全屏）。
 * - 全屏用 Fullscreen API（整个嵌入播放器）；嵌入方没给 allowfullscreen 等导致不可用或被拒时，退回为“在新标签页打开”同一个分享页（去掉 embed=1）。
 * - 键盘：空格 播放 / 暂停，← → 切步，F 全屏；控件都有可见焦点。
 * - 在 CSP `sandbox allow-scripts allow-popups allow-downloads; connect-src 'none'` 下运行：不发网络请求、不依赖存储（语言记忆读写失败已容错），
 *   链接一律在新标签页打开（sandbox 有 allow-popups），不在 iframe 里跳转。
 * - 评审模式（`review=1`，云端契约 8.2，见 review-bridge.ts）：向外层发 ready / position / pick-result，
 *   处理外层的 goto（跳到场景和步骤、给元素描边）和 pick（选择元素：悬停虚线框，点击选中，Esc 取消）。
 *   不是评审模式时不注册 message 监听、不发任何消息。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Expand, ExternalLink, ListVideo, Pause, Play, Shrink } from 'lucide-react';
import type { Project } from '@joplo-app/core';
import { DemoController } from '../runtime/demo';
import { Stage } from '../renderer/Stage';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { resolveLook } from '../renderer/appearance';
import { StageViewport } from '../player/StageViewport';
import { Overlay } from '../player/Overlay';
import { Subtitle } from '../player/Subtitle';
import { subtitleFor } from '../player/subtitle-content';
import { coverFor, coverShown } from '../player/cover-content';
import { Curtain, curtainUp } from '../player/Curtain';
import { cameraFor, cameraPosition, withLeadFrame } from '../player/cameraFor';
import { Btn, MenuButton, useWidth } from '../player/controls';
import { pickTarget } from '../renderer/Stage';
import { JoploMark } from '../player/JoploMark';
import { translate } from '../i18n/messages';
import { useI18n } from '../i18n/context';
import { cn } from '@/lib/utils';
import { authorElement, createReviewBridge, elementLabel, type ReviewBridge, type ReviewGoto } from './review-bridge';
import { embedInitial, embedKey, embedProgress, embedScenarioItems, fullscreenAvailable, standaloneUrl, type EmbedParams } from './embed-model';

const BRAND_URL = 'https://joplo.app/';

/** 控制条随宽度收起：< 560 场景切换只剩图标、品牌只剩标志；< 400 去掉进度条。 */
const barLayout = (w: number) => ({ compact: w < 560, tiny: w < 400 });

export function EmbedApp({ project, params }: { project: Project; params: EmbedParams }) {
  const { t: i18n } = useI18n();
  const init = useMemo(() => embedInitial(project, params), [project, params]);
  // 同步建好控制器并定位到起始场景：首帧就是封面画面（服务端渲染测试也能看到）
  const ctl = useMemo(() => {
    const c = new DemoController(null);
    c.setProject(project, 1, null);
    if (init.scenarioId) c.setScenario(init.scenarioId, 0, { quiet: true });
    return c;
  }, [project, init.scenarioId]);
  ctl.i18n = i18n;
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  const [covered, setCovered] = useState(init.covered);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef<HTMLButtonElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [full, setFull] = useState(false);
  const [rowRef, rowW] = useWidth(800);
  const L = barLayout(rowW);
  const canFull = typeof document !== 'undefined' && fullscreenAvailable(document);
  // 评审模式（review=1）：选择元素模式、悬停框、外层 goto 指定的描边元素（anchor = 描边时的场景与步骤，离开后清除）
  const [picking, setPicking] = useState(false);
  const [pickBox, setPickBox] = useState<{ x: number; y: number; w: number; h: number; type: string | null; name: string } | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; scenario: string; step: number } | null>(null);
  const bridgeRef = useRef<ReviewBridge | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = i18n.site.prototypeTitle(project.name);
  }, [i18n, project.name]);
  // autoplay=1：跳过封面直接播放（只在打开时一次）；离开时停止动画
  useEffect(() => {
    if (!init.covered) void ctl.play();
    return () => ctl.stop();
  }, [ctl, init.covered]);
  useEffect(() => {
    const on = () => setFull(!!rootRef.current && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const state = snap.state;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const pos = state?.position ?? 0;
  const total = scenario?.steps.length ?? 0;
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  // 镜头：总是跟随导演（嵌入模式没有层级标签）
  const camPos = cameraPosition(scenario, pos, snap.activeStep);
  const plan = cameraFor(project, scenario?.id ?? null, camPos, snap.leadLayer);
  const camera = withLeadFrame(plan.spec, snap.leadFrame);
  const shownScene = state ? project.scenes[plan.sceneId ?? state.sceneId] : undefined;
  const device = shownScene?.viewport === 'mobile' ? 'mobile' : 'desktop';
  useLayoutEffect(() => ctl.setStageView(plan.sceneId, true), [ctl, plan.sceneId]);
  const look = resolveLook({ theme: project.theme, font: null, stroke: null }, project.themes ?? {}, i18n);
  const subtitle = subtitleFor(scenario, pos, snap.activeStep, state?.completed ?? null, i18n, project);
  // 场景封面（D61）：嵌入自己的封面（covered）显示时不叠第二层；之后回到第 0 步时与发布站一样是场景封面
  const cover = !covered && coverShown(scenario, pos, snap.playing, snap.activeStep) ? coverFor(project, scenario?.id, i18n) : null;
  const curtainOn = !!scenario && curtainUp(project, scenario.id, pos, cover);
  // 控制条的步骤与字幕右侧一致：播放中是正在播的那一步，否则是当前位置
  const shown = subtitle?.index ?? pos;
  const items = embedScenarioItems(project, snap.scenarioId);
  const reviewLayer = plan.layers.length ? plan.viewLayer : null;
  const stepId = scenario && pos > 0 ? (scenario.steps[pos - 1]?.id ?? null) : null;
  const playing = snap.playing && !snap.paused;
  const playLabel = !snap.playing ? (state?.completed ? i18n.player.replay : i18n.player.play) : snap.paused ? i18n.player.resume : i18n.player.pause;

  const start = () => {
    setCovered(false);
    void ctl.play();
  };

  // ---------- 评审模式（review=1） ----------
  const reviewHandlers = useRef<{ goto: (g: ReviewGoto) => void; pick: (active: boolean) => void }>({ goto: () => undefined, pick: () => undefined });
  reviewHandlers.current = {
    goto: (g) => {
      setCovered(false);
      ctl.setScenario(g.scenario, g.step, { quiet: true });
      setHighlight(g.highlight ? { id: g.highlight, scenario: g.scenario, step: g.step } : null);
    },
    pick: (active) => {
      setPickBox(null);
      if (!active) return setPicking(false);
      setCovered(false);
      const s = ctl.getSnapshot();
      if (s.playing && !s.paused) ctl.pause();
      setPicking(true);
      // 让 Esc 落到演示里（浏览器可能不允许 iframe 抢焦点；那时外层自己处理 Esc，发 pick active:false）
      try {
        window.focus();
        rootRef.current?.focus({ preventScroll: true });
      } catch {
        /* 忽略 */
      }
    },
  };
  useEffect(() => {
    const bridge = createReviewBridge({
      enabled: params.review,
      win: window as unknown as Parameters<typeof createReviewBridge>[0]['win'],
      project,
      onGoto: (g) => reviewHandlers.current.goto(g),
      onPick: (a) => reviewHandlers.current.pick(a),
    });
    bridgeRef.current = bridge;
    bridge?.ready();
    return () => {
      bridge?.dispose();
      bridgeRef.current = null;
    };
  }, [project, params.review]);
  // 位置：场景、步骤、层级任何一项变化时发一次（桥里去重）
  useEffect(() => {
    if (snap.scenarioId && state) bridgeRef.current?.position({ scenario: snap.scenarioId, step: pos, stepId, layer: reviewLayer });
  });
  // 描边：观众自己切到别的场景或步骤时清除
  useEffect(() => {
    if (highlight && (highlight.scenario !== snap.scenarioId || highlight.step !== pos)) setHighlight(null);
  }, [highlight, snap.scenarioId, pos]);
  // 每次渲染后重新给描边元素打标记（换层、重新挂载后仍然在）
  useEffect(() => {
    if (!stageEl) return;
    for (const el of stageEl.querySelectorAll('[data-review-highlight]')) if (!highlight || (el as HTMLElement).dataset.jid !== highlight.id) el.removeAttribute('data-review-highlight');
    if (highlight) for (const el of stageEl.querySelectorAll(`[data-jid="${CSS.escape(highlight.id)}"]`)) el.setAttribute('data-review-highlight', '');
  });
  const endPick = (element: { id: string; label: string } | null) => {
    setPicking(false);
    setPickBox(null);
    bridgeRef.current?.pickResult(element);
  };
  const pickableAt = (target: EventTarget | null): HTMLElement | null => {
    if (!stageEl || !(target instanceof HTMLElement) || !stageEl.contains(target)) return null;
    return authorElement(pickTarget(target, 'demo', true), stageEl);
  };
  const onPickMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = pickableAt(e.target);
    if (!el || !mainRef.current) return setPickBox(null);
    const box = mainRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setPickBox({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, type: el.dataset.jtype ?? null, name: elementLabel(project, plan.sceneId ?? state?.sceneId ?? null, el.dataset.jid!, el.dataset.jtype ?? null).replace(/\s+/g, ' ').trim().slice(0, 24) });
  };
  const onPickClick = (e: React.MouseEvent<HTMLElement>) => {
    // 捕获阶段拦下：选元素时点击不执行演示步骤
    if ((e.target as HTMLElement).closest?.('[data-review-ui]')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = pickableAt(e.target);
    if (!el) return;
    endPick({ id: el.dataset.jid!, label: elementLabel(project, plan.sceneId ?? state?.sceneId ?? null, el.dataset.jid!, el.dataset.jtype ?? null) });
  };
  useEffect(() => {
    if (!picking) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      endPick(null);
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  });
  // 用户点了封面之后，焦点落到播放 / 暂停（键盘用户接着用空格）；autoplay 时不抢嵌入方页面的焦点
  const focusAfterStart = useRef(false);
  useEffect(() => {
    if (!covered && focusAfterStart.current) playRef.current?.focus({ preventScroll: true });
  }, [covered]);
  const openStandalone = () => {
    const sc = scenario ?? null;
    const featureId = sc ? project.options[sc.optionId]?.featureId : null;
    const url = standaloneUrl(location.href, sc && featureId ? { featureId, scenarioId: sc.id, step: pos } : null);
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const toggleFull = () => {
    if (document.fullscreenElement) return void document.exitFullscreen?.().catch(() => undefined);
    if (!canFull || !rootRef.current) return openStandalone();
    // 嵌入方禁止全屏（或浏览器拒绝）时退回为在新标签页打开
    rootRef.current.requestFullscreen().catch(openStandalone);
  };
  const switchScenario = (id: string) => {
    ctl.setScenario(id, 0, { quiet: true });
    void ctl.play();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picking) return;
      const action = embedKey(e, e.target as HTMLElement | null, covered);
      if (!action) return;
      e.preventDefault();
      if (action === 'fullscreen') toggleFull();
      else if (action === 'toggle') {
        if (covered) {
          focusAfterStart.current = true;
          start();
        } else ctl.togglePlay();
      } else if (action === 'prev') ctl.prev();
      else void ctl.next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const brand = (
    <a
      href={BRAND_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="jb-focus flex shrink-0 items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[12px] font-semibold text-jb-fg hover:bg-jb-hover"
      aria-label={i18n.site.embedMadeWithJoplo}
      title={i18n.site.embedMadeWithJoplo}
      data-testid="embed-brand"
    >
      <JoploMark size={16} />
      {covered ? i18n.site.embedMadeWithJoplo : L.compact ? null : 'Joplo'}
      {covered ? null : <ExternalLink className="size-3 text-jb-muted" aria-hidden />}
    </a>
  );

  return (
    <div ref={rootRef} tabIndex={-1} className="relative flex h-full w-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg outline-none" data-testid="embed" data-covered={covered ? '' : undefined} data-fullscreen={full ? '' : undefined}>
      <ThemeStyles themes={project.themes} />
      <main
        ref={mainRef}
        className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', picking && 'cursor-crosshair')}
        data-review-picking={picking ? '' : undefined}
        onMouseMove={picking ? onPickMove : undefined}
        onMouseLeave={picking ? () => setPickBox(null) : undefined}
        onClickCapture={picking ? onPickClick : undefined}
        onPointerDownCapture={picking ? (e) => { if (!(e.target as HTMLElement).closest?.('[data-review-ui]')) e.preventDefault(); } : undefined}
      >
        {scenario && state && shownScene ? (
          // 封面显示时画面只是背景：inert，Tab 不会落到被遮住的原型元素上
          <div className="flex min-h-0 flex-1 flex-col" inert={covered || undefined} data-testid="embed-stage">
          <StageViewport viewport={device} theme={project.theme} stroke={look.stroke} font={look.font} notice={covered ? null : snap.notice} onDismiss={() => ctl.dismissNotice()} onBack={() => ctl.backToDemo()} curtainUp={curtainOn} curtain={(size) => <Curtain project={project} scenarioId={scenario.id} position={pos} cover={cover} onStart={() => void ctl.play({ fromStart: true })} theme={project.theme} font={look.font} width={size.width} height={size.height} animate={!ctl.reducedMotion} />}>
            {(size) => (
              <Stage
                viewportOverride={device === 'mobile' ? null : size}
                project={project}
                state={state}
                theme={project.theme}
                camera={camera}
                sceneId={plan.sceneId}
                mode="demo"
                preview={snap.preview}
                activeStep={snap.activeStep}
                stream={snap.streamAt ? { ...snap.streamAt, paused: snap.paused } : null}
                epoch={snap.epoch}
                animate={!ctl.reducedMotion}
                nextTargetId={covered ? null : nextTargetId}
                onNodeClick={(id, pt) => void ctl.clickNode(id, pt)}
                stageRef={(el) => {
                  ctl.setStageEl(el);
                  setStageEl(el);
                }}
                overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={nextTargetId} setCursorEl={ctl.setCursorEl} onBackToDemo={() => ctl.backToDemo()} onDismiss={() => ctl.dismissNotice()} />}
              />
            )}
          </StageViewport>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[14px] text-jb-muted" data-testid="embed-empty">
            {i18n.site.embedNoScenario}
          </div>
        )}
        {snap.playbackError && !covered ? (
          <div role="alert" className="absolute inset-x-3 top-3 z-30 rounded-[8px] border border-jb-danger bg-jb-danger-bg px-3 py-2 text-[13px] text-jb-danger" data-testid="playback-error">
            <strong>{i18n.player.demoReplayFailed}</strong>
            {translate(snap.playbackError, i18n)}
          </div>
        ) : null}
        {picking ? (
          <div data-review-ui="" className="absolute left-1/2 top-3 z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-jb-ink bg-jb-inverse py-1 pl-3.5 pr-1 text-[13px] font-medium text-jb-on-inverse shadow-[2px_2px_0_rgba(30,30,30,0.18)]" role="status" data-testid="review-pick-hint">
            <span className="min-w-0 truncate">{i18n.site.reviewPickHint}</span>
            <button type="button" onClick={() => endPick(null)} className="jb-focus shrink-0 rounded-full px-2.5 py-0.5 text-[12px] hover:bg-white/15" data-testid="review-pick-cancel">
              {i18n.site.reviewPickCancel}
            </button>
          </div>
        ) : null}
        {picking && pickBox ? (
          <div className="pointer-events-none absolute z-30 border-[1.5px] border-dashed border-jb-ink" style={{ left: pickBox.x - 3, top: pickBox.y - 3, width: pickBox.w + 6, height: pickBox.h + 6 }} data-testid="review-pick-hover">
            <span className="absolute -top-[22px] left-[-1.5px] whitespace-nowrap rounded-[4px] bg-jb-inverse px-1.5 py-0.5 font-jb text-[11px] font-medium text-jb-on-inverse">
              {pickBox.type ?? i18n.player.element}{pickBox.name ? ` · ${pickBox.name}` : ''}
            </span>
          </div>
        ) : null}
        {covered && scenario ? (
          // 封面：整块可点；画面压暗，中央的大播放按钮一眼看得出“点这里播放”
          <button
            type="button"
            onClick={() => {
              focusAfterStart.current = true;
              start();
            }}
            aria-label={`${i18n.site.embedPlayDemo} · ${project.name}`}
            data-testid="embed-cover"
            className="group absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-3 bg-[rgba(24,24,24,0.55)] px-6 text-center text-white outline-none"
          >
            <span
              className="flex items-center gap-2.5 rounded-full border-[1.5px] border-jb-ink bg-jb-accent px-7 py-3.5 text-[20px] font-bold leading-none text-jb-on-accent transition-colors group-hover:bg-jb-accent-hover group-active:bg-jb-accent-press group-focus-visible:outline-[3px] group-focus-visible:outline-offset-4 group-focus-visible:outline-white group-focus-visible:[outline-style:solid]"
              data-testid="embed-play"
            >
              <Play className="size-6 fill-current" aria-hidden />
              {i18n.site.embedPlayDemo}
            </span>
            <span className="max-w-full truncate text-[18px] font-bold leading-7" data-testid="embed-title">
              {project.name}
            </span>
            <span className="text-[13px] opacity-85">{i18n.site.embedCoverMeta(items.length)}</span>
          </button>
        ) : null}
      </main>
      {covered || !scenario ? (
        <div ref={rowRef} className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-jb-line bg-jb-surface px-2.5" data-testid="embed-cover-footer">
          {brand}
          {scenario && !L.compact ? <span className="min-w-0 truncate text-[12px] text-jb-muted">{i18n.site.embedCoverHint}</span> : null}
        </div>
      ) : (
        <>
          <Subtitle content={subtitle} theme={project.theme} font={look.font} onFork={(f) => ctl.setScenario(f.scenarioId, f.at)} framed divider />
          <div ref={rowRef} className="flex h-12 shrink-0 items-center gap-1.5 border-t border-jb-line bg-jb-surface px-2" role="toolbar" aria-label={i18n.site.embedPlayer} data-testid="embed-bar">
            <Btn icon={<ChevronLeft className="size-4" />} label={i18n.player.previousStep} kbd="←" iconOnly variant="ghost" size={32} onClick={() => ctl.prev()} disabled={pos === 0 && !snap.busy} data-testid="embed-prev" />
            <Btn ref={playRef} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} label={playLabel} kbd={i18n.player.space} iconOnly variant="play" size={32} onClick={() => ctl.togglePlay()} disabled={total === 0} data-testid="embed-toggle" />
            <Btn icon={<ChevronRight className="size-4" />} label={i18n.player.nextStep} kbd="→" iconOnly variant="ghost" size={32} onClick={() => void ctl.next()} disabled={total === 0} data-testid="embed-next" />
            <span className="shrink-0 whitespace-nowrap px-1 text-[13px] font-semibold" data-testid="embed-step">
              {i18n.site.embedStepProgress(shown, total)}
            </span>
            {L.tiny ? (
              <span className="flex-1" />
            ) : (
              <div className="mx-1 h-1.5 min-w-[40px] flex-1 overflow-hidden rounded-full bg-jb-line" role="progressbar" aria-label={i18n.site.embedStepProgress(shown, total)} aria-valuemin={0} aria-valuemax={total} aria-valuenow={shown} data-testid="embed-progress">
                <div className="h-full rounded-full bg-jb-accent-press transition-[width] duration-300" style={{ width: `${embedProgress(shown, total) * 100}%` }} />
              </div>
            )}
            {items.length > 1 ? (
              <MenuButton
                trigger={L.compact ? { icon: <ListVideo className="size-4" /> } : { label: scenario.name, iconOnly: false }}
                label={i18n.site.embedSwitchScenario}
                testid="embed-scenarios"
                items={items.map((it) => ({ id: `scenario-${it.id}`, label: it.label, checked: it.current, onClick: () => switchScenario(it.id) }))}
                placement="top-end"
                variant="ghost"
                size={32}
                width={260}
                className={cn(!L.compact && 'max-w-[220px] px-2 text-[13px] [&>span:first-child]:truncate')}
              />
            ) : L.compact ? null : (
              <span className="min-w-0 max-w-[220px] truncate px-1 text-[13px] text-jb-muted" data-testid="embed-scenario-name">
                {scenario.name}
              </span>
            )}
            {brand}
            <Btn
              icon={canFull ? full ? <Shrink className="size-4" /> : <Expand className="size-4" /> : <ExternalLink className="size-4" />}
              label={canFull ? (full ? i18n.player.exitFullscreen : i18n.player.fullscreen) : i18n.site.embedOpenInNewTab}
              kbd={full ? 'Esc' : 'F'}
              iconOnly
              variant="default"
              size={32}
              onClick={(e) => {
                e.currentTarget.blur();
                toggleFull();
              }}
              data-testid="embed-fullscreen"
              data-fallback={canFull ? undefined : 'new-tab'}
            />
          </div>
        </>
      )}
    </div>
  );
}
