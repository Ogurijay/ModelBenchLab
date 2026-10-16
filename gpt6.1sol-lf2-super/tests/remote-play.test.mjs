import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeConnectionCode, decodeConnectionCode, validateControlMessage } from '../src/remote-play.js';

const offer = { v: 1, id: '12345678-1234-1234-1234-123456789012', description: { type: 'offer', sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' } };
test('compressed manual signaling round-trips the actual SDP and session identity', async () => {
  const code = await encodeConnectionCode(offer);
  assert(code.startsWith('KATE-RTC1.'));
  assert.deepEqual(await decodeConnectionCode(code, 'offer'), offer);
  await assert.rejects(decodeConnectionCode(code, 'answer'));
});
test('manual signaling rejects executable text, unbounded data, and oversized inflated descriptions', async () => {
  await assert.rejects(decodeConnectionCode('javascript:alert(1)'));
  await assert.rejects(decodeConnectionCode('KATE-RTC1.' + 'a'.repeat(32000)));
  await assert.rejects(encodeConnectionCode({ ...offer, description: { type: 'offer', sdp: 'v=0' + 'a'.repeat(65536) } }));
  const bytes = new TextEncoder().encode('a'.repeat(70000));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  const code = 'KATE-RTC1.' + Buffer.from(packed).toString('base64url');
  await assert.rejects(decodeConnectionCode(code), /大小/);
});
test('only finite ordered P2 key transitions or release/heartbeat messages are accepted', () => {
  assert.deepEqual(validateControlMessage('{"t":"key","k":"ArrowUp","d":1,"s":2}', 1), { t: 'key', k: 'ArrowUp', d: 1, s: 2 });
  assert(validateControlMessage('{"t":"release","s":3}', 2));
  assert(validateControlMessage('{"t":"ping","s":4}', 3));
  for (const data of [
    '{"t":"key","k":"KeyW","d":1,"s":2}',
    '{"t":"key","k":"Digit1","d":2,"s":2}',
    '{"t":"key","k":"Digit1","d":1,"s":1}',
    '{"t":"key","k":"Digit1","d":1,"s":2,"eval":"alert(1)"}',
    '{"t":"eval","s":2}', '{"t":"release","s":1.5}',
    '{"t":"release","s":9007199254740992}', 'x'.repeat(257), null,
  ]) assert.equal(validateControlMessage(data, 1), null);
});
