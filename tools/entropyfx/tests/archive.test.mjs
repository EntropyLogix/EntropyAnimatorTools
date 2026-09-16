import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createProjectArchive, openProjectArchive } from '../src/archive.js';

const HEADER_BYTES = 16;
const CHUNK_HEADER_BYTES = 24;
const corpusPath = new URL('./fixtures/project-format-v1/corpus.json', import.meta.url);

function bytes(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function inputFile(value) {
  return { bytes: bytes(value.base64), mediaType: value.mediaType, name: value.name };
}

function archiveInput(fixture) {
  return {
    auxiliaryInputs: fixture.auxiliaryInputs.map(inputFile),
    optionalChunks: fixture.optionalChunks.map((chunk) => ({
      id: chunk.id,
      payload: bytes(chunk.base64),
      version: chunk.version,
    })),
    recipe: fixture.recipe,
    source: inputFile(fixture.source),
  };
}

function chunkRanges(archive) {
  const result = [];
  let offset = HEADER_BYTES;
  while (offset < archive.byteLength) {
    const view = new DataView(archive.buffer, archive.byteOffset + offset, CHUNK_HEADER_BYTES);
    const length = Number(view.getBigUint64(8, true));
    result.push({ end: offset + CHUNK_HEADER_BYTES + length, offset });
    offset += CHUNK_HEADER_BYTES + length;
  }
  return result;
}

test('matches the shared deterministic project corpus', async () => {
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
  assert.equal(corpus.formatVersion, 1);
  for (const fixture of corpus.cases) {
    const first = createProjectArchive(archiveInput(fixture));
    const reordered = archiveInput(fixture);
    reordered.auxiliaryInputs.reverse();
    const second = createProjectArchive(reordered);
    assert.deepEqual(first, second);
    assert.equal(createHash('sha256').update(first).digest('hex'), fixture.expectedSha256);
    const project = openProjectArchive(first);
    assert.equal(project.manifest.kind, 'entropy-animator-effects-project');
    assert.equal(project.recipe, fixture.recipe);
    assert.equal(project.source.name, fixture.source.name);
  }
});

test('rejects traversal, truncation, and checksum differences', async () => {
  const fixture = JSON.parse(await readFile(corpusPath, 'utf8')).cases[0];
  assert.throws(() => createProjectArchive({
    ...archiveInput(fixture),
    source: { ...inputFile(fixture.source), name: '../source.png' },
  }), /parent segments/);
  const archive = createProjectArchive(archiveInput(fixture));
  assert.throws(() => openProjectArchive(archive.subarray(0, 8)), /truncated/);
  const modified = archive.slice();
  modified[modified.length - 1] ^= 0xff;
  assert.throws(() => openProjectArchive(modified), /checksum differs/);
});

test('skips unknown optional chunks and rejects unknown critical chunks', async () => {
  const fixture = JSON.parse(await readFile(corpusPath, 'utf8')).cases[0];
  const input = archiveInput(fixture);
  input.optionalChunks = [];
  const archive = createProjectArchive(input);
  const range = chunkRanges(archive).at(-1);
  const optional = archive.slice(range.offset, range.end);
  optional.set(new TextEncoder().encode('NOTE'), 0);
  new DataView(optional.buffer).setUint16(6, 0, true);
  const extended = new Uint8Array(archive.byteLength + optional.byteLength);
  extended.set(archive);
  extended.set(optional, archive.byteLength);
  assert.equal(openProjectArchive(extended).optionalChunks[0].id, 'NOTE');
  const critical = extended.slice();
  new DataView(critical.buffer).setUint16(archive.byteLength + 6, 1, true);
  assert.throws(() => openProjectArchive(critical), /unknown critical/);
});

test('enforces public archive, chunk, count, and logical-name limits', async () => {
  const fixture = JSON.parse(await readFile(corpusPath, 'utf8')).cases[0];
  const input = archiveInput(fixture);
  assert.throws(() => createProjectArchive({
    ...input,
    source: { ...input.source, name: `${'a'.repeat(1025)}.png` },
  }), /1024-byte/);
  assert.throws(() => createProjectArchive({
    ...input,
    source: { ...input.source, mediaType: `image/${'a'.repeat(17000)}` },
  }), /16 KiB/);
  assert.throws(() => createProjectArchive({
    ...input,
    recipe: `{"value":"${'a'.repeat(4 * 1024 * 1024)}"}`,
  }), /4 MiB/);
  assert.throws(() => createProjectArchive({
    ...input,
    optionalChunks: Array.from({ length: 1022 }, () => ({
      id: 'NOTE', payload: new Uint8Array(), version: 1,
    })),
  }), /1024-chunk/);
  const archive = createProjectArchive(input);
  const oversized = archive.slice();
  new DataView(oversized.buffer).setBigUint64(HEADER_BYTES + 8, 134217729n, true);
  assert.throws(() => openProjectArchive(oversized), /128 MiB/);
});
