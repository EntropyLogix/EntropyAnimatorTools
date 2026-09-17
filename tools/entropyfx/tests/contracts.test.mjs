import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';

test('ships one versioned schema and unique effect and sprite catalogs', async () => {
  const contracts = await loadContracts();
  assert.equal(contracts.effects.formatVersion, 1);
  assert.equal(contracts.sprites.formatVersion, 1);
  assert.equal(contracts.effects.effects.length, 120);
  assert.equal(contracts.sprites.sprites.length, 44);
  assert.equal(new Set(contracts.effects.effects.map((effect) => effect.type)).size, 120);
  assert.equal(new Set(contracts.sprites.sprites.map((sprite) => sprite.id)).size, 44);
  assert.equal(contracts.recipeSchema.properties.primitives.items.oneOf.length, 120);
  assert.equal(contracts.recipeSchema.properties.elements.items.oneOf.length, 3);
});
