/**
 * 看板首页左栏底部的 Joplo Cloud 账号卡片（D85，原型 examples/joplo 的 cloud_usage，用户确认方案 A）：
 * 套餐、邮箱、空间（已用 / 上限，C27 的 storage）、朗读（免费写“体验额度”，Pro 写“本月 · 几号重置”）、“用量与音色 ↗”（`<server>/usage`）。
 * - 没登录：写一句说明和可复制的登录命令；
 * - 云端连不上（已登录但账号接口失败，或旧云端没有这些数字）：不显示数字，只写连不上；
 * - 旧 CLI 启动的看板（没有 cloud bridge）：整张卡片不显示。
 *
 * 数据流：GET /__joplo/cloud/account（本机令牌）→ CLI 的 cloudBridge.account()（`/api/v1/me` 的 storage + `/api/v1/voice` 的 quota）→ CloudAccount → 这张卡片。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBoardI18n } from '../i18n/board/context';
import { copyText } from '../player/util';
import { fetchCloudAccount, type CloudAccount } from '../runtime/dev-client';
import { storageView } from './cloud-model';

/** 首页用：读一次账号（打开首页时）。 */
export function HomeCloudCard() {
  const [data, setData] = useState<{ available: boolean; account: CloudAccount | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCloudAccount().then((r) => alive && setData(r.ok ? { available: r.available, account: r.account } : null));
    return () => {
      alive = false;
    };
  }, []);
  if (!data?.available || !data.account) return null;
  return <CloudAccountCard account={data.account} />;
}

function Bar({ pct, tone, label }: { pct: number; tone: 'storage' | 'voice'; label: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-jb-sunken" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={cn('h-full rounded-full', tone === 'voice' ? 'bg-[#9C6ADE]' : pct >= 80 ? 'bg-[#E0AE00]' : 'bg-jb-ink')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ label, value, children, testid }: { label: string; value: ReactNode; children?: ReactNode; testid: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-semibold text-jb-muted">{label}</span>
        <span className="truncate text-jb-muted">{value}</span>
      </div>
      {children}
    </div>
  );
}

/** 卡片本身（测试直接渲染）。 */
export function CloudAccountCard({ account }: { account: CloudAccount }) {
  const { t: i18n, locale } = useBoardI18n();
  const [copied, setCopied] = useState(false);
  const shell = (children: ReactNode, state: string) => (
    <section className="mt-3 flex flex-col gap-2 rounded-[10px] border border-jb-line bg-jb-surface p-3" data-testid="home-cloud" data-state={state} aria-label="Joplo Cloud">
      {children}
    </section>
  );
  if (!account.signedIn) {
    return shell(
      <>
        <span className="text-[13px] font-semibold">Joplo Cloud</span>
        <p className="text-[12px] leading-[1.45] text-jb-muted">{i18n.board.cloudCardSignedOut}</p>
        <div className="flex h-8 items-center gap-2 rounded-[6px] border border-jb-line bg-jb-app pl-2.5 pr-1">
          <code className="min-w-0 flex-1 truncate font-jb-mono text-[12px]" data-testid="home-cloud-login">{account.loginCommand}</code>
          <button type="button" className="jb-focus flex size-6 shrink-0 items-center justify-center rounded-[4px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg" aria-label={i18n.board.copy(account.loginCommand)} onClick={() => void copyText(account.loginCommand).then(setCopied)}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </>,
      'signed-out',
    );
  }
  const storage = storageView(account.storage);
  const voice = account.voice;
  const voicePct = voice && voice.allowanceChars > 0 ? Math.max(0, Math.min(100, Math.round((Math.min(voice.remainingChars, voice.allowanceChars) / voice.allowanceChars) * 100))) : voice && voice.totalRemainingChars > 0 ? 100 : 0;
  const date = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
  const voiceText = voice ? (voice.period === 'trial' ? i18n.board.cloudCardTrial(voice.totalRemainingChars) : voice.resetsAt ? i18n.board.cloudCardMonth(voice.totalRemainingChars, date(voice.resetsAt)) : i18n.board.cloudCardMonthNoDate(voice.totalRemainingChars)) : null;
  const plan = account.plan === 'pro' ? i18n.board.cloudPlanPro : account.plan === 'free' ? i18n.board.cloudPlanFree : null;
  return shell(
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Joplo Cloud</span>
        {plan ? <span className="shrink-0 rounded-[4px] bg-jb-sunken px-1.5 py-px text-[11px] font-medium text-jb-muted" data-testid="home-cloud-plan">{plan}</span> : null}
      </div>
      <span className="truncate text-[12px] text-jb-faint" title={account.email}>{account.email}</span>
      {storage || voice ? (
        <>
          {storage ? (
            <Row label={i18n.board.cloudStorage} value={i18n.board.cloudStorageOf(storage.used, storage.quota)} testid="home-cloud-storage">
              <Bar pct={storage.pct} tone="storage" label={i18n.board.cloudStorage} />
            </Row>
          ) : null}
          {voice && voiceText ? (
            <Row label={i18n.board.cloudCardNarration} value={voiceText} testid="home-cloud-voice">
              <Bar pct={voicePct} tone="voice" label={i18n.board.cloudCardNarration} />
            </Row>
          ) : null}
          <a href={`${account.server}/usage`} target="_blank" rel="noreferrer" className="jb-focus self-start rounded-[4px] text-[12px] font-medium text-jb-cloud underline-offset-2 hover:underline" data-testid="home-cloud-usage">
            {i18n.board.cloudCardUsage}
          </a>
        </>
      ) : (
        <p className="text-[12px] text-jb-faint" data-testid="home-cloud-offline">{i18n.board.cloudCardOffline}</p>
      )}
    </>,
    storage || voice ? 'signed-in' : 'offline',
  );
}

