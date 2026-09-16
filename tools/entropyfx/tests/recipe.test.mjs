import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';
import { parseAndValidateRecipe, validateProjectRecipe } from '../src/recipe.js';

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
    cycles: 1,
    phase: 0.1,
    radius: 1.1,
    strength: 0.9,
    type: 'ray_fan',
    width: 0.2,
    x: 0.46,
    y: 0.02,
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchema)
    .primitives[0].color, '#c9bdd9');

  recipe.primitives = [{
    cycles: 1,
    direction: -45,
    length: 0.8,
    noise: 0.2,
    phase: 0,
    radius: 0.6,
    scale: 4,
    smoothness: 0.1,
    strength: 1,
    threshold: 0.4,
    type: 'source_rays',
    variation: 0.2,
    x: 0.5,
    y: 0.5,
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
