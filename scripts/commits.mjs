#!/usr/bin/env node
/**
 * 提交前缀与发布说明（D73，见 docs/release.md「提交信息约定」）。
 *
 *   node scripts/commits.mjs notes <tag> [--repo owner/repo]   打印 GitHub Release 说明：上一个 v* tag 到 <tag> 的提交按类型分组
 *   node scripts/commits.mjs check <git 范围> [--strict]        列出没有约定前缀的提交标题；默认输出 ::warning::，--strict 时以 1 退出
 *
 * 只有 feat / fix / perf 和破坏性变更（类型后加 !，或正文里有 BREAKING CHANGE:）进入发布说明；其他类型是内部改动。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'ci', 'build', 'style', 'revert', 'release'];
const SUBJECT = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (.+)$/i;
const SECTIONS = [['breaking', '破坏性变更'], ['feat', '新功能'], ['fix', '修复'], ['perf', '性能']];

/** { hash, subject, body } → { type, scope, text, breaking, hash }；没有约定前缀时返回 null。 */
export function parseCommit({ hash, subject, body = '' }) {
  const m = SUBJECT.exec(subject.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (!TYPES.includes(type)) return null;
  return { type, scope: m[2] ?? null, text: m[4].trim(), breaking: Boolean(m[3]) || /^BREAKING[ -]CHANGE: /m.test(body), hash };
}

/** 合并提交、git 生成的 Revert 标题不要求前缀。 */
const exempt = (s) => /^Merge (branch|pull request|remote-tracking branch|tag) /.test(s) || /^Revert "/.test(s);

export function invalidSubjects(subjects) {
  return subjects.filter((s) => !exempt(s) && !parseCommit({ subject: s }));
}

/** 生成 Release 说明（Markdown）。summary 是 CHANGELOG 里这一版手写的段落（可选），放在最前面。 */
export function releaseNotes(commits, { tag, prev, repo, summary }) {
  const groups = new Map(SECTIONS.map(([k]) => [k, []]));
  for (const commit of commits) {
    const p = parseCommit(commit);
    if (!p) continue;
    const key = p.breaking ? 'breaking' : p.type;
    if (!groups.has(key)) continue;
    groups.get(key).push(`- ${p.scope ? `**${p.scope}**: ` : ''}${p.text}（${p.hash.slice(0, 7)}）`);
  }
  const out = [];
  if (summary?.trim()) out.push(summary.trim(), '');
  const sections = SECTIONS.filter(([k]) => groups.get(k).length);
  if (sections.length) for (const [k, title] of sections) out.push(`### ${title}`, '', ...groups.get(k), '');
  else if (!summary?.trim()) out.push('这一版没有面向用户的新功能或修复（只有构建、测试、文档等内部改动）。', '');
  if (prev) out.push(`完整变更：https://github.com/${repo}/compare/${prev}...${tag}`);
  return out.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------- git

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

function commitsIn(range) {
  const raw = git(['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', range]);
  if (raw === null) throw new Error(`git log ${range} 失败`);
  return raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [hash, subject, body] = r.split('\x1f');
    return { hash, subject, body: body ?? '' };
  });
}

/** CHANGELOG.md 里 “## <版本>” 到下一个 “## ” 之间的内容。 */
function changelogSection(version) {
  const file = path.resolve(import.meta.dirname, '../CHANGELOG.md');
  if (!fs.existsSync(file)) return '';
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
  const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const cmd = args.shift();
  if (cmd === 'notes') {
    const repo = opt('--repo') ?? process.env.GITHUB_REPOSITORY ?? 'Joplo-app/Joplo';
    const tag = args[0];
    if (!tag) { console.error('用法：node scripts/commits.mjs notes <tag> [--repo owner/repo]'); process.exit(2); }
    const prev = git(['describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`])?.trim() || null;
    const commits = commitsIn(prev ? `${prev}..${tag}` : tag);
    process.stdout.write(releaseNotes(commits, { tag, prev, repo, summary: changelogSection(tag.replace(/^v/, '')) }));
  } else if (cmd === 'check') {
    const strict = flag('--strict');
    const range = args[0];
    if (!range) { console.error('用法：node scripts/commits.mjs check <git 范围> [--strict]'); process.exit(2); }
    const bad = invalidSubjects(commitsIn(range).map((c) => c.subject));
    const hint = `提交标题要以 ${TYPES.join(' / ')} 加冒号和空格开头，例如 “feat: …”、“fix(web): …”（docs/release.md「提交信息约定」）`;
    for (const s of bad) console.log(strict ? `✗ ${s}` : `::warning title=提交标题缺少约定前缀::${s}`);
    if (bad.length) console.log(strict ? `✗ ${bad.length} 个提交标题缺少约定前缀。${hint}` : `::warning::${bad.length} 个提交标题缺少约定前缀。${hint}`);
    else console.log(`✓ ${range} 的提交标题都符合约定`);
    if (strict && bad.length) process.exit(1);
  } else {
    console.error('用法：node scripts/commits.mjs notes <tag> | check <git 范围> [--strict]');
    process.exit(2);
  }
}
