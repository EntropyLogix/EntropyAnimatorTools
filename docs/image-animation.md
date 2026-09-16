# Create an EntropyAnimator Effects animation

## Outcome

Creating an animation produces one `.entropyfx` project containing:

- one source image;
- one explicit version-1 recipe;
- every referenced user-owned auxiliary image;
- user-editable title, author, version, and description;
- an optional current output preset.

The toolkit validates and packages these files. It does not render effects or
replace visual review in EntropyAnimator.

## Build a recipe

Start from the complete `template` of an effect in
[`effects-v1.json`](../contracts/effects-v1.json). Keep every template field in
the recipe, including values that appear inactive. Recipes do not rely on hidden
defaults, and unknown fields are rejected by the public schema. Optional
authored controls that are not part of a starting template are listed in
[`recipe-v1.schema.json`](../contracts/recipe-v1.schema.json); omitting one has
an explicit semantic meaning such as preserving the source color.

The layer order in `primitives` is the composition order. Keep the source image
name in `recipe.source`, normalized positions in the `0..1` image space, and a
whole number of effect cycles in the complete loop. `timeline.frames` multiplied
by `timeline.frameDurationMs` is the loop duration in milliseconds.

Protected areas in `effectMasks` exclude their image area from effects. Version
1 supports explicit `circle` and `rectangle` shapes.

## Give an agent visual direction

An agent integration accepts a natural-language visual brief rather than a
closed renderer style enum. Examples include `subtle cassette sci-fi`,
`energetic street art`, `dreamlike fantasy`, or a custom direction with desired
motion and exclusions. The brief guides effect selection and explicit values;
it is not stored as a hidden preset and does not change recipe semantics. When
no direction is supplied, the agent may infer one from the image and should
state the choice before packaging the project.

## Use images and sprites

Fields ending in `Source` name project inputs. A user-owned input uses a
normalized logical path and must be passed to `pack` with the same name:

```text
npm run entropyfx -- pack \
  --recipe recipe.json \
  --source source.png \
  --input inputs/depth.png=/absolute/path/depth.png \
  --out result.entropyfx
```

A built-in sprite uses an ID from
[`sprites-v1.json`](../contracts/sprites-v1.json), for example
`builtin:sprites/v1/fireflies_atlas`. Built-in sprites are versioned references
and are not embedded. Match `atlasColumns`, `atlasRows`, and `atlasMode` to the
catalog entry. Custom sprites are ordinary user-owned project inputs and are
embedded once as `AST`.

## Review

Use `validate` before opening a project and `inspect` when checking its contents:

```text
npm run entropyfx -- validate result.entropyfx
npm run entropyfx -- inspect result.entropyfx
```

Open the project in EntropyAnimator, inspect the live animation at its intended
display size, and adjust the explicit recipe. A structurally valid project is
not proof that its motion, strength, composition, or loop is visually good.

## Data boundary

The CLI reads and writes local files and performs no network requests. If an AI
agent analyzes an image or writes a recipe, that processing is governed by the
selected model provider and is not made local by this toolkit.
