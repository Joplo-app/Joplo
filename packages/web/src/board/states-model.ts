import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/**
 * 看板（创作侧）的状态与细节（D55「细节与状态 v1」，纯函数）：场景完成后的“下一个情况”、缺口横幅、编译出错横幅、
 * 导出视频的进度。不进发布站。
 */
import type { Diagnostic, Project } from '@joplo-app/core';
import type { VideoJob } from '../runtime/dev-client';
import { optionsOf } from '../runtime/views';
import { gapCommand, letterOf, statusOf } from './nav-model';

/** 左栏顺序里，当前方案已表达的下一个情况；没有就是 null（不从头绕回）。caseId = null 时从第一个开始找。 */
export function nextCase(project: Project, featureId: string, optionId: string | null, caseId: string | null): { caseId: string; title: string } | null {
  const f = project.features[featureId];
  if (!f || !optionId) return null;
  const start = caseId === null ? 0 : f.caseIds.indexOf(caseId) + 1;
  if (caseId !== null && start === 0) return null;
  for (const c of f.caseIds.slice(start)) if (statusOf(project, optionId, c) === 'expressed' && project.cases[c]) return { caseId: c, title: project.cases[c]!.title };
  return null;
}

/** 缺口横幅：给 Agent 的话；“看方案 X 怎么处理”取第一个已表达这个情况的其他方案，没有就是 null。 */
export function gapBanner(project: Project, featureId: string, optionId: string | null, caseId: string | null, i18n: BoardMessages = boardEnglish): { letter: string; caseTitle: string; agentText: string; alt: { optionId: string; letter: string } | null } | null {
  if (!optionId || !caseId) return null;
  const letter = letterOf(project, optionId);
  const caseTitle = project.cases[caseId]?.title ?? caseId;
  const other = optionsOf(project, featureId).find((o) => o.id !== optionId && statusOf(project, o.id, caseId) === 'expressed');
  return {
    letter,
    caseTitle,
    agentText: i18n.board.addAScenarioForToOption(letter, caseTitle, gapCommand(optionId)),
    alt: other ? { optionId: other.id, letter: letterOf(project, other.id) } : null,
  };
}

/** 编译出错横幅：错误数与第一条（文件:行 + 说明）；没有错误时 null。 */
export function diagnosticsSummary(list: readonly Diagnostic[]): { count: number; first: { at: string | null; message: string } } | null {
  const errors = list.filter((d) => d.severity === 'error');
  if (!errors.length) return null;
  return { count: errors.length, first: { at: errors[0]!.at ?? null, message: errors[0]!.message } };
}

const PHASE = (i18n: BoardMessages = boardEnglish): Record<VideoJob['phase'], string> => ({ starting: i18n.board.startingBrowser, recording: '', saving: i18n.board.saving, done: i18n.board.done, error: i18n.board.failure });

/** 导出视频的进度（「导出」按钮上的进度环、菜单里的进度卡、完成 / 失败提示）。 */
export function exportProgress(job: VideoJob | null | undefined, scenarioName: string, i18n: BoardMessages = boardEnglish): { running: boolean; percent: number; text: string; step: string; done: boolean; error: string | null } | null {
  if (!job) return null;
  const running = job.status === 'running';
  const done = job.status === 'done';
  return {
    running,
    percent: Math.max(0, Math.min(100, job.percent)),
    text: done ? i18n.board.exported2(job.file ?? '').trim() : i18n.board.recording(scenarioName),
    step: job.phase === 'recording' ? i18n.board.step(job.step, job.total) : PHASE(i18n)[job.phase],
    done,
    error: job.status === 'error' ? (job.error ?? i18n.board.exportFailed) : null,
  };
}
