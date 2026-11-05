import { applyPatch } from '../../src/store.ts';
try {
  console.log(
    JSON.stringify(
      await applyPatch(process.argv[2]!, JSON.parse(process.argv[3]!)),
    ),
  );
} catch (e: any) {
  console.log(
    JSON.stringify({ ok: false, error: { code: e.code, details: e.details } }),
  );
}
