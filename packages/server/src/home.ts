/**
 * 本机看板的持久数据（D39）：一个本机只运行一个看板进程，它记住打开过的项目。
 *
 * - `<JOPLO_HOME>/projects.json`：`{ version: 1, projects: [{ dir, name, lastOpened }] }`，按 lastOpened 倒序显示。
 *   写入点：hub 启动时登记首个项目、注册接口（再次 `joplo dev`）、编译成功后更新名称、移除接口。
 *   读取点：hub 的项目列表接口 → 看板首页左栏。原子写入（临时文件 + rename）。
 * - `<JOPLO_HOME>/server.json`：`{ port, pid, token }`，权限 0600。写入点：hub 开始监听后；
 *   读取点：`joplo dev` 启动时判断是否已有存活的看板；hub 关闭时删除（只删自己写的那份）。
 *
 * JOPLO_HOME 缺省为 ~/.joplo。测试一律把 JOPLO_HOME 指向临时目录。
 * 删除记录只改 projects.json，从不触碰项目目录。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ProjectRecord = { dir: string; name: string; lastOpened: string };
export type ServerInfo = { port: number; pid: number; token: string };

export function joploHome(env: Record<string, string | undefined> = process.env): string {
  const v = env.JOPLO_HOME;
  return v && v.trim() ? path.resolve(v) : path.join(os.homedir(), '.joplo');
}

/** 项目在 URL 里的标识：目录名（小写、只留安全字符）+ 目录绝对路径的短哈希，稳定且不暴露完整路径。 */
export function projectIdOf(dir: string): string {
  const base = path.basename(dir).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'project';
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 6);
  return `${base}-${hash}`;
}

function atomicWrite(file: string, text: string, mode?: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
  if (mode !== undefined) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}

const isRecord = (v: unknown): v is ProjectRecord => {
  const r = v as ProjectRecord;
  return !!r && typeof r === 'object' && typeof r.dir === 'string' && path.isAbsolute(r.dir) && typeof r.name === 'string' && typeof r.lastOpened === 'string';
};

export class Registry {
  readonly file: string;
  constructor(readonly home: string) {
    this.file = path.join(home, 'projects.json');
  }

  /** 读取记录（文件不存在或损坏时为空列表；无效条目跳过），按最近打开排序。 */
  list(): ProjectRecord[] {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return [];
    }
    const items = (raw as { projects?: unknown })?.projects;
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    const out: ProjectRecord[] = [];
    for (const it of items) {
      if (!isRecord(it) || seen.has(it.dir)) continue;
      seen.add(it.dir);
      out.push({ dir: it.dir, name: it.name, lastOpened: it.lastOpened });
    }
    return out.sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
  }

  private save(list: ProjectRecord[]) {
    atomicWrite(this.file, JSON.stringify({ version: 1, projects: list }, null, 2) + '\n');
  }

  /** 登记或更新一个项目（打开时间刷新为现在）。 */
  touch(dir: string, name?: string): ProjectRecord {
    const list = this.list();
    const prev = list.find((p) => p.dir === dir);
    const rec: ProjectRecord = { dir, name: name ?? prev?.name ?? path.basename(dir), lastOpened: new Date().toISOString() };
    this.save([rec, ...list.filter((p) => p.dir !== dir)]);
    return rec;
  }

  /** 只更新名称（编译成功后用 config 的 name），不改变打开时间；记录不存在时不新增。 */
  rename(dir: string, name: string) {
    const list = this.list();
    const rec = list.find((p) => p.dir === dir);
    if (!rec || rec.name === name) return;
    rec.name = name;
    this.save(list);
  }

  /** 从列表移除；返回是否存在。只改 projects.json。 */
  remove(dir: string): boolean {
    const list = this.list();
    const next = list.filter((p) => p.dir !== dir);
    if (next.length === list.length) return false;
    this.save(next);
    return true;
  }
}

export const serverInfoFile = (home: string) => path.join(home, 'server.json');

export function readServerInfo(home: string): ServerInfo | null {
  try {
    const v = JSON.parse(fs.readFileSync(serverInfoFile(home), 'utf8')) as ServerInfo;
    if (Number.isInteger(v.port) && v.port > 0 && Number.isInteger(v.pid) && v.pid > 0 && typeof v.token === 'string' && v.token) return v;
  } catch {
    // 不存在或损坏：视为没有运行中的看板
  }
  return null;
}

export function writeServerInfo(home: string, info: ServerInfo) {
  atomicWrite(serverInfoFile(home), JSON.stringify(info) + '\n', 0o600);
}

/** 只删除自己写的 server.json（pid 一致），不误删后来者的。 */
export function clearServerInfo(home: string, pid: number) {
  const cur = readServerInfo(home);
  if (cur && cur.pid !== pid) return;
  try {
    fs.rmSync(serverInfoFile(home), { force: true });
  } catch {
    // 忽略
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ---------- 看板设置（D51）：<JOPLO_HOME>/settings.json ----------
/**
 * `{ version: 1, theme?: string | null, projects?: { [项目 id]: { theme: string | null } } }`
 * theme：所有项目的主题选择；projects[id].theme：按项目覆盖，null 表示“恢复为项目默认”（使用项目 config 里的主题）。
 * 写入点：看板设置页（PUT /__joplo/settings）；读取点：看板演示页与设置页（GET /__joplo/settings）。原子写入。
 */
export type BoardSettings = { version: 1; theme?: string | null; projects?: Record<string, { theme: string | null }> };
const NAME = /^[A-Za-z][\w-]*$/;

/** 校验并规范化设置（未知字段丢弃，主题名不合法的条目丢弃）。 */
export function normalizeSettings(v: unknown): BoardSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: BoardSettings = { version: 1 };
  if (typeof o.theme === 'string' && NAME.test(o.theme)) out.theme = o.theme;
  else if (o.theme === null) out.theme = null;
  const projects = o.projects && typeof o.projects === 'object' ? (o.projects as Record<string, unknown>) : {};
  const p: Record<string, { theme: string | null }> = {};
  for (const [id, x] of Object.entries(projects)) {
    if (!/^[\w-]{1,64}$/.test(id) || !x || typeof x !== 'object') continue;
    const t = (x as { theme?: unknown }).theme;
    if (t === null || (typeof t === 'string' && NAME.test(t))) p[id] = { theme: t };
  }
  if (Object.keys(p).length) out.projects = p;
  return out;
}

export function readSettings(home: string): BoardSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')));
  } catch {
    return { version: 1 };
  }
}

export function writeSettings(home: string, s: unknown): BoardSettings {
  const n = normalizeSettings(s);
  atomicWrite(path.join(home, 'settings.json'), JSON.stringify(n, null, 2) + '\n');
  return n;
}
