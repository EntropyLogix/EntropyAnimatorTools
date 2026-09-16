# Animate an image with EntropyAnimator

Use this repository to create explicit EntropyAnimator Effects recipes and
package them with local source images as `.entropyfx` projects.

Treat the user's optional visual direction as an authoring brief rather than a
renderer parameter. It may name a style such as subtle cassette sci-fi,
energetic street art, dreamlike fantasy, or provide any custom description.
Translate that direction into explicit public effect parameters. If it is
omitted, infer an appropriate direction from the image and state it briefly.

Read `docs/image-animation.md`, select effects from `contracts/effects-v1.json`, and
copy complete templates without removing fields. Read
`contracts/recipe-v1.schema.json` when optional authored controls are needed.
Use only built-in sprite IDs
listed in `contracts/sprites-v1.json`; pass every other image referenced by a
field ending in `Source` as a named `--input`.

Build and check the result with:

```bash
npm run entropyfx -- pack --recipe recipe.json --source source.png --out result.entropyfx
npm run entropyfx -- validate result.entropyfx
npm run entropyfx -- inspect result.entropyfx
```

The npm commands work on macOS, Windows, and Linux.

Do not implement, imitate, or assume renderer behavior that is absent from the
public catalogs. The result requires visual review in EntropyAnimator. Keep
files local unless a specific external destination is explicitly authorized.
