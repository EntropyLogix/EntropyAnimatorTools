import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, { stdio: 'inherit' });
  if (result.error)
    throw result.error;
  if (result.status !== 0)
    process.exit(result.status ?? 1);
}

async function codeFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory())
      files.push(...await codeFiles(target));
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name))
      files.push(fileURLToPath(target));
  }
  return files;
}

run([fileURLToPath(new URL('scripts/check-repository.mjs', root))]);
for (const file of await codeFiles(new URL('scripts/', root)))
  run(['--check', file]);
for (const file of await codeFiles(new URL('tools/', root)))
  run(['--check', file]);
run([fileURLToPath(new URL('scripts/test.mjs', root))]);
