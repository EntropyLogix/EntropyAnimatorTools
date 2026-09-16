# EntropyAnimatorTools

EntropyAnimatorTools is the open collection of local companion tools for
EntropyAnimator. It currently ships the EntropyAnimator Effects CLI, named
`entropyfx`, which creates, checks, inspects, and unpacks EntropyAnimator
Effects Project files without including or reimplementing the private renderer.

An `.entropyfx` file is a deterministic, self-contained animation project. It
stores the source image, explicit animation recipe, referenced user images,
user-editable information, and an optional current output preset. Rendering and
visual review happen in the EntropyAnimator application.

## Requirements

- Node.js 26.3.1
- No package installation and no network access

The CLI and all repository checks run on macOS, Windows, and Linux. The
`run/*.sh` files are convenience wrappers for macOS and Linux; the equivalent
portable commands use npm:

```text
npm run entropyfx -- validate project.entropyfx
npm run entropyfx -- inspect project.entropyfx
npm run check
npm run setup
```

## Commands

```bash
./run/entropyfx.sh validate project.entropyfx
./run/entropyfx.sh inspect project.entropyfx
./run/entropyfx.sh pack \
  --recipe tools/entropyfx/examples/minimal/recipe.json \
  --source /path/to/source.png \
  --out project.entropyfx
./run/entropyfx.sh unpack project.entropyfx --out unpacked-project
```

Pass every user-owned image referenced by an effect field ending in `Source`
with a named input:

```bash
./run/entropyfx.sh pack \
  --recipe recipe.json \
  --source source.png \
  --input inputs/depth.png=/path/to/depth.png \
  --out project.entropyfx
```

Existing output paths are never replaced unless `--force` is present.

Use `--info info.json` to supply `title`, `author`, `version`, and `description`.
Use `--output-settings output.json` to preserve the current MP4, PNG sequence,
or sprite-sheet output preset. Without them, `pack` writes empty information
fields and omits the optional output preset.

## Repository layout

- `tools/entropyfx/` contains the Effects CLI, examples, tests, and agent integrations;
- `contracts/` contains public contracts shared by all tools;
- `docs/` contains the public format and image-animation documentation.

## Public contracts

- [Project format](docs/entropyfx-format.md)
- [Image animation guide](docs/image-animation.md)
- [Recipe schema](contracts/recipe-v1.schema.json)
- [Effect catalog](contracts/effects-v1.json)
- [Built-in sprite catalog](contracts/sprites-v1.json)

The catalogs describe public behavior and complete starting templates. Optional
authored parameters are defined by the recipe schema. The contracts do not
contain effect implementations or built-in sprite image files.

## Agent integrations

The Effects CLI includes a Codex skill under
[`tools/entropyfx/agents/codex/entropy-animator-image-animation`](tools/entropyfx/agents/codex/entropy-animator-image-animation/SKILL.md)
and an equivalent Claude instruction under
[`tools/entropyfx/agents/claude/entropy-animator-image-animation.md`](tools/entropyfx/agents/claude/entropy-animator-image-animation.md).
Both create explicit recipes and call this local CLI. Image processing performed
by an external model follows that model provider's own data handling terms.

## Development

```bash
./run/setup.sh
./run/check.sh
```

On Windows, use `npm run setup` and `npm run check`.

The source code and documentation in this repository are licensed under MIT.
The EntropyAnimator application, renderer, product name, and branding are not
licensed by this repository.
