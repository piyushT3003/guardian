// Minimal synchronous stand-in for node:crypto (SHA-256, HMAC, random bytes) for the in-browser build.
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const enc = (s) => (typeof s === 'string' ? new TextEncoder().encode(s) : s);
export function sha256(data) {
  const m = enc(data), l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
  b.set(m); b[l] = 0x80; const dv = new DataView(b.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) W[i] = (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 16] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10)) + W[i - 7];
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
}
const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');
const wrapBytes = (u) => ({ toString: (f) => (f === 'hex' ? hex(u) : btoa(String.fromCharCode(...u))), bytes: u });
export function hmac(key, msg) {
  let k = enc(key); if (k.length > 64) k = sha256(k);
  const kp = new Uint8Array(64); kp.set(k);
  const ip = kp.map((x) => x ^ 0x36), op = kp.map((x) => x ^ 0x5c), m = enc(msg);
  const inner = new Uint8Array(64 + m.length); inner.set(ip); inner.set(m, 64);
  const outer = new Uint8Array(96); outer.set(op); outer.set(sha256(inner), 64);
  return sha256(outer);
}
export function randomBytes(n) { const u = new Uint8Array(n); crypto.getRandomValues(u); return wrapBytes(u); }
export function createHmac(_alg, key) { let msg = ''; const h = { update: (m) => { msg += m; return h; }, digest: (f) => wrapBytes(hmac(key, msg)).toString(f) }; return h; }
export function hashHex(s) { return hex(sha256(s)); }
export default { randomBytes, createHmac };
