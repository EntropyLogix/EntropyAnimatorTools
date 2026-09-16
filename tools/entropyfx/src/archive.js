const BRAND = new Uint8Array([0x45, 0x4e, 0x54, 0x52, 0x4f, 0x50, 0x59]);
const PRODUCT = new Uint8Array([0x41, 0x4e, 0x49, 0x4d]);
const CONTAINER_VERSION = 1;
const HEADER_BYTES = 16;
const CHUNK_HEADER_BYTES = 24;
const CHUNK_VERSION = 1;
const CRITICAL = 1;
const MAX_CHUNKS = 1024;
const MAX_CHUNK_BYTES = 128 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 16 * 1024;
const MAX_LOGICAL_NAME_BYTES = 1024;
const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const MAX_RECIPE_BYTES = 4 * 1024 * 1024;
const PROJECT_KIND = 'entropy-animator-effects-project';
const PROJECT_FORMAT_VERSION = 1;
const CORE_CHUNK_IDS = new Set(['AUXF', 'META', 'RECP', 'SRCF']);
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  crcTable[index] = value >>> 0;
}

function bytes(value, context) {
  if (value instanceof Uint8Array)
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error(`${context} must be binary data`);
}

function concatenate(parts) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  if (!Number.isSafeInteger(size) || size > MAX_PROJECT_BYTES)
    throw new Error('project archive exceeds the 256 MiB format limit');
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(value) {
  let checksum = 0xffffffff;
  for (const byte of value)
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

export function validateProjectPath(name, context) {
  if (typeof name !== 'string' || name.length === 0)
    throw new Error(`${context} name is required`);
  if (name.includes('\\') || name.startsWith('/') || name.endsWith('/'))
    throw new Error(`${context} name must be a normalized relative path`);
  const segments = name.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    throw new Error(`${context} name must not contain empty, current, or parent segments`);
  if (textEncoder.encode(name).byteLength > MAX_LOGICAL_NAME_BYTES)
    throw new Error(`${context} name exceeds the 1024-byte format limit`);
}

function validateMediaType(mediaType, context) {
  if (typeof mediaType !== 'string'
      || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mediaType))
    throw new Error(`${context} media type is invalid`);
}

function normalizeInputFile(file, role, context) {
  if (!file || typeof file !== 'object')
    throw new Error(`${context} is required`);
  validateProjectPath(file.name, context);
  validateMediaType(file.mediaType, context);
  return { bytes: bytes(file.bytes, context), mediaType: file.mediaType, name: file.name, role };
}

function encodeChunk(id, payload, { critical = true, version = CHUNK_VERSION } = {}) {
  if (!/^[A-Z0-9 ]{4}$/.test(id))
    throw new Error(`chunk ID ${id} must be four uppercase ASCII characters`);
  if (payload.byteLength > MAX_CHUNK_BYTES)
    throw new Error(`${id}: project chunk exceeds the 128 MiB format limit`);
  const header = new Uint8Array(CHUNK_HEADER_BYTES);
  header.set(textEncoder.encode(id), 0);
  const view = new DataView(header.buffer);
  view.setUint16(4, version, true);
  view.setUint16(6, critical ? CRITICAL : 0, true);
  view.setBigUint64(8, BigInt(payload.byteLength), true);
  view.setUint32(16, crc32(payload), true);
  return concatenate([header, payload]);
}

function encodeFileChunk(id, file) {
  const descriptor = textEncoder.encode(`${JSON.stringify({
    mediaType: file.mediaType,
    name: file.name,
  })}\n`);
  if (descriptor.byteLength > MAX_DESCRIPTOR_BYTES)
    throw new Error(`${id}: file descriptor exceeds the 16 KiB format limit`);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, descriptor.byteLength, true);
  return encodeChunk(id, concatenate([length, descriptor, file.bytes]));
}

function normalizeOptionalChunk(chunk, index) {
  const context = `optionalChunks[${index}]`;
  if (!chunk || typeof chunk !== 'object')
    throw new Error(`${context} is required`);
  if (!/^[A-Z0-9 ]{4}$/.test(chunk.id))
    throw new Error(`${context} ID must be four uppercase ASCII characters`);
  if (CORE_CHUNK_IDS.has(chunk.id))
    throw new Error(`${context} ID ${chunk.id} is reserved`);
  const version = chunk.version ?? CHUNK_VERSION;
  if (!Number.isSafeInteger(version) || version < 1 || version > 0xffff)
    throw new Error(`${context} version is invalid`);
  return { id: chunk.id, payload: bytes(chunk.payload, context), version };
}

function compareOptionalChunks(left, right) {
  if (left.id !== right.id)
    return left.id < right.id ? -1 : 1;
  if (left.version !== right.version)
    return left.version - right.version;
  const shared = Math.min(left.payload.byteLength, right.payload.byteLength);
  for (let index = 0; index < shared; index++) {
    if (left.payload[index] !== right.payload[index])
      return left.payload[index] - right.payload[index];
  }
  return left.payload.byteLength - right.payload.byteLength;
}

function projectHeader() {
  const header = new Uint8Array(HEADER_BYTES);
  header.set(BRAND, 0);
  header[7] = CONTAINER_VERSION;
  header.set(PRODUCT, 8);
  new DataView(header.buffer).setUint32(12, HEADER_BYTES, true);
  return header;
}

export function createProjectArchive({
  recipe, source, auxiliaryInputs = [], optionalChunks = [],
}) {
  if (typeof recipe !== 'string')
    throw new Error('recipe must be a JSON string');
  const recipeBytes = textEncoder.encode(recipe);
  if (recipeBytes.byteLength > MAX_RECIPE_BYTES)
    throw new Error('project recipe exceeds the 4 MiB format limit');
  try {
    JSON.parse(recipe);
  } catch (error) {
    throw new Error(`project recipe is invalid: ${error instanceof Error ? error.message : error}`);
  }
  if (!Array.isArray(auxiliaryInputs))
    throw new Error('auxiliaryInputs must be an array');
  if (!Array.isArray(optionalChunks))
    throw new Error('optionalChunks must be an array');
  const sourceFile = normalizeInputFile(source, 'source', 'source');
  const auxiliaryFiles = auxiliaryInputs
    .map((file, index) => normalizeInputFile(file, 'auxiliary', `auxiliaryInputs[${index}]`))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const names = new Set([sourceFile.name]);
  for (const file of auxiliaryFiles) {
    if (names.has(file.name))
      throw new Error(`duplicate project file ${file.name}`);
    names.add(file.name);
  }
  const extensions = optionalChunks.map(normalizeOptionalChunk).sort(compareOptionalChunks);
  if (3 + auxiliaryFiles.length + extensions.length > MAX_CHUNKS)
    throw new Error('project archive exceeds the 1024-chunk format limit');
  const metadata = textEncoder.encode(`${JSON.stringify({
    formatVersion: PROJECT_FORMAT_VERSION,
    kind: PROJECT_KIND,
  })}\n`);
  return concatenate([
    projectHeader(),
    encodeChunk('META', metadata),
    encodeChunk('RECP', recipeBytes),
    encodeFileChunk('SRCF', sourceFile),
    ...auxiliaryFiles.map((file) => encodeFileChunk('AUXF', file)),
    ...extensions.map((chunk) => encodeChunk(chunk.id, chunk.payload, {
      critical: false,
      version: chunk.version,
    })),
  ]);
}

function validateHeader(archive) {
  if (archive.byteLength < HEADER_BYTES)
    throw new Error('project archive is truncated');
  for (let index = 0; index < BRAND.length; index++) {
    if (archive[index] !== BRAND[index])
      throw new Error('project archive signature is invalid');
  }
  if (archive[7] !== CONTAINER_VERSION)
    throw new Error('project container version is unsupported');
  for (let index = 0; index < PRODUCT.length; index++) {
    if (archive[8 + index] !== PRODUCT[index])
      throw new Error('ENTROPY product type is not ANIM');
  }
  if (new DataView(archive.buffer, archive.byteOffset, HEADER_BYTES).getUint32(12, true)
      !== HEADER_BYTES)
    throw new Error('project header size is unsupported');
}

function decodeChunks(archive) {
  const chunks = [];
  let offset = HEADER_BYTES;
  while (offset < archive.byteLength) {
    if (chunks.length >= MAX_CHUNKS)
      throw new Error('project archive exceeds the 1024-chunk format limit');
    if (archive.byteLength - offset < CHUNK_HEADER_BYTES)
      throw new Error('project chunk header is truncated');
    const header = new DataView(archive.buffer, archive.byteOffset + offset, CHUNK_HEADER_BYTES);
    const id = textDecoder.decode(archive.subarray(offset, offset + 4));
    const version = header.getUint16(4, true);
    const flags = header.getUint16(6, true);
    const payloadLength = header.getBigUint64(8, true);
    if (payloadLength > BigInt(MAX_CHUNK_BYTES))
      throw new Error(`${id}: project chunk exceeds the 128 MiB format limit`);
    const length = Number(payloadLength);
    const payloadStart = offset + CHUNK_HEADER_BYTES;
    const payloadEnd = payloadStart + length;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > archive.byteLength)
      throw new Error(`${id}: project chunk payload is truncated`);
    const payload = archive.subarray(payloadStart, payloadEnd);
    if (header.getUint32(16, true) !== crc32(payload))
      throw new Error(`${id}: project chunk checksum differs`);
    if (header.getUint32(20, true) !== 0)
      throw new Error(`${id}: reserved chunk field is not zero`);
    chunks.push({ critical: (flags & CRITICAL) !== 0, flags, id, payload, version });
    offset = payloadEnd;
  }
  return chunks;
}

function decodeJson(payload, context) {
  try {
    return JSON.parse(textDecoder.decode(payload));
  } catch (error) {
    throw new Error(`${context} is invalid: ${error instanceof Error ? error.message : error}`);
  }
}

function decodeFile(chunk, role, index) {
  const context = `${chunk.id} chunk ${index}`;
  if (chunk.payload.byteLength < 4)
    throw new Error(`${context} file descriptor is truncated`);
  const descriptorLength = new DataView(
    chunk.payload.buffer, chunk.payload.byteOffset, 4).getUint32(0, true);
  if (descriptorLength === 0 || descriptorLength > MAX_DESCRIPTOR_BYTES
      || 4 + descriptorLength > chunk.payload.byteLength)
    throw new Error(`${context} file descriptor is truncated`);
  const descriptor = decodeJson(
    chunk.payload.subarray(4, 4 + descriptorLength), `${context} file descriptor`);
  validateProjectPath(descriptor.name, context);
  validateMediaType(descriptor.mediaType, context);
  return {
    bytes: chunk.payload.subarray(4 + descriptorLength),
    mediaType: descriptor.mediaType,
    name: descriptor.name,
    role,
  };
}

export function openProjectArchive(value) {
  const archive = bytes(value, 'project archive');
  if (archive.byteLength > MAX_PROJECT_BYTES)
    throw new Error('project archive exceeds the 256 MiB format limit');
  validateHeader(archive);
  const chunks = decodeChunks(archive);
  for (const chunk of chunks) {
    if ((chunk.flags & ~CRITICAL) !== 0)
      throw new Error(`${chunk.id}: project chunk flags are unsupported`);
    if (!CORE_CHUNK_IDS.has(chunk.id)) {
      if (chunk.critical)
        throw new Error(`${chunk.id}: unknown critical project chunk`);
      continue;
    }
    if (chunk.version !== CHUNK_VERSION)
      throw new Error(`${chunk.id}: project chunk version is unsupported`);
    if (!chunk.critical)
      throw new Error(`${chunk.id}: required project chunk is not critical`);
  }
  const byId = (id) => chunks.filter((chunk) => chunk.id === id);
  if (byId('META').length !== 1 || byId('RECP').length !== 1 || byId('SRCF').length !== 1)
    throw new Error('project archive must contain one META, RECP, and SRCF chunk');
  const manifest = decodeJson(byId('META')[0].payload, 'project metadata');
  if (!manifest || manifest.kind !== PROJECT_KIND
      || manifest.formatVersion !== PROJECT_FORMAT_VERSION)
    throw new Error('project metadata kind or format version is unsupported');
  let recipe;
  try {
    const recipePayload = byId('RECP')[0].payload;
    if (recipePayload.byteLength > MAX_RECIPE_BYTES)
      throw new Error('project recipe exceeds the 4 MiB format limit');
    recipe = textDecoder.decode(recipePayload);
    JSON.parse(recipe);
  } catch (error) {
    throw new Error(`project recipe is invalid: ${error instanceof Error ? error.message : error}`);
  }
  const source = decodeFile(byId('SRCF')[0], 'source', 0);
  const auxiliaryInputs = byId('AUXF').map((chunk, index) =>
    decodeFile(chunk, 'auxiliary', index));
  const names = new Set([source.name]);
  for (const file of auxiliaryInputs) {
    if (names.has(file.name))
      throw new Error(`duplicate project file ${file.name}`);
    names.add(file.name);
  }
  const optionalChunks = chunks
    .filter((chunk) => !CORE_CHUNK_IDS.has(chunk.id))
    .map((chunk) => ({ id: chunk.id, payload: chunk.payload.slice(), version: chunk.version }));
  return { auxiliaryInputs, manifest, optionalChunks, recipe, source };
}
