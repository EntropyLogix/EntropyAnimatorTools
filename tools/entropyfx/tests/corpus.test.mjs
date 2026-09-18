import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createProjectArchive, openProjectArchive } from '../src/archive.js';

const corpusPath = new URL('./fixtures/project-format-v1/corpus.json', import.meta.url);

function bytes(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function inputFile(value) {
  return { bytes: bytes(value.base64), mediaType: value.mediaType, name: value.name };
}

test('matches the versioned EntropyLogix FX project corpus', async () => {
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
  assert.equal(corpus.formatVersion, 1);
  for (const fixture of corpus.cases) {
    const archive = await createProjectArchive({
      auxiliaryInputs: fixture.auxiliaryInputs.map(inputFile),
      info: fixture.info,
      optionalChunks: fixture.optionalChunks.map((chunk) => ({
        id: chunk.id,
        payload: bytes(chunk.base64),
        version: chunk.version,
      })),
      output: fixture.outputSettings,
      recipe: fixture.recipe,
      source: inputFile(fixture.source),
    });
    assert.equal(createHash('sha256').update(archive).digest('hex'), fixture.expectedSha256);
    const opened = await openProjectArchive(archive);
    assert.deepEqual(opened.info, fixture.info);
    assert.deepEqual(opened.output, fixture.outputSettings);
    assert.equal(opened.recipe, fixture.recipe);
    assert.equal(opened.source.name, fixture.source.name);
    assert.deepEqual(opened.auxiliaryInputs.map((input) => input.name),
      fixture.auxiliaryInputs.map((input) => input.name));
    assert.deepEqual(opened.optionalChunks.map((chunk) => chunk.id),
      fixture.optionalChunks.map((chunk) => chunk.id));
  }
});
