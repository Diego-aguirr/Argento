const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** charCode → 6-bit value for the standard alphabet; -1 for padding and anything else. */
const CHAR_VALUES = ((): Int16Array => {
  const values = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    values[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return values;
})();

function valueAt(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code < CHAR_VALUES.length ? CHAR_VALUES[code] : -1;
}

/**
 * Decodes raw standard base64 into bytes without a dependency.
 *
 * Hermes ships no `atob`, so the image picker's base64 payload needs a decoder
 * before it can be uploaded as a typed-array body (storage-js documents
 * ArrayBuffer/ArrayBufferView as the React Native upload input). Expects the
 * clean output expo-image-picker produces: no data-URL prefix, no line breaks.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((base64.length / 4) * 3 - padding);

  let write = 0;
  for (let read = 0; read < base64.length; read += 4) {
    const a = valueAt(base64, read);
    const b = valueAt(base64, read + 1);
    const c = valueAt(base64, read + 2);
    const d = valueAt(base64, read + 3);

    // The guard drops the bytes that padding stands in for: `c`/`d` are -1 in
    // those positions, and only the positions the padding represents are
    // skipped, so well-formed input never writes a garbage byte.
    bytes[write] = (a << 2) | (b >> 4);
    write += 1;
    if (write < bytes.length) {
      bytes[write] = ((b & 0x0f) << 4) | (c >> 2);
      write += 1;
    }
    if (write < bytes.length) {
      bytes[write] = ((c & 0x03) << 6) | d;
      write += 1;
    }
  }

  return bytes;
}
