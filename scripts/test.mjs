import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testRoot = new URL('../tools/entropyfx/tests/', import.meta.url);
const tests = (await readdir(testRoot))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => fileURLToPath(new URL(name, testRoot)));
const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
});
if (result.error)
  throw result.error;
process.exitCode = result.status ?? 1;
