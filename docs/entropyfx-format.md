# EntropyAnimator Effects Project (`.entropyfx`) format

Status: public specification draft. The format is not frozen before the first
public EntropyAnimator release.

## Byte order and header

All integers use little-endian byte order. A file starts with this 16-byte
header:

| Offset | Size | Value |
| ---: | ---: | --- |
| 0 | 7 | ASCII `ENTROPY` |
| 7 | 1 | Container version (`1`) |
| 8 | 4 | Product magic (`ANIM`) |
| 12 | 4 | Header size (`16`) |

The brand and product magic are separate so another Entropy product can use a
different product format without being mistaken for an animation project.

## Chunks

The remainder is a sequence of chunks. Every chunk has a 24-byte header:

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 4 | Uppercase ASCII chunk ID |
| 4 | 2 | Chunk version |
| 6 | 2 | Flags; bit 0 means critical |
| 8 | 8 | Payload length |
| 16 | 4 | CRC32 of the payload |
| 20 | 4 | Reserved; must be zero |

A reader must reject unknown critical chunks. It may ignore unknown optional
chunks, but an editor that rewrites a project should preserve them unchanged.
Unsupported flag bits, truncated payloads, invalid CRC32 values, and non-zero
reserved fields are errors. CRC32 detects accidental corruption; it is not an
authentication or security mechanism.

## Format limits

A version-1 project is at most 256 MiB and contains at most 1,024 chunks. One
chunk payload is at most 128 MiB, the `RECP` payload is at most 4 MiB, one
file descriptor is at most 16 KiB, and one UTF-8 logical file name is at most
1,024 bytes. Writers must reject values above these limits before allocating
the archive. Readers must reject an oversized archive, count, payload,
descriptor, recipe, or logical name even when the surrounding bytes are
otherwise valid.

## Version 1 chunks

| ID | Count | Critical | Payload |
| --- | ---: | --- | --- |
| `META` | exactly 1 | yes | UTF-8 JSON metadata followed by LF |
| `RECP` | exactly 1 | yes | UTF-8 renderer recipe JSON |
| `SRCF` | exactly 1 | yes | File payload containing the source image |
| `AUXF` | 0 or more | yes | One user-owned auxiliary image per chunk |
| `EXPT` | 0 or more | no | Export profiles owned by an integration |

`META` version 1 is:

```json
{"formatVersion":1,"kind":"entropy-animator-effects-project"}
```

The `RECP` recipe owns animation behavior and target raster dimensions. It does
not own a codec, container, bitrate, CRF, ZIP layout, or sprite-sheet layout.
Those settings belong to independently versioned optional export profiles.

`SRCF` and `AUXF` begin with a 32-bit JSON descriptor length, then the UTF-8
descriptor, then the original encoded file bytes. The descriptor contains
`name` and `mediaType`. Names are normalized relative paths: absolute paths,
backslashes, empty segments, `.` segments, and `..` segments are invalid.
Source and auxiliary names must be unique.

Built-in sprite assets are not embedded. Recipes refer to them through a
versioned identifier such as `builtin:sprites/v1/fireflies_atlas`. Every image
provided by a user is embedded as `AUXF`, so the project never depends on the
original filesystem location.

## Deterministic writing

A version-1 writer emits `META`, `RECP`, `SRCF`, `AUXF` chunks sorted by logical
name, then optional chunks sorted by ID, version, and payload bytes. Given the
same recipe text and input bytes, it produces the same archive bytes.
