import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { LOCAL_REVIEW_MAX_BODY, localReviewStatus, type LocalReviewLocation, type LocalReviewState, type LocalReviewWrite, type Project } from '@joplo-app/core/runtime';
import { Btn } from '../player/controls';
import { Popover } from '../player/popover';
import { copyText } from '../player/util';
import { useBoardI18n } from '../i18n/board/context';
import { LocalText } from '../i18n/LocalText';
import type { Text } from '../i18n/messages';
import { fetchLocalReview, writeLocalReviewEvent } from '../runtime/dev-client';
import { captureReviewDraft, localReviewCommand, readReviewDraft, reviewDraftKey, saveReviewDraft, type ReviewDraft } from './review-model';
import { useReviewDrag } from './useReviewDrag';

/** 跨页面保留草稿的位置；portal 浮层与图标均不占布局宽度。 */
export function LocalReview({ projectId, project, optionId, context, version, enabled, completed, onOpen }: {
  projectId: string; project: Project; optionId: string; context: LocalReviewLocation | null;
  version: number; enabled: boolean; completed: boolean; onOpen: () => void;
}) {
  const { t } = useBoardI18n();
  const l = t.board;
  const key = reviewDraftKey(projectId, optionId);
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
      const result = await fetchLocalReview(projectId, optionId);
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
  }, [projectId, optionId, version, open]);

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
        className="touch-none cursor-grab active:cursor-grabbing" onClick={e => drag.click(e, show)}
        onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture} onKeyDown={drag.onKeyDown}
        aria-haspopup="dialog" aria-expanded={open} data-testid="local-review-toggle" />
      {feedback.length ? <span className="rounded-full border border-jb-line bg-jb-surface px-1.5 text-[11px]" aria-label={l.localReviewHistory}>{feedback.length}</span> : null}
    </div>
    <div className={`absolute right-3 z-30 ${completed ? 'bottom-14' : 'bottom-3'}`} data-testid="local-review-confirm">
      {status === 'approved' ? <span role="status" className="rounded-[6px] border border-jb-line bg-jb-surface px-3 py-2 text-[13px] text-jb-ok">{l.localReviewApproved}</span>
        : <Btn icon={<Check className="size-4" />} label={l.localReviewApprove} variant="primary" disabled={!canWrite || !!draft?.text.trim()} title={draft?.text.trim() ? l.localReviewSubmitDraft : undefined} onClick={() => void send('approved')} data-testid="local-review-approve" />}
    </div>
    <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} placement="right-start" width={360} autoFocus label={l.localReviewTitle} testid="local-review-popover" className="flex max-h-[calc(100vh-32px)] max-w-[calc(100vw-16px)] flex-col font-jb">
      <div className="flex shrink-0 items-center justify-between border-b border-jb-line px-4 py-3"><h2 className="text-[15px] font-semibold">{l.localReviewTitle}</h2><Btn icon={<X className="size-4" />} label={l.localReviewClose} iconOnly variant="ghost" onClick={() => setOpen(false)} /></div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <div className="text-[12px] text-jb-muted" role="status">{!session ? l.localReviewLoading : status === 'approved' ? l.localReviewApproved : state!.watchers > 0 ? l.localReviewListening : l.localReviewSavedLocally}</div>
        {session ? <p className="text-[13px] font-semibold">{session.featureName} / {session.optionName}</p> : null}
        {draft ? <div className="rounded-[6px] border border-jb-line bg-jb-sunken p-2 text-[12px]" data-testid="local-review-context"><div className="text-jb-muted">{l.localReviewLocation}</div><div>{draft.pageTitle}</div><div>{draft.scenarioName} · {t.player.number(draft.context.position)}</div></div> : null}
        {shifted ? <p className="text-[12px] text-jb-muted">{l.localReviewLocationKept}</p> : null}
        {!enabled ? <p role="alert" className="text-[12px] text-jb-danger">{l.localReviewCompileFirst}</p> : null}
        {stale ? <div className="flex flex-col gap-2 rounded-[6px] border border-jb-line bg-jb-selected p-2 text-[12px]"><p>{l.localReviewChanged}</p><Btn label={l.localReviewUseCurrent} disabled={!context || status !== 'open'} onClick={() => { if (session && context) { updateDraft(captureReviewDraft(session, project, context, draft?.text ?? '')); pending.current = null; setError(null); } }} data-testid="local-review-rebase" /></div> : null}
        {status !== 'approved' || draft?.text ? <>
          <label className="flex flex-col gap-1.5 text-[13px]" htmlFor="local-review-body">{l.localReviewPrompt}
            <textarea id="local-review-body" data-testid="local-review-body" rows={4} maxLength={LOCAL_REVIEW_MAX_BODY} readOnly={status === 'approved'} className="jb-focus resize-y rounded-[6px] border border-jb-line bg-jb-surface p-2 text-[13px] disabled:opacity-50" placeholder={l.localReviewPlaceholder} value={draft?.text ?? ''} disabled={busy || !session || !context} onChange={e => {
              if (!session || !context) return;
              updateDraft({ ...(draft ?? captureReviewDraft(session, project, context)), text: e.target.value, requestId: undefined });
            }} />
          </label>
          {status === 'approved' ? <p className="text-[12px] text-jb-muted">{l.localReviewApprovedDraft}</p> : <Btn label={busy ? l.localReviewSaving : l.localReviewSubmit} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} disabled={!canWrite || !draft?.text.trim()} onClick={() => void send('feedback')} data-testid="local-review-send" />}
        </> : null}
        {error || loadError ? <p role="alert" className="whitespace-pre-wrap break-words text-[12px] text-jb-danger" data-testid="local-review-error"><LocalText value={(error ?? loadError)!} /></p> : null}
        {feedback.length ? <section className="flex flex-col gap-2 border-t border-jb-line pt-3"><h3 className="text-[12px] font-semibold">{l.localReviewHistory}</h3>{feedback.slice(-20).map(e => <article key={e.seq} className="rounded-[6px] bg-jb-sunken p-2 text-[12px]"><p className="text-jb-muted">{e.context.pageTitle} · {e.context.position}</p><p className="whitespace-pre-wrap break-words">{e.body}</p></article>)}</section> : null}
        {session ? <details className="text-[12px] text-jb-muted"><summary className="jb-focus cursor-pointer">{l.localReviewAgentCommand}</summary><code className="my-2 block break-all rounded-[6px] bg-jb-sunken p-2 font-jb-mono">{localReviewCommand(session)}</code><Btn icon={<Copy className="size-3.5" />} label={copied ? l.localReviewCopied : l.localReviewCopyCommand} onClick={() => void copyText(localReviewCommand(session)).then(setCopied)} /></details> : null}
      </div>
      {status !== 'approved' ? <div className="flex shrink-0 flex-col gap-2 border-t border-jb-line p-4"><Btn icon={<Check className="size-4" />} label={l.localReviewFinish} variant="primary" disabled={!canWrite || !!draft?.text.trim()} onClick={() => void send('approved')} data-testid="local-review-finish" /><p className="text-[12px] text-jb-muted">{draft?.text.trim() ? l.localReviewSubmitDraft : l.localReviewOptional}</p></div> : null}
    </Popover>
  </>;
}
