import { useBoardI18n } from '../i18n/board/context';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/board/messages';
/**
 * 看板直接发布到云端（D76）：「导出 ▾」里蓝底的「发布到 Joplo Cloud」打开这个浮层（e1，盖在画面右上方，不挤压布局）。
 * - 打开时读账号（GET /__joplo/cloud/account）：没登录 → 显示可复制的登录命令和「我已登录，重新检查」；
 *   旧版 CLI 启动的看板 → 说明要重启 joplo dev。
 * - 已登录：选范围（当前场景 / 当前功能 / 整个项目，D75），点「发布」→ POST …/cloud/publish；进度与结果由 joplo:cloud 推送，
 *   关掉浮层不中断，再打开能看到同一个任务。完成后给出链接（复制、打开）、有效期、借用了哪些别的功能的内容。
 * 字段流向：CloudJob（server CloudHub 写入 → 推送 / GET 读取）→ useCloudPublish.job → 进度、结果、失败（需要登录时显示登录命令）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Cloud, Copy, ExternalLink, Loader2, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn } from '../player/controls';
import { Popover } from '../player/popover';
import { copyText } from '../player/util';
import type { Text } from '../i18n/messages';
import { fetchCloudLinks, fetchCloudAccount, fetchCloudJob, startCloudPublish, subscribeCloud, type CloudLinks, type CloudVisibility, type CloudPortfolio, type CloudAccount, type CloudJob, type CloudStorage, type CloudStorageFull } from '../runtime/dev-client';
import { CLOUD_STAGES, cloudNotes, cloudRequest, cloudStage, cloudUnpicked, defaultChoice, defaultVisibility, formatStorage, needsLogin, storageFull, storageView, type CloudContext, type CloudPicks, type CloudScopeChoice } from './cloud-model';

type AccountState = { loading: boolean; available: boolean; account: CloudAccount | null; error: Text | null };

export function useCloudPublish(projectId: string) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [acct, setAcct] = useState<AccountState>({ loading: false, available: true, account: null, error: null });
  const [job, setJob] = useState<CloudJob | null>(null);
  const [links, setLinks] = useState<CloudLinks>({ main: null });
  const [linksReady, setLinksReady] = useState(false);
  const [startError, setStartError] = useState<Text | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCloudJob(projectId).then((j) => alive && setJob(j));
    const off = subscribeCloud(projectId, (j) => setJob(j));
    return () => {
      alive = false;
      off();
    };
  }, [projectId]);

  const refresh = useCallback(async () => {
    setAcct((a) => ({ ...a, loading: true, error: null }));
    const r = await fetchCloudAccount();
    setAcct(r.ok ? { loading: false, available: r.available, account: r.account, error: null } : { loading: false, available: true, account: null, error: r.message });
    return r.ok ? r.account : null;
  }, []);

  useEffect(() => {
    let alive = true;
    setLinksReady(false);
    if (open) {
      void refresh();
      void fetchCloudLinks(projectId).then((next) => { if (alive) { setLinks(next); setLinksReady(true); } });
    }
    return () => { alive = false; };
  }, [open, refresh, projectId, job?.state]);

  const publish = useCallback(
    async (ctx: CloudContext, choice: CloudScopeChoice, visibility: CloudVisibility, review: boolean) => {
      setStartError(null);
      const r = await startCloudPublish(projectId, { ...cloudRequest(choice, ctx), visibility, review });
      if (r.ok) setJob(r.job);
      else setStartError(r.message);
    },
    [projectId],
  );

  return { open, setOpen, anchor, setAnchor, acct, refresh, job, links, linksReady, publish, startError, running: job?.state === 'running' };
}
export type CloudPublishModel = ReturnType<typeof useCloudPublish>;

/** 登录命令 + 复制按钮 + 重新检查。 */
function LoginBlock({ command, message, onCheck, checking, stillOut }: { command: string; message?: string; onCheck: () => void; checking: boolean; stillOut: boolean }) {
  const { t: i18n } = useBoardI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2.5" data-testid="cloud-login">
      <div className="text-[14px] font-semibold">{i18n.board.cloudLoginTitle}</div>
      <p className="text-[13px] leading-[1.5] text-jb-muted">{i18n.board.cloudLoginBody}</p>
      <div className="flex items-start gap-2 rounded-[8px] border border-jb-line bg-jb-sunken py-1.5 pl-3 pr-1.5">
        {/* 要复制的命令完整显示（可能带 JOPLO_HOME 与 --server），长了就换行，不截断 */}
        <code className="min-w-0 flex-1 select-all whitespace-pre-wrap break-all py-1 font-jb-mono text-[13px] leading-[1.45]" data-testid="cloud-login-command">{command}</code>
        <Btn
          size={28}
          icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          label={copied ? i18n.board.cloudCommandCopied : i18n.board.cloudCopyCommand}
          onClick={() => void copyText(command).then((ok) => setCopied(ok))}
          data-testid="cloud-copy-command"
        />
      </div>
      {message ? <p className="text-[12px] text-jb-faint">{message}</p> : null}
      {stillOut ? <p className="text-[12px] text-jb-danger" data-testid="cloud-still-out">{i18n.board.cloudStillSignedOut}</p> : null}
      <Btn icon={checking ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} label={i18n.board.cloudCheckAgain} onClick={onCheck} disabled={checking} data-testid="cloud-check-again" className="self-start" />
    </div>
  );
}

/** 账号容量（C27，方案 B）：平时一行小字；用到八成出现用量条与提醒；满了变红。 */
export function StorageUsage({ storage, server, plan, full }: { storage: CloudStorage | undefined; server: string; plan: 'free' | 'pro' | null; full: boolean }) {
  const { t: i18n } = useBoardI18n();
  const view = storageView(storage);
  if (!view) return null;
  if (view.level === 'ok' && !full) return <p className="text-[12px] text-jb-faint" data-testid="cloud-storage-mini">{i18n.board.cloudStorageMini(view.used, view.quota)}</p>;
  const level = full ? 'over' : view.level;
  return (
    <div className="flex flex-col gap-2" data-testid="cloud-storage-meter" data-level={level}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold tracking-[0.5px] text-jb-muted">{i18n.board.cloudStorage}</span>
          <span className="text-jb-muted">{i18n.board.cloudStorageOf(view.used, view.quota)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-jb-sunken" role="meter" aria-label={i18n.board.cloudStorage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.pct}>
          <div className={cn('h-full rounded-full', level === 'over' ? 'bg-jb-danger' : 'bg-[#E0AE00]')} style={{ width: `${view.pct}%` }} />
        </div>
      </div>
      {level === 'near' ? (
        <div className="flex flex-col gap-1 rounded-[8px] border border-[#E0AE00] bg-jb-selected px-3 py-2" data-testid="cloud-storage-near">
          <div className="text-[13px] font-semibold">{i18n.board.cloudStorageNearTitle}</div>
          <p className="text-[12px] leading-[1.5]">{plan === 'pro' ? i18n.board.cloudStorageNearBodyPro : i18n.board.cloudStorageNearBody}</p>
          <StorageLinks manageUrl={`${server}/shares`} upgradeUrl={plan === 'pro' ? null : `${server}/settings/billing`} />
        </div>
      ) : null}
    </div>
  );
}

function StorageLinks({ manageUrl, upgradeUrl }: { manageUrl: string; upgradeUrl: string | null }) {
  const { t: i18n } = useBoardI18n();
  const link = 'jb-focus rounded-[4px] text-[12px] font-medium text-jb-cloud underline-offset-2 hover:underline';
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <a href={manageUrl} target="_blank" rel="noreferrer" className={link} data-testid="cloud-storage-manage">{i18n.board.cloudStorageManage}</a>
      {upgradeUrl ? <a href={upgradeUrl} target="_blank" rel="noreferrer" className={link} data-testid="cloud-storage-upgrade">{i18n.board.cloudStorageUpgrade}</a> : null}
    </div>
  );
}

/** 这次放不下（QUOTA_EXCEEDED，kind: storage）：差多少、已有链接不受影响、去哪里腾地方或升级。 */
export function StorageFull({ full, plan }: { full: CloudStorageFull; plan: 'free' | 'pro' | null }) {
  const { t: i18n } = useBoardI18n();
  const f = storageFull(full);
  const text = f.kind === 'need' ? i18n.board.cloudStorageFullNeed(f.size, f.left, f.short) : f.kind === 'update' ? i18n.board.cloudStorageFullUpdate(f.size, f.left) : i18n.board.cloudStorageFullGeneric;
  return (
    <div className="flex flex-col gap-1 rounded-[8px] border border-jb-danger bg-jb-danger-bg px-3 py-2" data-testid="cloud-storage-full" role="alert">
      <div className="text-[13px] font-semibold text-jb-danger">{i18n.board.cloudStorageFullTitle}</div>
      <p className="text-[12px] leading-[1.5]">{text}</p>
      <p className="text-[12px] font-semibold leading-[1.5]">{i18n.board.cloudStorageExisting}</p>
      <StorageLinks manageUrl={f.manageUrl} upgradeUrl={plan === 'pro' ? null : f.upgradeUrl} />
    </div>
  );
}

function ScopeRadio({ value, onChange, ctx, names, disabled }: { value: CloudScopeChoice; onChange: (v: CloudScopeChoice) => void; ctx: CloudContext; names: { feature: string; scenario: string | null }; disabled: boolean }) {
  const { t: i18n } = useBoardI18n();
  const rows: { id: CloudScopeChoice; label: string; off?: boolean }[] = [
    { id: 'scenario', label: i18n.board.cloudScopeScenario(names.scenario ?? '—'), off: !ctx.scenarioId },
    { id: 'feature', label: i18n.board.cloudScopeFeature(names.feature) },
    { id: 'project', label: i18n.board.cloudScopeProject },
  ];
  return (
    <div role="radiogroup" aria-label={i18n.board.cloudScope} className="flex flex-col gap-1">
      {rows.map((r) => (
        <label key={r.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[13px] hover:bg-jb-hover', value === r.id && 'bg-jb-cloud-bg hover:bg-jb-cloud-bg', (r.off || disabled) && 'pointer-events-none opacity-40')}>
          <input type="radio" name="cloud-scope" className="accent-[var(--jb-cloud)]" checked={value === r.id} disabled={r.off || disabled} onChange={() => onChange(r.id)} data-testid={`cloud-scope-${r.id}`} />
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
        </label>
      ))}
    </div>
  );
}

function Progress({ job }: { job: CloudJob }) {
  const { t: i18n } = useBoardI18n();
  const stage = cloudStage(job.lines);
  const at = CLOUD_STAGES.indexOf(stage);
  const label = { checking: i18n.board.cloudStageChecking, building: i18n.board.cloudStageBuilding, uploading: i18n.board.cloudStageUploading, finalizing: i18n.board.cloudStageFinalizing };
  return (
    <ol className="flex flex-col gap-1.5" data-testid="cloud-progress" aria-live="polite">
      {CLOUD_STAGES.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-2 text-[13px]', i > at && 'text-jb-faint')}>
          {i < at ? <Check className="size-4 text-jb-ok" /> : i === at ? <Loader2 className="size-4 animate-spin text-jb-cloud" /> : <span className="size-4" />}
          {label[s]}
        </li>
      ))}
    </ol>
  );
}

function Result({ job, onFlash, server }: { job: CloudJob & { result: NonNullable<CloudJob['result']> }; onFlash: (n: React.ReactNode) => void; server: string }) {
  const { t: i18n, locale } = useBoardI18n();
  const r = job.result;
  const borrowed = r.scope?.borrowed ?? [];
  const notes = cloudNotes(job.lines);
  const expires = r.expiresAt ? new Date(r.expiresAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="flex flex-col gap-2.5" data-testid="cloud-result">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-jb-ok"><Check className="size-4" />{i18n.board.cloudPublished}</div>
      <div className="flex items-center gap-1.5 rounded-[8px] border border-jb-line bg-jb-sunken py-1.5 pl-3 pr-1.5">
        <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-jb-mono text-[13px] text-jb-cloud underline-offset-2 hover:underline" data-testid="cloud-url">{r.url}</a>
        <Btn size={28} icon={<Copy className="size-4" />} label={i18n.board.cloudCopyLink} iconOnly onClick={() => void copyText(r.url).then((ok) => onFlash(<LocalText value={ok ? m.board.cloudLinkCopied : m.board.clipboardUnavailableCopyFromTheAddressBar} />))} data-testid="cloud-copy-link" />
        <Btn size={28} icon={<ExternalLink className="size-4" />} label={i18n.board.cloudOpenLink} iconOnly onClick={() => window.open(r.url, '_blank', 'noopener')} data-testid="cloud-open-link" />
      </div>
      <p className="text-[12px] text-jb-muted" data-testid="cloud-result-life">
        {expires ? i18n.board.cloudExpiresAt(expires) : i18n.board.cloudPermanentLink}
        {r.storage ? ` · ${i18n.board.cloudThisShareSize(formatStorage(r.storage.shareBytes))}` : ''}
      </p>
      <PublicationLinks result={r} server={server} />
      {borrowed.length ? (
        <div className="flex flex-col gap-1 rounded-[8px] border border-[#E0AE00] bg-jb-selected px-3 py-2" data-testid="cloud-borrowed">
          <div className="text-[13px] font-semibold">{i18n.board.cloudBorrowedTitle}</div>
          <ul className="flex flex-col gap-0.5 text-[12px]">
            {borrowed.map((b) => (
              <li key={b.kind === 'element' ? `${b.optionId}|${b.elementId}` : `page|${b.route}`} className="break-words">
                {b.kind === 'element' ? i18n.board.cloudBorrowedElement(b.featureName, b.elementId, b.route) : i18n.board.cloudBorrowedPage(b.featureName, b.route)}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-jb-muted">{i18n.board.cloudBorrowedNote}</p>
        </div>
      ) : null}
      {notes.length ? (
        <ul className="flex flex-col gap-0.5 text-[12px] text-jb-faint" data-testid="cloud-notes">
          {notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** 可见性和评审是这次发布的明确选择；范围限制始终优先。 */
export function VisibilityFields({ visibility, review, onVisibility, onReview, disabled, restricted }: { visibility: CloudVisibility; review: boolean; onVisibility: (v: CloudVisibility) => void; onReview: (v: boolean) => void; disabled: boolean; restricted: boolean }) {
  const { t: i18n } = useBoardI18n();
  return <div className="flex flex-col gap-2" data-testid="cloud-choices">
    <fieldset disabled={disabled} className="flex flex-col gap-1.5">
      <legend className="text-[12px] font-semibold text-jb-muted">{i18n.board.cloudVisibility}</legend>
      <div className="flex gap-4">
        {(['public', 'private'] as const).map((v) => <label key={v} className="flex min-h-8 items-center gap-2 text-[13px]">
          <input type="radio" name="cloud-visibility" value={v} disabled={disabled || (v === 'public' && restricted)} checked={visibility === v} onChange={() => onVisibility(v)} className="accent-[var(--jb-cloud)]" />
          {v === 'public' ? i18n.board.cloudPublic : i18n.board.cloudPrivate}
        </label>)}
      </div>
      <p className="text-[12px] leading-[1.5] text-jb-faint">{restricted ? i18n.board.cloudPrivateOnly : visibility === 'public' ? i18n.board.cloudPublicNote : i18n.board.cloudPrivateNote}</p>
    </fieldset>
    <label className="flex min-h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={review} disabled={disabled} onChange={(e) => onReview(e.target.checked)} className="accent-[var(--jb-cloud)]" />{i18n.board.cloudAlsoReview}</label>
    {review ? <p className="text-[12px] text-jb-faint">{i18n.board.cloudReviewNote}</p> : null}
  </div>;
}

export function PublicationLinks({ result, server }: { result: { visibility?: CloudVisibility; portfolio?: CloudPortfolio; review?: { url: string } }; server: string }) {
  const { t: i18n } = useBoardI18n();
  const p = result.portfolio;
  return <div className="flex flex-col gap-1 text-[12px]" data-testid="cloud-publication-links">
    <span>{result.visibility === 'public' ? i18n.board.cloudPublic : i18n.board.cloudPrivate}</span>
    {result.visibility === 'public' && p && (p.needsUsername || p.workUrl) ? <a href={p.needsUsername ? `${server}${p.setupPath}` : p.workUrl!} target="_blank" rel="noopener noreferrer" className="jb-focus text-jb-cloud hover:underline">{p.needsUsername ? i18n.board.cloudSetupUsername : i18n.board.cloudPortfolioWork}</a> : null}
    {result.review ? <a href={result.review.url} target="_blank" rel="noopener noreferrer" className="jb-focus text-jb-cloud hover:underline">{i18n.board.cloudAlsoReview} · {i18n.board.cloudPrivate}</a> : null}
  </div>;
}

export function CloudPublishPopover({ model, ctx, names, picks, onFlash }: { model: CloudPublishModel; ctx: CloudContext; names: { feature: string; scenario: string | null }; picks: CloudPicks; onFlash: (n: React.ReactNode) => void }) {
  const { t: i18n } = useBoardI18n();
  const { acct, job } = model;
  const [choice, setChoice] = useState<CloudScopeChoice>(() => defaultChoice(ctx));
  const [visibility, setVisibility] = useState<CloudVisibility>('public');
  const [review, setReview] = useState(false);
  const restricted = choice !== 'project' || !!ctx.pr;
  const key = choice === 'scenario' && ctx.scenarioId ? ctx.scenarioId : [...(ctx.featureScenarioIds ?? [])].sort().join(',');
  const previous = choice === 'project' ? model.links.main : model.links.scoped?.[key] ?? null;
  const previousValue = previous ? previous.visibility ?? 'private' : 'new';
  useEffect(() => {
    if (model.open) setVisibility(restricted ? 'private' : defaultVisibility(previousValue === 'new' ? null : { visibility: previousValue }));
  }, [model.open, restricted, choice, key, previousValue]);
  const [stillOut, setStillOut] = useState(false);
  // 换了场景 / 功能且当前选项不可用时，回到默认
  useEffect(() => {
    if (choice === 'scenario' && !ctx.scenarioId) setChoice('feature');
  }, [ctx.scenarioId, choice]);
  useEffect(() => {
    if (!model.open) { setStillOut(false); setReview(false); }
  }, [model.open]);

  const check = async () => {
    const a = await model.refresh();
    setStillOut(!a || !a.signedIn);
  };
  const account = acct.account;
  const loginFromJob = needsLogin(job) && !(account && account.signedIn);
  const signedOut = account && !account.signedIn ? account : null;

  let body: React.ReactNode;
  if (!acct.available) {
    body = (
      <div className="flex flex-col gap-1.5" data-testid="cloud-unavailable">
        <div className="text-[14px] font-semibold">{i18n.board.cloudUnavailableTitle}</div>
        <p className="text-[13px] leading-[1.5] text-jb-muted">{i18n.board.cloudUnavailableBody}</p>
      </div>
    );
  } else if (acct.error) {
    body = <p className="text-[13px] text-jb-danger">{typeof acct.error === 'string' ? i18n.board.cloudAccountFailed(acct.error) : <LocalText value={acct.error} />}</p>;
  } else if (!account && acct.loading) {
    body = <div className="flex items-center gap-2 text-[13px] text-jb-muted"><Loader2 className="size-4 animate-spin" />{i18n.board.cloudStageChecking}</div>;
  } else if (signedOut || loginFromJob) {
    const command = signedOut?.loginCommand ?? job?.error?.loginCommand ?? 'npx joplo login';
    body = <LoginBlock command={command} message={signedOut?.message ?? job?.error?.message} onCheck={() => void check()} checking={acct.loading} stillOut={stillOut} />;
  } else {
    const running = job?.state === 'running';
    // 发布只包含确认过的方案：所选范围里没有时先说清楚、给出下一步，不让作者点了发布才看到英文报错
    const unpicked = cloudUnpicked(choice, ctx, picks);
    body = (
      <div className="flex flex-col gap-3">
        {account?.signedIn ? (
          <p className="truncate text-[12px] text-jb-muted" data-testid="cloud-account">
            {i18n.board.cloudSignedInAs(account.email)}
            {account.plan ? ` · ${account.plan === 'pro' ? i18n.board.cloudPlanPro : i18n.board.cloudPlanFree}` : ''}
          </p>
        ) : null}
        {account?.signedIn ? (
          <StorageUsage
            storage={job?.state === 'done' && job.result?.storage ? job.result.storage : account.storage}
            server={account.server}
            plan={account.plan}
            full={job?.state === 'failed' && !!job.error?.storage}
          />
        ) : null}
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-semibold tracking-[0.5px] text-jb-muted">{i18n.board.cloudScope}</div>
          <ScopeRadio value={choice} onChange={setChoice} ctx={ctx} names={names} disabled={running || !model.linksReady} />
          <p className="text-[12px] leading-[1.45] text-jb-faint">{i18n.board.cloudScopeNote}</p>
        </div>
        <VisibilityFields visibility={restricted ? 'private' : visibility} review={review} onVisibility={setVisibility} onReview={setReview} disabled={running || !model.linksReady} restricted={restricted} />
        {unpicked && !running ? (
          <div className="flex flex-col gap-1 rounded-[8px] border border-jb-accent bg-jb-selected px-3 py-2" data-testid="cloud-unpicked" data-scope={unpicked}>
            <div className="text-[13px] font-semibold">{i18n.board.cloudNotPickedTitle}</div>
            <p className="text-[12px] leading-[1.5]">
              {unpicked === 'project' ? i18n.board.cloudNotPickedProject : unpicked === 'scenario' ? i18n.board.cloudNotPickedScenario(names.feature) : i18n.board.cloudNotPickedFeature(names.feature)}
            </p>
            <p className="text-[12px] leading-[1.5] text-jb-muted">{i18n.board.cloudNotPickedHow}</p>
          </div>
        ) : null}
        {running && job ? <Progress job={job} /> : null}
        {job?.state === 'done' && job.result ? <Result job={job as CloudJob & { result: NonNullable<CloudJob['result']> }} onFlash={onFlash} server={account?.server ?? 'https://cloud.joplo.app'} /> : null}
        {job?.state === 'failed' && job.error?.storage && !unpicked ? <StorageFull full={job.error.storage} plan={account?.signedIn ? account.plan : null} /> : null}
        {job?.state === 'failed' && job.error && !job.error.storage && !unpicked ? (
          <div className="flex flex-col gap-1 rounded-[8px] border border-jb-danger bg-jb-danger-bg px-3 py-2" data-testid="cloud-error">
            <div className="text-[13px] font-semibold text-jb-danger">{i18n.board.cloudFailed}</div>
            <p className="whitespace-pre-wrap break-words font-jb-mono text-[12px]">{job.error.message}</p>
          </div>
        ) : null}
        {model.startError ? <p className="text-[12px] text-jb-danger"><LocalText value={model.startError} /></p> : null}
        <button
          type="button"
          disabled={running || !model.linksReady || !!unpicked}
          onClick={() => void model.publish(ctx, choice, restricted ? 'private' : visibility, review)}
          className="jb-focus inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-jb-cloud px-4 font-jb text-[14px] font-semibold text-jb-on-cloud hover:bg-jb-cloud-hover disabled:opacity-60"
          data-testid="cloud-publish"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
          {!model.linksReady ? i18n.board.cloudStageChecking : running ? i18n.board.cloudPublishing : job?.state === 'done' ? i18n.board.cloudPublishAgain : job?.state === 'failed' ? i18n.board.cloudTryAgain : i18n.board.cloudPublishButton}
        </button>
      </div>
    );
  }

  return (
    <Popover open={model.open} anchor={model.anchor} onClose={() => model.setOpen(false)} placement="bottom-end" width={380} label={i18n.board.cloudTitle} testid="cloud-popover">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-jb-cloud text-jb-on-cloud"><Cloud className="size-4" /></span>
          <span className="flex-1 text-[15px] font-semibold">{i18n.board.cloudTitle}</span>
          <Btn size={28} variant="ghost" icon={<X className="size-4" />} label={i18n.board.cloudClose} iconOnly onClick={() => model.setOpen(false)} data-testid="cloud-close" />
        </div>
        {body}
      </div>
    </Popover>
  );
}
