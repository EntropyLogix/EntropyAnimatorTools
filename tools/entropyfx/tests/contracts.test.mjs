import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';

test('ships one versioned schema and unique effect and sprite catalogs', async () => {
  const contracts = await loadContracts();
  assert.equal(contracts.effects.formatVersion, 1);
  assert.equal(contracts.sprites.formatVersion, 1);
  assert.equal(contracts.effects.effects.length, 121);
  assert.equal(contracts.sprites.sprites.length, 44);
  assert.equal(new Set(contracts.effects.effects.map((effect) => effect.type)).size, 121);
  assert.equal(new Set(contracts.sprites.sprites.map((sprite) => sprite.id)).size, 44);
  assert.equal(contracts.recipeSchema.properties.primitives.items.oneOf.length, 121);
  assert.equal(contracts.recipeSchema.properties.elements.items.oneOf.length, 5);
  const spriteParticles = contracts.effects.effects.find(
    (effect) => effect.type === 'sprite_particles');
  assert.equal(spriteParticles.template.frameSelection, 'random_per_particle');
  assert.equal(spriteParticles.template.sheetColumns, 2);
  assert.equal(spriteParticles.template.sheetRows, 1);
  assert.equal('atlasColumns' in spriteParticles.template, false);
  assert.deepEqual(
    contracts.sprites.sprites[0].sheet,
    {
      columns: 4,
      frames: 16,
      gutterPixels: 8,
      kind: 'variants',
      recommendedFrameSelection: 'random_per_particle',
      rows: 4,
    },
  );
  const mainControls = { intensity: 0, mix: 0, opacity: 0, strength: 0 };
  for (const [index, effect] of contracts.effects.effects.entries()) {
    assert.ok(effect.mainControl in mainControls, `${effect.type} has an unknown main control`);
    mainControls[effect.mainControl] += 1;
    assert.equal(typeof effect.template[effect.mainControl], 'number');
    const schema = contracts.recipeSchema.properties.primitives.items.oneOf[index];
    const variants = schema.oneOf ?? [schema];
    for (const variant of variants) {
      assert.ok(variant.properties[effect.mainControl],
        `${effect.type} schema omits its main control`);
      assert.ok(variant.required.includes(effect.mainControl),
        `${effect.type} schema does not require its main control`);
    }
  }
  assert.deepEqual(mainControls, { intensity: 44, mix: 32, opacity: 14, strength: 31 });
});
