import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const expected = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();
if (process.versions.node !== expected)
  throw new Error(`Expected Node.js ${expected}, found ${process.versions.node}`);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('check.mjs', import.meta.url))], {
  stdio: 'inherit',
});
if (result.error)
  throw result.error;
process.exitCode = result.status ?? 1;
