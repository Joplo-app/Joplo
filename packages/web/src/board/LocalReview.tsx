import { useEffect, useRef, useState } from 'react';
import { Check, MessageSquare, Send, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Collapsible,
  CopySnippet,
  CornerSnapOrb,
  Spinner,
  Textarea,
  playJuiceSound,
} from '@tokenroll/juice/primitives';
import { LOCAL_REVIEW_MAX_BODY, localReviewStatus, type LocalReviewLocation, type LocalReviewState, type LocalReviewWrite, type Project } from '@joplo-app/core/runtime';
import { Btn } from '../player/controls';
import { Popover } from '../player/popover';
import { useBoardI18n } from '../i18n/board/context';
import { LocalText } from '../i18n/LocalText';
import type { Text } from '../i18n/messages';
import { fetchLocalReview, refreshLocalToken, subscribeReview, writeLocalReviewEvent } from '../runtime/dev-client';
import { captureReviewDraft, localReviewCommand, localReviewTitle, localReviewUpdates, readReviewDraft, reconcileReviewDraft, reviewDraftKey, saveReviewDraft, type ReviewDraft } from './review-model';
import { readReviewPosition, saveReviewPosition } from './review-position';

/** 跨页面保留草稿的位置；基于 Juice v0.2.0 CornerSnapOrb（自由边界拖拽 + 触觉音效）、Textarea、CopySnippet 与舒展 Collapsible。 */
export function LocalReview({ projectId, project, workId, context, version, enabled, completed, onOpen, onJump, approvable = true }: {
  projectId: string; project: Project; workId: string; context: LocalReviewLocation | null;
  version: number; enabled: boolean; completed: boolean; onOpen: () => void;
  onJump: (location: LocalReviewLocation) => void;
  /** 能否“确认方案”：独立作品（D102 修订，entry.featureId === null）没有方案这一层，只留反馈，不出确认按钮。 */
  approvable?: boolean;
}) {
  const { t } = useBoardI18n();
  const l = t.board;
  const key = reviewDraftKey(projectId, workId);
  const [draft, setDraft] = useState<ReviewDraft | null>(() => readReviewDraft(key));
  const [state, setState] = useState<LocalReviewState | null>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState(readReviewPosition);
  const dragStart = useRef<{ x: number; y: number; lifted: boolean } | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const [loadError, setLoadError] = useState<Text | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ project, context, state, draft });
  latest.current = { project, context, state, draft };
  const pending = useRef<{ signature: string; input: LocalReviewWrite } | null>(null);
  const requestOrder = useRef(0);
  const submitting = useRef(false);
  const updateDraft = (next: ReviewDraft | null) => { setDraft(next); saveReviewDraft(key, next); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      if (running || submitting.current) return;
      running = true;
      const order = ++requestOrder.current;
      const result = await fetchLocalReview(projectId, workId);
      running = false;
      if (cancelled || order !== requestOrder.current) return;
      if (result.ok) {
        setLoadError(null);
        setState(result.state);
        const d = latest.current.draft;
        if (d?.requestId && result.state.session.events.some(e => e.requestId === d.requestId)) {
          // 请求响应丢失、刷新或切换方案后，已落盘的同一请求视为成功，不能再次发送。
          setError(null);
          const next = latest.current.context ? captureReviewDraft(result.state.session, latest.current.project, latest.current.context) : null;
          updateDraft(next);
          pending.current = null;
        } else {
          // 热更新产生新一轮评审时：空草稿自动绑定当前页面，有文字且位置仍有效的草稿无感切到新版继续提交。
          const reconciled = reconcileReviewDraft(d, result.state.session, latest.current.project, latest.current.context);
          if (reconciled && (
            !d
            || reconciled.sessionId !== d.sessionId
            || reconciled.context.sceneId !== d.context.sceneId
            || reconciled.context.scenarioId !== d.context.scenarioId
            || reconciled.context.position !== d.context.position
          )) {
            updateDraft(reconciled);
            pending.current = null;
            setError(null);
          }
        }
      } else if (result.code === 'REVISION_CONFLICT' || result.status === 409) {
        // 源码刚保存、服务端正在 60ms 内重编译：不弹红错阻断审阅，短延迟自动重拉。
        if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; void refresh(); }, 250);
      } else setLoadError(result.message);
    };
    void refresh();
    let connected = true;
    const offReview = subscribeReview(
      projectId,
      (u) => {
        if (!u.workId || u.workId === workId) {
          if (u.reconnected) void refreshLocalToken().finally(() => { if (!cancelled) void refresh(); });
          else void refresh();
        }
      },
      (live) => { connected = live; },
    );
    const timer = setInterval(() => { if (connected) void refresh(); }, open ? 1500 : 5000);
    return () => {
      cancelled = true;
      offReview();
      clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [projectId, workId, version, open, enabled]);

  // 空草稿时切步骤/切画面自动跟随当前位置，无需关掉重开浮层。
  useEffect(() => {
    const s = latest.current.state?.session;
    const d = latest.current.draft;
    if (!s || !context || d?.text.trim()) return;
    if (d && d.sessionId === s.id && d.context.sceneId === context.sceneId && d.context.scenarioId === context.scenarioId && d.context.position === context.position) return;
    setDraft(captureReviewDraft(s, project, context));
  }, [state?.session.id, context?.sceneId, context?.scenarioId, context?.position, project]);

  const session = state?.session;
  const status = session ? localReviewStatus(session) : null;
  const stale = !!(draft?.text.trim() && session && draft.sessionId !== session.id);
  const shifted = !!(draft?.text.trim() && context && (draft.context.sceneId !== context.sceneId || draft.context.scenarioId !== context.scenarioId || draft.context.position !== context.position));
  const feedback = session?.events.filter(e => e.type === 'feedback') ?? [];
  const canWrite = enabled && !!session && status === 'open' && !stale && !busy && !loadError;
  const show = () => {
    playJuiceSound('tap');
    if (open) { setOpen(false); return; }
    onOpen();
    if (!draft?.text.trim() && session && context) updateDraft(captureReviewDraft(session, project, context));
    setOpen(true);
  };
  const send = async (type: 'feedback' | 'approved') => {
    if (!canWrite || submitting.current || !session) return;
    if (type === 'feedback' && (!draft?.text.trim() || draft.text.length > LOCAL_REVIEW_MAX_BODY)) return;
    if (type === 'approved' && draft?.text.trim()) return;
    const data = type === 'feedback'
      ? { sessionId: session.id, type, body: draft!.text.trim(), context: draft!.context } as const
      : { sessionId: session.id, type } as const;
    const signature = JSON.stringify(data);
    if (pending.current?.signature !== signature) pending.current = { signature, input: { ...data, requestId: type === 'feedback' && draft?.requestId ? draft.requestId : crypto.randomUUID() } };
    let input = pending.current.input;
    if (type === 'feedback' && draft) updateDraft({ ...draft, requestId: input.requestId });
    submitting.current = true;
    ++requestOrder.current; // 丢弃提交前发出的旧状态响应。
    setBusy(true);
    setError(null);
    let result = await writeLocalReviewEvent(projectId, input);
    // 若提交瞬间恰好遇到 Agent 热更新（409 REVISION_CONFLICT）：自动拉取新轮次；feedback 位置仍有效时无感重试一次（approved 绝不静默重发）。
    if (!result.ok && (result.code === 'REVISION_CONFLICT' || result.status === 409) && mounted.current) {
      let latestReview: LocalReviewState | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const synced = await fetchLocalReview(projectId, workId);
        if (synced.ok) { latestReview = synced.state; break; }
        if (synced.code !== 'REVISION_CONFLICT' && synced.status !== 409) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (latestReview && mounted.current) {
        setState(latestReview);
        if (type === 'feedback' && draft && localReviewStatus(latestReview.session) === 'open') {
          const reconciled = reconcileReviewDraft(draft, latestReview.session, latest.current.project, latest.current.context);
          if (reconciled && reconciled.sessionId === latestReview.session.id) {
            const retryData = { sessionId: latestReview.session.id, type: 'feedback' as const, body: reconciled.text.trim(), context: reconciled.context };
            input = { ...retryData, requestId: crypto.randomUUID() };
            pending.current = { signature: JSON.stringify(retryData), input };
            updateDraft({ ...reconciled, requestId: input.requestId });
            result = await writeLocalReviewEvent(projectId, input);
          }
        }
      }
    }
    submitting.current = false;
    if (result.ok && type === 'feedback' && readReviewDraft(key)?.requestId === input.requestId) saveReviewDraft(key, null);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    playJuiceSound(type === 'approved' ? 'paid' : 'pop');
    setState(result.state);
    pending.current = null;
    updateDraft(null);
    if (type === 'approved') setOpen(false);
    else if (latest.current.context) updateDraft(captureReviewDraft(result.state.session, latest.current.project, latest.current.context));
  };

  return <>
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="local-review-controls">
      <CornerSnapOrb
        ref={setAnchor}
        mode="free"
        position={point}
        onPositionChange={(next) => {
          if (open) setOpen(false);
          setPoint(next);
          saveReviewPosition(next);
        }}
        orbWidth={40}
        orbHeight={40}
        inset={12}
        expanded={open}
        aria-haspopup="dialog"
        aria-label={l.localReviewTitle}
        title={l.localReviewMoveHint}
        onActivate={show}
        onPointerDown={(e) => {
          dragStart.current = { x: e.clientX, y: e.clientY, lifted: false };
        }}
        onPointerMove={(e) => {
          const s = dragStart.current;
          if (s && !s.lifted && Math.hypot(e.clientX - s.x, e.clientY - s.y) >= 4) {
            s.lifted = true;
            playJuiceSound('lift');
          }
        }}
        onPointerUp={() => {
          if (dragStart.current?.lifted) playJuiceSound('drop');
          dragStart.current = null;
        }}
        onPointerCancel={() => { dragStart.current = null; }}
        className="pointer-events-auto relative rounded-full bg-jb-surface p-0 text-jb-fg shadow-[0_0_0_1px_var(--juice-edge),0_8px_22px_-4px_rgba(24,22,18,0.22)] hover:bg-jb-subtle"
        data-testid="local-review-toggle"
      >
        {status === 'approved' ? <Check className="size-[18px] text-jb-ok" /> : <MessageSquare className="size-[18px]" />}
        {feedback.length ? (
          <Badge tone="signal" className="pointer-events-none absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] justify-center px-1 text-[10.5px] shadow-xs" aria-label={l.localReviewHistory}>
            {feedback.length}
          </Badge>
        ) : null}
      </CornerSnapOrb>
    </div>
    <div className={`absolute right-3.5 z-30 ${completed ? 'bottom-14' : 'bottom-3.5'}`} data-testid="local-review-confirm">
      {status === 'approved' ? (
        <Badge tone="ok" role="status" className="h-8 rounded-[10px] px-3 text-[13px] shadow-sm">{l.localReviewApproved}</Badge>
      ) : !approvable ? null : (
        <Btn
          icon={<Check className="size-4" />}
          label={l.localReviewApprove}
          variant="primary"
          disabled={!canWrite || !!draft?.text.trim()}
          title={draft?.text.trim() ? l.localReviewSubmitDraft : undefined}
          className="rounded-[11px] px-3.5 shadow-[0_6px_18px_-4px_rgba(24,22,18,0.28)]"
          onClick={() => void send('approved')}
          data-testid="local-review-approve"
        />
      )}
    </div>
    <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} placement="right-start" width={376} autoFocus label={l.localReviewTitle} testid="local-review-popover" className="flex max-h-[calc(100vh-32px)] max-w-[calc(100vw-16px)] flex-col rounded-[20px] font-jb">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--juice-edge)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">{l.localReviewTitle}</h2>
        <Btn icon={<X className="size-4" />} label={l.localReviewClose} iconOnly variant="ghost" sound="tap" onClick={() => setOpen(false)} />
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <div className="text-[12px] text-jb-muted" role="status">
          {!session ? l.localReviewLoading : status === 'approved' ? l.localReviewApproved : state!.watchers > 0 ? l.localReviewListening : l.localReviewSavedLocally}
        </div>
        {session ? <p className="text-[13.5px] font-semibold">{localReviewTitle(session)}</p> : null}
        {draft ? (
          <div className="rounded-[12px] bg-[var(--juice-w6)] px-3 py-2.5 text-[12px]" data-testid="local-review-context">
            <div className="text-jb-muted">{l.localReviewLocation}</div>
            <div className="mt-0.5 font-medium text-jb-fg">{draft.pageTitle}</div>
            <div className="text-jb-muted">{draft.scenarioName} · {t.player.number(draft.context.position)}</div>
          </div>
        ) : null}
        {shifted ? <p className="text-[12px] text-jb-muted">{l.localReviewLocationKept}</p> : null}
        {!enabled ? <Alert tone="danger">{l.localReviewCompileFirst}</Alert> : null}
        {stale ? (
          <div className="flex flex-col gap-2 rounded-[12px] bg-jb-selected p-3 text-[12px]">
            <p>{l.localReviewChanged}</p>
            <Btn
              label={l.localReviewUseCurrent}
              disabled={!context || status !== 'open'}
              sound="tap"
              onClick={() => {
                if (session && context) {
                  updateDraft(captureReviewDraft(session, project, context, draft?.text ?? ''));
                  pending.current = null;
                  setError(null);
                }
              }}
              data-testid="local-review-rebase"
            />
          </div>
        ) : null}
        {status !== 'approved' || draft?.text ? <>
          <Textarea
            id="local-review-body"
            data-testid="local-review-body"
            label={l.localReviewPrompt}
            rows={4}
            maxLength={LOCAL_REVIEW_MAX_BODY}
            readOnly={status === 'approved'}
            placeholder={l.localReviewPlaceholder}
            value={draft?.text ?? ''}
            disabled={busy || !session || !context}
            onChange={(val) => {
              if (!session || !context) return;
              updateDraft({ ...(draft ?? captureReviewDraft(session, project, context)), text: val, requestId: undefined });
            }}
          />
          {status === 'approved' ? (
            <p className="text-[12px] text-jb-muted">{l.localReviewApprovedDraft}</p>
          ) : (
            <Btn
              label={busy ? l.localReviewSaving : l.localReviewSubmit}
              icon={busy ? <Spinner size="sm" /> : <Send className="size-4" />}
              disabled={!canWrite || !draft?.text.trim()}
              onClick={() => void send('feedback')}
              data-testid="local-review-send"
            />
          )}
        </> : null}
        {error || loadError ? <div data-testid="local-review-error"><Alert tone="danger"><span className="whitespace-pre-wrap break-words"><LocalText value={(error ?? loadError)!} /></span></Alert></div> : null}
        {state ? <LocalReviewUpdates project={project} workId={workId} state={state} onJump={(location) => { onJump(location); setOpen(false); }} /> : null}
        {feedback.length ? (
          <section className="flex flex-col gap-2 border-t border-[var(--juice-edge)] pt-3">
            <h3 className="text-[12px] font-semibold">{l.localReviewHistory}</h3>
            {feedback.slice(-20).map(e => (
              <article key={e.seq} className="rounded-[12px] bg-[var(--juice-w6)] px-3 py-2.5 text-[12px]">
                <p className="text-jb-muted">{e.context.pageTitle} · {e.context.position}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{e.body}</p>
              </article>
            ))}
          </section>
        ) : null}
        {session ? (
          <div className="[&_.j-acc-body]:px-3 [&_.j-acc-body]:pb-3 [&_.j-acc-body]:pt-1 [&_.j-acc-item]:rounded-[12px] [&_.j-acc-trigger]:h-10 [&_.j-acc-trigger]:px-3.5">
            <Collapsible trigger={l.localReviewAgentCommand}>
              <CopySnippet
                code={localReviewCommand(session)}
                copyLabel={l.localReviewCopyCommand}
                copiedLabel={l.localReviewCopied}
                errorLabel={t.board.clipboardUnavailable}
                onCopied={() => playJuiceSound('pop')}
                className="rounded-[10px] bg-jb-surface shadow-[inset_0_0_0_1px_var(--juice-edge)]"
              />
            </Collapsible>
          </div>
        ) : null}
      </div>
      {status !== 'approved' ? (
        <div className="flex shrink-0 flex-col gap-2 rounded-b-[20px] border-t border-[var(--juice-edge)] bg-[var(--juice-w4)] p-4">
          <Btn icon={<Check className="size-4" />} label={l.localReviewFinish} variant="primary" disabled={!canWrite || !!draft?.text.trim()} onClick={() => void send('approved')} data-testid="local-review-finish" />
          <p className="text-[12px] text-jb-muted">{draft?.text.trim() ? l.localReviewSubmitDraft : l.localReviewOptional}</p>
        </div>
      ) : null}
    </Popover>
  </>;
}

export function LocalReviewUpdates({ project, workId, state, onJump }: {
  project: Project; workId: string; state: LocalReviewState; onJump: (location: LocalReviewLocation) => void;
}) {
  const { t } = useBoardI18n();
  const l = t.board;
  const updates = localReviewUpdates(project, workId, state);
  if (!updates.length) return null;
  return <section className="flex flex-col gap-2 border-t border-[var(--juice-edge)] pt-3" data-testid="local-review-updates">
    <h3 className="text-[12px] font-semibold">{l.localReviewUpdates}</h3>
    {updates.map(e => <article key={e.eventId} className="flex flex-col gap-2 rounded-[12px] bg-[var(--juice-w6)] px-3 py-2.5 text-[12px]">
      <Badge tone={e.status === 'addressed' ? 'ok' : 'neutral'} className="self-start">
        {e.status === 'addressed' ? l.localReviewAddressed : e.status === 'deferred' ? l.localReviewDeferred : e.status === 'declined' ? l.localReviewDeclined : l.localReviewAwaitingReceipt}
      </Badge>
      <p className="line-clamp-3 whitespace-pre-wrap break-words">{e.body}</p>
      {e.note ? <p className="whitespace-pre-wrap break-words text-jb-muted">{e.note}</p> : null}
      {e.target ? <Btn label={l.localReviewJump(e.target.position)} onClick={() => onJump(e.target!)} data-testid="local-review-jump" /> : null}
    </article>)}
  </section>;
}
