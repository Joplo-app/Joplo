import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { JoploError, LOCAL_REVIEW_VERSION, type LocalReviewSession } from '../src/index.ts';
import { listLocalReviews, localReviewFile, readLocalReview, writeLocalReview } from '../src/local-review-files.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const temp = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-review-files-')));
  dirs.push(dir);
  return dir;
};
const session = (dir: string): LocalReviewSession => ({
  v: LOCAL_REVIEW_VERSION, id: `rv_${crypto.randomBytes(16).toString('hex')}`, instanceId: crypto.randomUUID(), ownerPid: process.pid,
  projectId: 'project', projectDir: dir, projectName: 'Project', featureId: null, featureName: null,
  workId: 'intro', workTitle: 'Intro', revision: 'a'.repeat(64), createdAt: new Date().toISOString(),
  url: 'http://localhost:4790/#/project/f/intro', events: [],
});

it('lists only the current version while preserving all files', () => {
  const dir = temp(), current = session(dir), old = { ...session(dir), v: 1 };
  const currentFile = localReviewFile(dir, current.id), oldFile = localReviewFile(dir, old.id);
  writeLocalReview(currentFile, current);
  writeLocalReview(oldFile, old);
  const before = fs.readFileSync(oldFile);
  expect(listLocalReviews(dir)).toEqual([current]);
  expect(readLocalReview(dir, current.id)).toEqual(current);
  expect(fs.readFileSync(oldFile)).toEqual(before);
});

it.each([1, 999])('explicitly reading a non-current version %s reports NOT_FOUND and requests a new review', v => {
  const dir = temp(), old = { ...session(dir), v };
  const file = localReviewFile(dir, old.id);
  writeLocalReview(file, old);
  expect(listLocalReviews(dir)).toEqual([]);
  expect(() => readLocalReview(dir, old.id)).toThrowError(JoploError);
  expect(() => readLocalReview(dir, old.id)).toThrowError(expect.objectContaining({
    code: 'NOT_FOUND', message: expect.stringMatching(/older version of Joplo.*start a new review/i),
  }));
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(old);
});

it('keeps malformed JSON and invalid current records visible as errors', () => {
  const dir = temp(), current = session(dir), file = localReviewFile(dir, current.id);
  writeLocalReview(file, current);
  fs.writeFileSync(file, '{');
  expect(() => readLocalReview(dir, current.id)).toThrow(SyntaxError);
  expect(() => listLocalReviews(dir)).toThrow(SyntaxError);
  writeLocalReview(file, { ...current, workId: '' });
  expect(() => readLocalReview(dir, current.id)).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA' }));
  expect(() => listLocalReviews(dir)).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA' }));
});
