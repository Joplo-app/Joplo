import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { Alert, Badge, Collapsible } from '@tokenroll/juice/primitives';
import { LOCAL_REVIEW_MAX_BODY, localReviewStatus, type LocalReviewLocation, type LocalReviewState, type LocalReviewWrite, type Project } from '@joplo-app/core/runtime';
import { Btn } from '../player/controls';
import { Popover } from '../player/popover';
import { copyText } from '../player/util';
import { useBoardI18n } from '../i18n/board/context';
import { LocalText } from '../i18n/LocalText';
import type { Text } from '../i18n/messages';
import { fetchLocalReview, writeLocalReviewEvent } from '../runtime/dev-client';
import { captureReviewDraft, localReviewCommand, localReviewTitle, readReviewDraft, reviewDraftKey, saveReviewDraft, type ReviewDraft } from './review-model';
import { useReviewDrag } from './useReviewDrag';

/** 跨页面保留草稿的位置；portal 浮层与图标均不占布局宽度。 */
export function LocalReview({ projectId, project, workId, context, version, enabled, completed, onOpen, approvable = true }: {
  projectId: string; project: Project; workId: string; context: LocalReviewLocation | null;
  version: number; enabled: boolean; completed: boolean; onOpen: () => void;
  /** 能否“确认方案”：独立作品（D102 修订，entry.featureId === null）没有方案这一层，只留反馈，不出确认按钮。 */
  approvable?: boolean;
}) {
  const { t } = useBoardI18n();
  const l = t.board;
  const key = reviewDraftKey(projectId, workId);
  const [draft, setDraft] = useState<ReviewDraft | null>(() => readReviewDraft(key));
  const [state, setState] = useState<LocalReviewState | null>(null);
  const [open, setOpen] = useState(false);
  const drag = useReviewDrag(() => setOpen(false));
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);
  const [loadError, setLoadError] = useState<Text | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const latest = useRef({ project, context, state, draft });
  latest.current = { project, context, state, draft };
  const pending = useRef<{ signature: string; input: LocalReviewWrite } | null>(null);
  const requestOrder = useRef(0);
  const submitting = useRef(false);
  const updateDraft = (next: ReviewDraft | null) => { setDraft(next); saveReviewDraft(key, next); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    let running = false;
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
          updateDraft(null);
          pending.current = null;
        }
        // 空草稿在首次打开时捕获；已有草稿永不因后台刷新而改绑页面。
        if (open && (!latest.current.draft || !latest.current.draft.text && latest.current.draft.sessionId !== result.state.session.id) && latest.current.context) {
          const next = captureReviewDraft(result.state.session, latest.current.project, latest.current.context);
          setDraft(next);
        }
      } else setLoadError(result.message);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), open ? 1500 : 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [projectId, workId, version, open]);

  const session = state?.session;
  const status = session ? localReviewStatus(session) : null;
  const stale = !!(draft?.text.trim() && session && draft.sessionId !== session.id);
  const shifted = !!(draft && context && (draft.context.sceneId !== context.sceneId || draft.context.scenarioId !== context.scenarioId || draft.context.position !== context.position));
  const feedback = session?.events.filter(e => e.type === 'feedback') ?? [];
  const canWrite = enabled && !!session && status === 'open' && !stale && !busy && !loadError;
  const show = () => {
    if (open) { setOpen(false); return; }
    onOpen();
    setCopied(false);
    if (!draft?.text && session && context) updateDraft(captureReviewDraft(session, project, context));
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
    const input = pending.current.input;
    if (type === 'feedback' && draft) updateDraft({ ...draft, requestId: input.requestId });
    submitting.current = true;
    ++requestOrder.current; // 丢弃提交前发出的旧状态响应。
    setBusy(true);
    setError(null);
    const result = await writeLocalReviewEvent(projectId, input);
    submitting.current = false;
    if (result.ok && type === 'feedback' && readReviewDraft(key)?.requestId === input.requestId) saveReviewDraft(key, null);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setState(result.state);
    pending.current = null;
    updateDraft(null);
    if (type === 'approved') setOpen(false);
    else if (latest.current.context) updateDraft(captureReviewDraft(result.state.session, latest.current.project, latest.current.context));
  };

  return <>
    <div ref={drag.ref} style={drag.style} className="absolute z-40 flex flex-col items-center gap-1" data-testid="local-review-controls" data-dragging={drag.dragging || undefined}>
      <Btn ref={setAnchor} icon={status === 'approved' ? <Check className="size-5 text-jb-ok" /> : <MessageSquare className="size-5" />} label={l.localReviewTitle} title={l.localReviewMoveHint} size={36} iconOnly selected={open}
        className="touch-none cursor-grab rounded-full bg-jb-surface shadow-[0_0_0_1px_var(--juice-edge),0_6px_16px_-3px_rgba(0,0,0,0.2)] active:cursor-grabbing" onClick={e => drag.click(e, show)}
        onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture} onKeyDown={drag.onKeyDown}
        aria-haspopup="dialog" aria-expanded={open} data-testid="local-review-toggle" />
      {feedback.length ? <Badge className="h-[18px] px-1.5 text-[11px]" aria-label={l.localReviewHistory}>{feedback.length}</Badge> : null}
    </div>
    <div className={`absolute right-3 z-30 ${completed ? 'bottom-14' : 'bottom-3'}`} data-testid="local-review-confirm">
      {status === 'approved' ? <Badge tone="ok" role="status" className="h-8 px-3 text-[13px]">{l.localReviewApproved}</Badge>
        : !approvable ? null : <Btn icon={<Check className="size-4" />} label={l.localReviewApprove} variant="primary" disabled={!canWrite || !!draft?.text.trim()} title={draft?.text.trim() ? l.localReviewSubmitDraft : undefined} onClick={() => void send('approved')} data-testid="local-review-approve" />}
    </div>
    <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} placement="right-start" width={360} autoFocus label={l.localReviewTitle} testid="local-review-popover" className="flex max-h-[calc(100vh-32px)] max-w-[calc(100vw-16px)] flex-col font-jb">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--juice-edge)] px-4 py-3"><h2 className="text-[15px] font-semibold">{l.localReviewTitle}</h2><Btn icon={<X className="size-4" />} label={l.localReviewClose} iconOnly variant="ghost" onClick={() => setOpen(false)} /></div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <div className="text-[12px] text-jb-muted" role="status">{!session ? l.localReviewLoading : status === 'approved' ? l.localReviewApproved : state!.watchers > 0 ? l.localReviewListening : l.localReviewSavedLocally}</div>
        {session ? <p className="text-[13px] font-semibold">{localReviewTitle(session)}</p> : null}
        {draft ? <div className="rounded-[10px] bg-[var(--juice-w6)] p-2.5 text-[12px]" data-testid="local-review-context"><div className="text-jb-muted">{l.localReviewLocation}</div><div>{draft.pageTitle}</div><div>{draft.scenarioName} · {t.player.number(draft.context.position)}</div></div> : null}
        {shifted ? <p className="text-[12px] text-jb-muted">{l.localReviewLocationKept}</p> : null}
        {!enabled ? <Alert tone="danger">{l.localReviewCompileFirst}</Alert> : null}
        {stale ? <div className="flex flex-col gap-2 rounded-[10px] bg-jb-selected p-2.5 text-[12px]"><p>{l.localReviewChanged}</p><Btn label={l.localReviewUseCurrent} disabled={!context || status !== 'open'} onClick={() => { if (session && context) { updateDraft(captureReviewDraft(session, project, context, draft?.text ?? '')); pending.current = null; setError(null); } }} data-testid="local-review-rebase" /></div> : null}
        {status !== 'approved' || draft?.text ? <>
          <label className="flex flex-col gap-1.5 text-[13px]" htmlFor="local-review-body">{l.localReviewPrompt}
            <textarea id="local-review-body" data-testid="local-review-body" rows={4} maxLength={LOCAL_REVIEW_MAX_BODY} readOnly={status === 'approved'} className="jb-focus resize-y rounded-[10px] bg-[var(--juice-w6)] p-2.5 text-[13px] transition-shadow focus:bg-jb-surface focus:shadow-[inset_0_0_0_1.5px_var(--fill-on)] disabled:opacity-50" placeholder={l.localReviewPlaceholder} value={draft?.text ?? ''} disabled={busy || !session || !context} onChange={e => {
              if (!session || !context) return;
              updateDraft({ ...(draft ?? captureReviewDraft(session, project, context)), text: e.target.value, requestId: undefined });
            }} />
          </label>
          {status === 'approved' ? <p className="text-[12px] text-jb-muted">{l.localReviewApprovedDraft}</p> : <Btn label={busy ? l.localReviewSaving : l.localReviewSubmit} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} disabled={!canWrite || !draft?.text.trim()} onClick={() => void send('feedback')} data-testid="local-review-send" />}
        </> : null}
        {error || loadError ? <div data-testid="local-review-error"><Alert tone="danger"><span className="whitespace-pre-wrap break-words"><LocalText value={(error ?? loadError)!} /></span></Alert></div> : null}
        {feedback.length ? <section className="flex flex-col gap-2 border-t border-[var(--juice-edge)] pt-3"><h3 className="text-[12px] font-semibold">{l.localReviewHistory}</h3>{feedback.slice(-20).map(e => <article key={e.seq} className="rounded-[10px] bg-[var(--juice-w6)] p-2.5 text-[12px]"><p className="text-jb-muted">{e.context.pageTitle} · {e.context.position}</p><p className="whitespace-pre-wrap break-words">{e.body}</p></article>)}</section> : null}
        {session ? <Collapsible trigger={l.localReviewAgentCommand}><div className="flex flex-col gap-2 pt-1"><code className="j-copy-snippet block break-all p-2 font-jb-mono">{localReviewCommand(session)}</code><Btn icon={<Copy className="size-3.5" />} label={copied ? l.localReviewCopied : l.localReviewCopyCommand} size={28} onClick={() => void copyText(localReviewCommand(session)).then(setCopied)} /></div></Collapsible> : null}
      </div>
      {status !== 'approved' ? <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--juice-edge)] p-4"><Btn icon={<Check className="size-4" />} label={l.localReviewFinish} variant="primary" disabled={!canWrite || !!draft?.text.trim()} onClick={() => void send('approved')} data-testid="local-review-finish" /><p className="text-[12px] text-jb-muted">{draft?.text.trim() ? l.localReviewSubmitDraft : l.localReviewOptional}</p></div> : null}
    </Popover>
  </>;
}
