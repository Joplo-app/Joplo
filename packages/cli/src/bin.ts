#!/usr/bin/env -S tsx
import { Command, CommanderError, Option } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  get,
  initProject,
  applyPatch,
  readProject,
  validate,
  history,
  restore,
  guide,
  JoploError,
  result,
} from '@joplo/core';
import { domain, failure } from './common.ts';
import { render, serve } from './render.ts';
import { startMcp } from './mcp.ts';
const program = new Command();
program
  .name('joplo')
  .description('Joplo 本地原型项目工具')
  .exitOverride()
  .configureOutput({
    writeOut: (s) => process.stderr.write(s),
    writeErr: (s) => process.stderr.write(s),
  });
const emit = async (run: Parameters<typeof domain>[0]) => {
  const r = await domain(run);
  process.stdout.write(JSON.stringify(r) + '\n');
  if (!r.ok) process.exitCode = r.error.code === 'USAGE' ? 2 : 1;
};
const int = (s: string) => {
  const n = Number(s);
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(n) || n < 1 || n > 65535)
    throw new JoploError('USAGE', '端口必须为 1–65535');
  return n;
};
program
  .command('init')
  .argument('<dir>')
  .requiredOption('--name <name>')
  .action((dir, o) => emit(() => initProject(dir, { name: o.name })));
program
  .command('guide')
  .addOption(
    new Option('--format <format>').choices(['json', 'text']).default('json'),
  )
  .action((o) =>
    emit(() =>
      result({ id: 'joplo', revision: 0 }, 'Agent 工作说明', guide(o.format)),
    ),
  );
program
  .command('get')
  .argument('<dir>')
  .requiredOption('--scope <scope>')
  .option('--id <id>')
  .option('--revision <revision>')
  .option('--status <status>')
  .action((dir, o) => emit(() => get(dir, o)));
program
  .command('apply')
  .argument('<dir>')
  .requiredOption('--patch <file|->')
  .option('--expect-revision <revision>')
  .option('--idempotency-key <key>')
  .option('--dry-run')
  .action((dir, o) =>
    emit(async () => {
      let text: string;
      if (o.patch === '-') {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin)
          chunks.push(Buffer.from(chunk));
        text = Buffer.concat(chunks).toString('utf8');
      } else {
        text = await readFile(o.patch, 'utf8');
      }
      let patch: unknown;
      try {
        patch = JSON.parse(text);
      } catch {
        throw new JoploError('INVALID_SCHEMA', 'Patch JSON 无效');
      }
      if (o.expectRevision !== undefined || o.idempotencyKey !== undefined) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch))
          throw new JoploError('INVALID_SCHEMA', 'Patch 必须是对象');
        patch = {
          ...patch,
          ...(o.expectRevision === undefined
            ? {}
            : { expectRevision: o.expectRevision }),
          ...(o.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: o.idempotencyKey }),
        };
      }
      return applyPatch(dir, patch, { dryRun: o.dryRun });
    }),
  );
program
  .command('validate')
  .argument('<dir>')
  .option('--option-id <id>')
  .addOption(
    new Option('--mode <mode>')
      .choices(['structure', 'replay', 'all'])
      .default('all'),
  )
  .action((dir, o) =>
    emit(async () => {
      const p = await readProject(dir);
      const report = validate(p, { mode: o.mode, optionId: o.optionId });
      return result(p, '校验完成', report, { diagnostics: report.diagnostics });
    }),
  );
program
  .command('history')
  .argument('<dir>')
  .action((dir) => emit(() => history(dir)));
program
  .command('restore')
  .argument('<dir>')
  .requiredOption('--revision <revision>')
  .requiredOption('--expect-revision <revision>')
  .requiredOption('--idempotency-key <key>')
  .action((dir, o) => emit(() => restore(dir, o)));
program
  .command('serve')
  .argument('<dir>')
  .option('--port <port>', '回环服务端口', int)
  .option('--open')
  .action((dir, o) =>
    emit(() => serve({ projectDir: resolve(dir), port: o.port, open: o.open })),
  );
program
  .command('render')
  .argument('<dir>')
  .requiredOption('--scenario-id <id>')
  .option('--option-id <id>')
  .option('--step-id <id>')
  .addOption(new Option('--theme <theme>').choices(['sketch', 'clean']))
  .requiredOption('--out <file>')
  .option('--width <pixels>', '视口宽度，需同时提供 height', Number)
  .option('--height <pixels>', '视口高度，需同时提供 width', Number)
  .action((dir, o) =>
    emit(() => {
      if ((o.width === undefined) !== (o.height === undefined))
        throw new JoploError('USAGE', 'width 与 height 必须同时提供');
      return render(
        resolve(dir),
        {
          scenarioId: o.scenarioId,
          optionId: o.optionId,
          stepId: o.stepId,
          theme: o.theme,
          viewport:
            o.width === undefined
              ? undefined
              : { width: o.width, height: o.height },
        },
        o.out,
      );
    }),
  );
program
  .command('mcp')
  .requiredOption('--project <dir>')
  .addOption(
    new Option('--transport <transport>').choices(['stdio']).default('stdio'),
  )
  .action(async (o) => {
    await startMcp(o.project);
  });
try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (
    e instanceof CommanderError &&
    ['commander.helpDisplayed', 'commander.version'].includes(e.code)
  )
    process.exitCode = 0;
  else {
    const error =
      e instanceof CommanderError ? new JoploError('USAGE', e.message) : e;
    const f = failure(error);
    if (process.argv[2] === 'mcp')
      process.stderr.write(JSON.stringify(f) + '\n');
    else process.stdout.write(JSON.stringify(f) + '\n');
    process.exitCode = f.error.code === 'USAGE' ? 2 : 1;
  }
}
