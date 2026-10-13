// Independent calculation based on operations read in batch_P3.txt.
// This is a transcription of its algorithm, NOT execution of an original
// downloaded TypeScript file. Reference: RFC 6238 Appendix B, SHA1 at t=59s.
const { createHash, createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const secret = Buffer.from('12345678901234567890');
function truncate(digest) {
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
function counter(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}
const nowMs = 59000;
const correct = truncate(createHmac('sha1', secret)
  .update(counter(Math.floor(nowMs / 1000 / 30))).digest());
const batchAlgorithm = truncate(createHash('sha1').update(secret)
  .update(counter(Math.floor(nowMs / 30))).digest());
assert.equal(correct, '287082');
assert.equal(batchAlgorithm, '119679');
assert.notEqual(correct, batchAlgorithm);
console.log('RFC-compatible 6-digit result at 59s:', correct);
console.log('Algorithm transcribed from batch_P3, nowMs=59000:', batchAlgorithm);
console.log('Mismatch confirmed: plain hash instead of HMAC, milliseconds instead of seconds.');
