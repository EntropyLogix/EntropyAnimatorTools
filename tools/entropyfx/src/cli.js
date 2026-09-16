import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createProjectArchive, openProjectArchive, validateProjectPath } from './archive.js';
import { loadContracts } from './contracts.js';
import {
  parseAndValidateRecipe,
  referencedAuxiliaryInputs,
  validateProjectRecipe,
} from './recipe.js';

const EXTENSION = '.entropyfx';
const textEncoder = new TextEncoder();

function help(error) {
  const message = [
    'EntropyAnimator Effects CLI',
    '',
    'Usage:',
    '  entropyfx validate <project.entropyfx>',
    '  entropyfx inspect <project.entropyfx>',
    '  entropyfx pack --recipe <recipe.json> --source <image> --out <project.entropyfx>',
    '    [--input <logical-name>=<file>] [--chunk <ID>:<version>=<file>] [--force]',
    '  entropyfx unpack <project.entropyfx> --out <directory> [--force]',
  ].join('\n');
  if (error)
    throw new Error(`${error}\n\n${message}`);
  process.stdout.write(`${message}\n`);
}

function parseArguments(argv) {
  const command = argv.shift();
  if (!command || command === '-h' || command === '--help')
    return { command: 'help', options: {}, positional: [] };
  const options = { chunks: [], force: false, inputs: [] };
  const positional = [];
  while (argv.length > 0) {
    const argument = argv.shift();
    if (argument === '--force')
      options.force = true;
    else if (argument === '--input')
      options.inputs.push(argv.shift());
    else if (argument === '--chunk')
      options.chunks.push(argv.shift());
    else if (['--out', '--recipe', '--source'].includes(argument))
      options[argument.slice(2)] = argv.shift();
    else if (argument?.startsWith('--'))
      help(`Unknown option ${argument}`);
    else
      positional.push(argument);
  }
  return { command, options, positional };
}

function namedFiles(values, label) {
  const result = new Map();
  for (const value of values) {
    const separator = value?.indexOf('=') ?? -1;
    if (separator < 1 || separator === value.length - 1)
      help(`${label} must use name=/path/to/file`);
    const name = value.slice(0, separator);
    if (result.has(name))
      throw new Error(`duplicate ${label} ${name}`);
    result.set(name, value.slice(separator + 1));
  }
  return result;
}

function optionalChunks(values) {
  return values.map((value) => {
    const separator = value?.indexOf('=') ?? -1;
    const descriptor = value?.slice(0, separator) ?? '';
    const match = /^([A-Z0-9 ]{4}):([1-9]\d{0,4})$/.exec(descriptor);
    if (separator < 1 || separator === value.length - 1 || !match)
      help('--chunk must use ID:version=/path/to/payload');
    const version = Number(match[2]);
    if (version > 0xffff)
      throw new Error(`${descriptor}: chunk version must not exceed 65535`);
    return { filename: value.slice(separator + 1), id: match[1], version };
  });
}

function mediaType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.png')
    return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg')
    return 'image/jpeg';
  if (extension === '.webp')
    return 'image/webp';
  throw new Error(`${filename}: supported project images are PNG, JPEG, and WebP`);
}

async function exists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT')
      return false;
    throw error;
  }
}

async function writeExact(filename, data, force) {
  if (!force && await exists(filename))
    throw new Error(`${filename}: target exists; pass --force to replace it`);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, data, { flag: force ? 'w' : 'wx' });
}

function requireExtension(filename) {
  if (path.extname(filename).toLowerCase() !== EXTENSION)
    throw new Error(`${filename}: project path must end with ${EXTENSION}`);
}

async function readProject(filename, contracts) {
  requireExtension(filename);
  const project = openProjectArchive(await readFile(filename));
  const recipe = validateProjectRecipe(project, contracts);
  return { project, recipe };
}

async function pack(options, positional, contracts) {
  if (positional.length !== 0 || !options.recipe || !options.source || !options.out)
    help('pack requires --recipe, --source, and --out');
  requireExtension(options.out);
  const recipeText = await readFile(options.recipe, 'utf8');
  const recipe = parseAndValidateRecipe(recipeText, contracts.recipeSchema);
  const sourceName = path.basename(options.source);
  if (recipe.source !== sourceName)
    throw new Error(`recipe.source ${recipe.source} does not match source file ${sourceName}`);
  const supplied = namedFiles(options.inputs, '--input');
  const builtIns = new Set(contracts.sprites.sprites.map((sprite) => sprite.id));
  const referenced = referencedAuxiliaryInputs(recipe);
  for (const name of referenced.filter((candidate) => candidate.startsWith('builtin:'))) {
    if (!builtIns.has(name))
      throw new Error(`${name}: built-in sprite is not in the public catalog`);
  }
  const required = referenced.filter((name) => !name.startsWith('builtin:'));
  const missing = required.filter((name) => !supplied.has(name));
  const extra = [...supplied.keys()].filter((name) => !required.includes(name));
  if (missing.length > 0)
    throw new Error(`missing --input for ${missing.join(', ')}`);
  if (extra.length > 0)
    throw new Error(`unused --input for ${extra.join(', ')}`);
  const archive = createProjectArchive({
    auxiliaryInputs: await Promise.all(required.map(async (name) => {
      validateProjectPath(name, '--input');
      return { bytes: await readFile(supplied.get(name)), mediaType: mediaType(name), name };
    })),
    optionalChunks: await Promise.all(optionalChunks(options.chunks).map(async (chunk) => ({
      id: chunk.id,
      payload: await readFile(chunk.filename),
      version: chunk.version,
    }))),
    recipe: recipeText,
    source: {
      bytes: await readFile(options.source),
      mediaType: mediaType(sourceName),
      name: sourceName,
    },
  });
  const output = path.resolve(options.out);
  await writeExact(output, archive, options.force);
  process.stdout.write(`OK: ${output} · ${required.length} input(s) · ${archive.byteLength} bytes\n`);
}

function safeOutputPath(root, name) {
  validateProjectPath(name, 'output file');
  const target = path.resolve(root, name);
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error(`${name}: project path escapes the output directory`);
  return target;
}

function optionalChunkFilename(chunk, index) {
  return `optional/${String(index).padStart(3, '0')}-${chunk.id.trim()}-v${chunk.version}.bin`;
}

async function unpack(options, positional, contracts) {
  if (positional.length !== 1 || !options.out || options.recipe || options.source
      || options.inputs.length > 0 || options.chunks.length > 0)
    help('unpack requires one project path and --out');
  const { project } = await readProject(positional[0], contracts);
  const outputRoot = path.resolve(options.out);
  const chunkFiles = project.optionalChunks.map((chunk, index) => ({
    bytes: chunk.payload,
    id: chunk.id,
    name: optionalChunkFilename(chunk, index),
    version: chunk.version,
  }));
  const manifest = `${JSON.stringify({
    formatVersion: project.manifest.formatVersion,
    kind: project.manifest.kind,
    optionalChunks: chunkFiles.map(({ id, name, version }) => ({ id, path: name, version })),
  }, null, 2)}\n`;
  const files = [
    { bytes: textEncoder.encode(project.recipe), name: 'recipe.json' },
    { bytes: project.source.bytes, name: project.source.name },
    ...project.auxiliaryInputs.map((file) => ({ bytes: file.bytes, name: file.name })),
    ...chunkFiles,
    { bytes: textEncoder.encode(manifest), name: 'project-manifest.json' },
  ];
  for (const file of files) {
    const target = safeOutputPath(outputRoot, file.name);
    if (!options.force && await exists(target))
      throw new Error(`${target}: target exists; pass --force to replace it`);
  }
  for (const file of files)
    await writeExact(safeOutputPath(outputRoot, file.name), file.bytes, options.force);
  process.stdout.write(`OK: ${outputRoot} · ${project.auxiliaryInputs.length} input(s)\n`);
}

async function validate(options, positional, contracts) {
  if (positional.length !== 1 || Object.keys(options).some((key) =>
    key === 'force' ? options[key] : Array.isArray(options[key]) ? options[key].length > 0 : options[key]))
    help('validate accepts exactly one project path');
  const { project } = await readProject(positional[0], contracts);
  process.stdout.write(`OK: ${path.resolve(positional[0])} · ${project.auxiliaryInputs.length} input(s)\n`);
}

async function inspect(options, positional, contracts) {
  if (positional.length !== 1 || Object.keys(options).some((key) =>
    key === 'force' ? options[key] : Array.isArray(options[key]) ? options[key].length > 0 : options[key]))
    help('inspect accepts exactly one project path');
  const { project, recipe } = await readProject(positional[0], contracts);
  process.stdout.write(`${JSON.stringify({
    auxiliaryInputs: project.auxiliaryInputs.map((input) => ({
      bytes: input.bytes.byteLength,
      mediaType: input.mediaType,
      name: input.name,
    })),
    bytes: (await stat(positional[0])).size,
    formatVersion: project.manifest.formatVersion,
    kind: project.manifest.kind,
    optionalChunks: project.optionalChunks.map((chunk) => ({
      bytes: chunk.payload.byteLength,
      id: chunk.id,
      version: chunk.version,
    })),
    recipe: {
      durationMs: recipe.timeline.frames * recipe.timeline.frameDurationMs,
      effects: recipe.primitives.map((primitive) => primitive.type),
      frames: recipe.timeline.frames,
      key: recipe.key,
      output: recipe.output,
      schemaVersion: recipe.schemaVersion,
    },
    source: {
      bytes: project.source.bytes.byteLength,
      mediaType: project.source.mediaType,
      name: project.source.name,
    },
  }, null, 2)}\n`);
}

export async function main(argv) {
  const { command, options, positional } = parseArguments([...argv]);
  if (command === 'help') {
    help();
    return;
  }
  const contracts = await loadContracts();
  if (command === 'pack')
    await pack(options, positional, contracts);
  else if (command === 'unpack')
    await unpack(options, positional, contracts);
  else if (command === 'validate')
    await validate(options, positional, contracts);
  else if (command === 'inspect')
    await inspect(options, positional, contracts);
  else
    help(`Unknown command ${command}`);
}
