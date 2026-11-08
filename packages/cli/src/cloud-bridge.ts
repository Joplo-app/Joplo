/**
 * 看板直接发布到云端（D76）的 CLI 一侧：`joplo dev` 启动看板时把它注入给 @joplo-app/server。
 * - account：只读本机登录（credentials.json 或 JOPLO_API_KEY），再问一次云端拿邮箱和套餐；没登录时给出与 CLI 一致的登录命令。
 * - publish：就是 `joplo share`（同一个 share()，同一套检查、构建、上传和 .joplo/cloud.json 记录），非交互：没登录时报 AUTH_REQUIRED，不打开浏览器。
 * - voice（D85 托管朗读）：status = 登录状态 + `GET /api/v1/voice`（额度、音色表；旧云端 404 或连不上时 voice 为 null）；
 *   speech = `POST /api/v1/voice/speech`（cloud-voice.ts），失败抛 { code, message, data }。看板（VoiceHub）与 `joplo voice` 都用它。
 * 令牌只在这个进程里：进度行与错误信息都先去掉记住的密钥，再交给看板。
 */
import { JoploError } from '@joplo-app/core';
import type { buildSite, CloudAccount, CloudBridge, CloudPublishRequest, CloudPublishResult, CloudSpeechRequest, CloudSpeechResult, CloudVoiceBridge, CloudVoiceStatus } from '@joplo-app/server';
import { CloudError } from './cloud-error.ts';
import type { RenderPreview } from './cloud-embed.ts';
import { CloudClient, type CloudDependencies } from './cloud.ts';
import { fetchVoiceInfo, speech, speechFailure } from './cloud-voice.ts';

export const DEFAULT_CLOUD_SERVER = 'https://cloud.joplo.app';

/**
 * 登录命令：默认服务器不带 --server；其他服务器带上，和 CLI 的提示一致。
 * 看板进程设置了 JOPLO_HOME 时（凭证存在那里），命令前面带上同一个 JOPLO_HOME，否则登录写进 ~/.joplo，这个看板读不到。
 */
export const loginCommand = (server: string, joploHome?: string): string => {
  const cmd = server === DEFAULT_CLOUD_SERVER ? 'npx joplo login' : `npx joplo login --server ${server}`;
  const home = joploHome?.trim();
  return home ? `JOPLO_HOME=${/^[\w./~-]+$/.test(home) ? home : `'${home.replace(/'/g, `'\\''`)}'`} ${cmd}` : cmd;
};

const AUTH_CODES = new Set(['AUTH_REQUIRED', 'AUTH_EXPIRED']);

export type BridgeOptions = {
  version: string;
  deps?: CloudDependencies;
  build: typeof buildSite;
  render: () => Promise<RenderPreview>;
};

export function cloudBridge(opts: BridgeOptions): CloudBridge {
  const client = (warn: (line: string) => void, secrets: Set<string>) =>
    new CloudClient(undefined, opts.version, warn, (s) => secrets.add(s), { ...opts.deps, interactive: false });
  const redactor = (secrets: Set<string>) => (s: string) => {
    for (const t of secrets) s = s.split(t).join('[REDACTED]');
    return s;
  };
  const home = () => (opts.deps?.env ?? process.env).JOPLO_HOME;
  const command = (server: string) => loginCommand(server, home());
  const fixOf = (e: unknown, server: string): string => {
    const fix = (e as { details?: { fix?: unknown } }).details?.fix;
    return typeof fix === 'string' && fix.includes('--server') && !home()?.trim() ? fix : command(server);
  };

  const voice: CloudVoiceBridge = {
    async status(): Promise<CloudVoiceStatus> {
      const secrets = new Set<string>();
      const c = client(() => undefined, secrets);
      const signedOut = (cmd = command(c.server)): CloudVoiceStatus => ({ signedIn: false, server: c.server, loginCommand: cmd });
      let auth;
      try {
        auth = await c.auth(true);
      } catch (e) {
        if (e instanceof CloudError && AUTH_CODES.has(e.code)) return signedOut(fixOf(e, c.server));
        if (e instanceof JoploError) return signedOut();
        throw e;
      }
      if (!auth) return signedOut();
      try {
        return { signedIn: true, server: c.server, voice: await fetchVoiceInfo(c, auth.token) };
      } catch (e) {
        if (e instanceof CloudError && AUTH_CODES.has(e.code)) return signedOut(fixOf(e, c.server));
        return { signedIn: true, server: c.server, voice: null };
      }
    },
    async speech(req: CloudSpeechRequest): Promise<CloudSpeechResult> {
      const secrets = new Set<string>();
      const redact = redactor(secrets);
      const c = client(() => undefined, secrets);
      try {
        const auth = await c.auth(true);
        if (!auth) throw new CloudError('AUTH_REQUIRED', `Joplo Cloud narration needs a Joplo account. Run ${command(c.server)}`);
        return await speech(c, auth.token, req);
      } catch (e) {
        const f = speechFailure(e instanceof JoploError ? new CloudError('AUTH_REQUIRED', e.message) : e);
        f.message = redact(f.message);
        throw f;
      }
    },
  };

  return {
    voice,
    async account(): Promise<CloudAccount> {
      const secrets = new Set<string>();
      const redact = redactor(secrets);
      const c = client(() => undefined, secrets);
      const signedOut = (message?: string, cmd = command(c.server)): CloudAccount => ({ signedIn: false, server: c.server, loginCommand: cmd, ...(message ? { message: redact(message) } : {}) });
      let auth;
      try {
        auth = await c.auth(true);
      } catch (e) {
        if (e instanceof CloudError && AUTH_CODES.has(e.code)) return signedOut(e.message, fixOf(e, c.server));
        if (e instanceof JoploError) return signedOut(e.message);
        throw e;
      }
      if (!auth) return signedOut();
      try {
        // 朗读额度（D85）与账号一起取；旧云端（404）或这一项出错时只是不显示
        const [me, v] = await Promise.all([c.me(auth.token), fetchVoiceInfo(c, auth.token).catch(() => null)]);
        return { signedIn: true, server: c.server, email: me.user.email, plan: me.plan, ...(me.storage ? { storage: me.storage } : {}), ...(v ? { voice: v.quota } : {}) };
      } catch (e) {
        if (e instanceof CloudError && AUTH_CODES.has(e.code)) return signedOut(e.message, fixOf(e, c.server));
        // 云端暂时连不上：仍然算已登录（发布时再报网络错误），邮箱用本机登录里记的
        const stored = auth.source === 'session' ? await c.credentials(true).catch(() => null) : null;
        return { signedIn: true, server: c.server, email: stored?.user.email ?? 'API key (JOPLO_API_KEY)', plan: null };
      }
    },

    async publish(projectDir: string, request: CloudPublishRequest, progress: (line: string) => void): Promise<CloudPublishResult> {
      const secrets = new Set<string>();
      const redact = redactor(secrets);
      const c = client((line) => progress(redact(line)), secrets);
      try {
        const { share } = await import('./cloud-share.ts');
        const { result, plan } = await share(c, projectDir, { ...(request.scenarios?.length ? { scenarios: request.scenarios } : {}), ...(request.features?.length ? { features: request.features } : {}) }, opts.build, opts.render);
        return { shareId: result.shareId, url: result.url, expiresAt: result.expiresAt, version: result.version, plan, ...(result.scope ? { scope: result.scope } : {}), ...(result.storage ? { storage: result.storage } : {}) };
      } catch (e) {
        const code = e instanceof CloudError || e instanceof JoploError ? e.code : 'INTERNAL';
        // 检查没过：带上第一条错误的位置，看板里直接能看到改哪里
        const diag = e instanceof JoploError ? e.diagnostics.find((d) => d.severity === 'error') : undefined;
        const message = redact(`${e instanceof Error ? e.message : String(e)}${diag ? `\n${diag.at ? `${diag.at}  ` : ''}${diag.message}` : ''}`);
        // 容量不足（C27）：把数字和链接交给看板，画成红色提示，不只是一段英文报错
        const details = e instanceof CloudError ? e.details as { kind?: unknown } | undefined : undefined;
        const storage = code === 'QUOTA_EXCEEDED' && details?.kind === 'storage' ? (({ kind: _kind, ...rest }) => rest)(details as Record<string, unknown>) : undefined;
        throw Object.assign(new Error(message), { code, ...(AUTH_CODES.has(code) ? { loginCommand: fixOf(e, c.server) } : {}), ...(storage ? { storage } : {}) });
      }
    },
  };
}
