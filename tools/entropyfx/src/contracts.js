import { readFile } from 'node:fs/promises';

const contractRoot = new URL('../../../contracts/', import.meta.url);

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, contractRoot), 'utf8'));
}

let loaded;

export async function loadContracts() {
  loaded ??= Promise.all([
    readJson('effects-v1.json'),
    readJson('recipe-v1.schema.json'),
    readJson('sprites-v1.json'),
  ]).then(([effects, recipeSchema, sprites]) => ({ effects, recipeSchema, sprites }));
  return loaded;
}
