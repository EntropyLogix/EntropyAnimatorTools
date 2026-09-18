import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';
import {
  parseAndValidateRecipe,
  referencedAuxiliaryInputs,
  validateProjectRecipe,
} from '../src/recipe.js';

const example = (name) => readFile(new URL(`../examples/${name}/recipe.json`, import.meta.url), 'utf8');

test('validates complete public examples and all catalog templates', async () => {
  const contracts = await loadContracts();
  for (const name of ['minimal', 'built-in-sprite'])
    assert.equal(parseAndValidateRecipe(await example(name), contracts.recipeSchema).schemaVersion, 1);
  for (const effect of contracts.effects.effects) {
    const recipe = JSON.parse(await example('minimal'));
    recipe.primitives = [effect.template];
    assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema)
      .primitives[0].type, effect.type);
  }
});

test('rejects missing, unknown, duplicate, and invalid fields', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  delete recipe.primitives[0].phase;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema),
    /phase.*required/);
  recipe.primitives[0].phase = 0;
  recipe.primitives[0].unexpected = true;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema),
    /unexpected.*not allowed/);
  assert.throws(() => parseAndValidateRecipe('{"schemaVersion":1,"schemaVersion":1}',
    contracts.recipeSchema), /schemaVersion.*duplicated/);
  const outside = JSON.parse(await example('minimal'));
  outside.primitives[0].x = 2;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(outside), contracts.recipeSchema),
    /must be at most 1/);
});

test('accepts optional color and source-ray controls from the renderer contract', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.primitives = [{
    angle: 151,
    color: '#c9bdd9',
    colorSource: 'custom',
    cycles: 1,
    phase: 0.1,
    radius: 1.1,
    intensity: 0.9,
    type: 'ray_fan',
    width: 0.2,
    x: 0.46,
    y: 0.02,
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema)
    .primitives[0].color, '#c9bdd9');
  assert.deepEqual(referencedAuxiliaryInputs(recipe), []);

  recipe.primitives = [{
    color: '#ffffff',
    colorSource: 'source_pixels',
    cycles: 1,
    direction: -45,
    length: 0.8,
    noise: 0.2,
    phase: 0,
    scale: 4,
    smoothness: 0.1,
    intensity: 1,
    threshold: 0.4,
    type: 'directional_source_rays',
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema)
    .primitives[0].direction, -45);
});

test('requires exact project inputs and accepts cataloged built-in sprites', async () => {
  const contracts = await loadContracts();
  const spriteRecipe = await example('built-in-sprite');
  const project = {
    auxiliaryInputs: [],
    recipe: spriteRecipe,
    source: { name: 'source.png' },
  };
  assert.equal(validateProjectRecipe(project, contracts).key, 'firefly_field');
  const custom = JSON.parse(spriteRecipe);
  custom.primitives[0].spriteSource = 'inputs/custom.png';
  assert.throws(() => validateProjectRecipe({ ...project, recipe: JSON.stringify(custom) }, contracts),
    /referenced project input is missing/);
});

test('requires an embedded input for every image overlay element', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.elements = [{
    angle: 0,
    fit: 'contain',
    opacity: 1,
    region: { height: 0.5, width: 0.5, x: 0.25, y: 0.25 },
    source: 'inputs/logo.png',
    type: 'image_overlay',
  }];
  const project = {
    auxiliaryInputs: [],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
  project.auxiliaryInputs.push({ name: 'inputs/logo.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'image_overlay');
});

test('requires the canonical raster embedded for every text element', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    font: 'builtin:fonts/v1/inconsolata_bold',
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
    source: 'generated/text-0001.png',
    text: 'TEXT',
    type: 'text',
    verticalAlign: 'middle',
    wrap: 'word',
  }];
  const project = {
    auxiliaryInputs: [],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
  project.auxiliaryInputs.push({ name: 'generated/text-0001.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'text');
});

test('requires both the canonical raster and an explicitly selected custom font', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const font = 'inputs/fonts/'
    + '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-signal.ttf';
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    font,
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
    source: 'generated/text-0001.png',
    text: 'TEXT',
    type: 'text',
    verticalAlign: 'middle',
    wrap: 'word',
  }];
  const project = {
    auxiliaryInputs: [{ name: 'generated/text-0001.png' }],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    new RegExp(`${font.replaceAll('.', '\\.')}.*missing`, 'u'));
  project.auxiliaryInputs.push({ name: font });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].font, font);
});
