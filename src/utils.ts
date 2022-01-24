/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */

// The import here is via the package name. This is to ensure
// that exports mapping/resolution does fall into place.
import { crypto } from '@noble/hashes/crypto';

// prettier-ignore
export type TypedArray = Int8Array | Uint8ClampedArray | Uint8Array |
  Uint16Array | Int16Array | Uint32Array | Int32Array;

// Cast array to different type
export const u8 = (arr: TypedArray) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
export const u32 = (arr: TypedArray) =>
  new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));

// Cast array to view
export const createView = (arr: TypedArray) =>
  new DataView(arr.buffer, arr.byteOffset, arr.byteLength);

// The rotate right (circular right shift) operation for uint32
export const rotr = (word: number, shift: number) => (word << (32 - shift)) | (word >>> shift);

export const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
// There is almost no big endian hardware, but js typed arrays uses platform specific endianess.
// So, just to be sure not to corrupt anything.
if (!isLE) throw new Error('Non little-endian hardware is not supported');

const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
/**
 * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
 */
export function bytesToHex(uint8a: Uint8Array): string {
  // pre-caching improves the speed 6x
  let hex = '';
  for (let i = 0; i < uint8a.length; i++) {
    hex += hexes[uint8a[i]];
  }
  return hex;
}

/**
 * @example hexToBytes('deadbeef')
 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
  }
  if (hex.length % 2) throw new Error('hexToBytes: received invalid unpadded hex');
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < array.length; i++) {
    const j = i * 2;
    const hexByte = hex.slice(j, j + 2);
    const byte = Number.parseInt(hexByte, 16);
    if (Number.isNaN(byte)) throw new Error('Invalid byte sequence');
    array[i] = byte;
  }
  return array;
}

// Currently avoid insertion of polyfills with packers (browserify/webpack/etc)
// But setTimeout is pretty slow, maybe worth to investigate howto do minimal polyfill here
export const nextTick: () => Promise<unknown> = (() => {
  const nodeRequire =
    typeof module !== 'undefined' &&
    typeof module.require === 'function' &&
    module.require.bind(module);
  try {
    if (nodeRequire) {
      const { setImmediate } = nodeRequire('timers');
      return () => new Promise((resolve) => setImmediate(resolve));
    }
  } catch (e) {}
  return () => new Promise((resolve) => setTimeout(resolve, 0));
})();

// Returns control to thread each 'tick' ms to avoid blocking
export async function asyncLoop(iters: number, tick: number, cb: (i: number) => void) {
  let ts = Date.now();
  for (let i = 0; i < iters; i++) {
    cb(i);
    // Date.now() is not monotonic, so in case if clock goes backwards we return return control too
    const diff = Date.now() - ts;
    if (diff >= 0 && diff < tick) continue;
    await nextTick();
    ts += diff;
  }
}

// Global symbols in both browsers and Node.js since v11
// See https://github.com/microsoft/TypeScript/issues/31535
declare const TextEncoder: any;
declare const TextDecoder: any;

export function utf8ToBytes(str: string): Uint8Array {
  if (typeof str !== 'string') {
    throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
  }
  return new TextEncoder().encode(str);
}

// We can't do `instanceof Uint8Array` because it's unreliable between Web Workers etc
function isUint8a(bytes: Uint8Array | unknown): bytes is Uint8Array {
  // Caching fn and tag is 1% faster. We don't do it.
  return bytes != null && Object.prototype.toString.call(bytes) === '[object Uint8Array]';
}

export type Input = Uint8Array | string;
export function toBytes(data: Input): Uint8Array {
  if (typeof data === 'string') data = utf8ToBytes(data);
  if (!isUint8a(data)) throw new TypeError(`Expected input type is Uint8Array, got ${typeof data}`);
  return data;
}

/**
 * Concats Uint8Array-s into one; like `Buffer.concat([buf1, buf2])`
 * @example concatBytes(buf1, buf2)
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  if (!arrays.every(isUint8a)) throw new Error('Uint8Array list expected');
  if (arrays.length === 1) return arrays[0];
  const length = arrays.reduce((a, arr) => a + arr.length, 0);
  const result = new Uint8Array(length);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    result.set(arr, pad);
    pad += arr.length;
  }
  return result;
}

export function assertNumber(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Wrong positive integer: ${n}`);
}

export function assertBool(b: boolean) {
  if (typeof b !== 'boolean') throw new Error(`Expected boolean, not ${b}`);
}

export function assertBytes(bytes: Uint8Array, ...lengths: number[]) {
  if (!isUint8a(bytes)) throw new TypeError('Expected Uint8Array');
  if (lengths.length > 0 && !lengths.includes(bytes.length))
    throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${bytes.length}`);
}

export function assertHash(hash: CHash) {
  if (typeof hash !== 'function' || typeof hash.create !== 'function')
    throw new Error('Hash should be wrapped by utils.wrapConstructor');
  assertNumber(hash.outputLen);
  assertNumber(hash.blockLen);
}

export function assertExists(instance: any, checkFinished = true) {
  if (instance.destroyed) throw new Error('Hash instance has been destroyed');
  if (checkFinished && instance.finished) throw new Error('Hash#digest() has already been called');
}
export function assertOutput(out: any, instance: any) {
  assertBytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error(`digestInto() expects output buffer of length at least ${min}`);
  }
}

// For runtime check if class implements interface
export abstract class Hash<T extends Hash<T>> {
  abstract blockLen: number; // Bytes per block
  abstract outputLen: number; // Bytes in output
  abstract update(buf: Input): this;
  // Writes digest into buf
  abstract digestInto(buf: Uint8Array): void;
  abstract digest(): Uint8Array;
  // Cleanup internal state. Not '.clean' because instance is not usable after that.
  // Clean usually resets instance to initial state, but it is not possible for keyed hashes if key is consumed into state.
  // NOTE: if digest is not consumed by user, user need manually call '.destroy' if zeroing is required
  abstract destroy(): void;
  // Unsafe because doesn't check if "to" is correct. Can be used as clone() if no opts passed.
  // Why cloneInto instead of clone? Mostly performance (same as _digestInto), but also has nice property: it reuses instance
  // which means all internal buffers is overwritten, which also causes overwrite buffer which used for digest (in some cases).
  // We don't provide any guarantees about cleanup (it is impossible to!), so should be enough for now.
  abstract _cloneInto(to?: T): T;
  // Safe version that clones internal state
  clone(): T {
    return this._cloneInto();
  }
}

/**
 * XOF: streaming API to read digest in chunks.
 * Same as 'squeeze' in keccak/k12 and 'seek' in blake3, but more generic name.
 * When hash used in XOF mode it is up to user to call '.destroy' afterwards, since we cannot destroy state, next call can require more bytes.
 */
export type HashXOF<T extends Hash<T>> = Hash<T> & {
  xof(bytes: number): Uint8Array; // Read 'bytes' bytes from digest stream
  xofInto(buf: Uint8Array): Uint8Array; // read buf.length bytes from digest stream into buf
};

// Check if object doens't have custom constructor (like Uint8Array/Array)
const isPlainObject = (obj: any) =>
  Object.prototype.toString.call(obj) === '[object Object]' && obj.constructor === Object;

type EmptyObj = {};
export function checkOpts<T1 extends EmptyObj, T2 extends EmptyObj>(
  defaults: T1,
  opts?: T2
): T1 & T2 {
  if (opts !== undefined && (typeof opts !== 'object' || !isPlainObject(opts)))
    throw new TypeError('Options should be object or undefined');
  const merged = Object.assign(defaults, opts);
  return merged as T1 & T2;
}

export type CHash = ReturnType<typeof wrapConstructor>;

export function wrapConstructor<T extends Hash<T>>(hashConstructor: () => Hash<T>) {
  const hashC = (message: Input): Uint8Array => hashConstructor().update(toBytes(message)).digest();
  const tmp = hashConstructor();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashConstructor();
  return hashC;
}

export function wrapConstructorWithOpts<H extends Hash<H>, T extends Object>(
  hashCons: (opts?: T) => Hash<H>
) {
  const hashC = (msg: Input, opts?: T): Uint8Array => hashCons(opts).update(toBytes(msg)).digest();
  const tmp = hashCons({} as T);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts: T) => hashCons(opts);
  return hashC;
}

/**
 * Secure PRNG
 */
export function randomBytes(bytesLength = 32): Uint8Array {
  if (crypto.web) {
    return crypto.web.getRandomValues(new Uint8Array(bytesLength));
  } else if (crypto.node) {
    return new Uint8Array(crypto.node.randomBytes(bytesLength).buffer);
  } else {
    throw new Error("The environment doesn't have randomBytes function");
  }
}
