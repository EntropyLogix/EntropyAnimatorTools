import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'coverage', 'node_modules', 'tmp']);
const codeExtensions = new Set(['.js', '.mjs']);
const forbiddenExtensions = new Set(['.cpp', '.h', '.hpp', '.wasm']);
const errors = [];
const codeFiles = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name))
      continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(target);
      continue;
    }
    if (!entry.isFile())
      continue;
    const relative = path.relative(root, target);
    const extension = path.extname(entry.name);
    if (forbiddenExtensions.has(extension)) {
      errors.push(`${relative}: private renderer artifact is forbidden`);
      continue;
    }
    const text = await readFile(target, 'utf8');
    if (codeExtensions.has(extension))
      codeFiles.push({ relative, text });
    if (text.includes('\r\n'))
      errors.push(`${relative}: CRLF line endings`);
    if (!text.endsWith('\n'))
      errors.push(`${relative}: missing final newline`);
    text.split('\n').forEach((line, index) => {
      if (/[ \t]+$/.test(line))
        errors.push(`${relative}:${index + 1}: trailing whitespace`);
    });
  }
}

function closingCondition(line, opening) {
  let depth = 0;
  let escaped = false;
  let quote = '';
  for (let index = opening; index < line.length; index++) {
    const character = line[index];
    if (quote) {
      if (escaped)
        escaped = false;
      else if (character === '\\')
        escaped = true;
      else if (character === quote)
        quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(')
      depth++;
    else if (character === ')' && --depth === 0)
      return index;
  }
  return -1;
}

function checkCodeStyle() {
  const networkPatterns = [
    ['f', 'etch\\s*\\('].join(''),
    ['XMLHttp', 'Request'].join(''),
    ['Web', 'Socket'].join(''),
    ['node:', 'https'].join(''),
    ['node:', 'http'].join(''),
  ];
  const networkPattern = new RegExp(networkPatterns.join('|'));
  for (const { relative, text } of codeFiles) {
    if (/(^|\s)\/\/|\/\*|\*\//m.test(text))
      errors.push(`${relative}: explanatory code comments are forbidden`);
    if (networkPattern.test(text))
      errors.push(`${relative}: network access is forbidden`);
    text.split('\n').forEach((line, index) => {
      const match = /^(\s*)(?:else\s+)?if\s*\(/.exec(line);
      if (!match)
        return;
      const opening = line.indexOf('(', match[1].length);
      const closing = closingCondition(line, opening);
      if (closing < 0)
        return;
      const remainder = line.slice(closing + 1).trimStart();
      if (remainder && !remainder.startsWith('{'))
        errors.push(`${relative}:${index + 1}: short if body must start on the next line`);
    });
  }
}

await visit(root);
checkCodeStyle();
if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('Repository structure and source checks: OK\n');
