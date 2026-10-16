import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {decodeChunk,sha256} from '../src/chunk-codec.js';
test('compressed and HTTP-decoded resources share an exact integrity gate',async()=>{
  const raw=new TextEncoder().encode('LF2 original bytes fixture');
  const gz=new Uint8Array(gzipSync(raw));
  const item={path:'fixture',compressed_length:gz.length,sha256:await sha256(gz),length:raw.length,decoded_sha256:await sha256(raw)};
  assert.deepEqual(await decodeChunk(gz,item),raw);
  assert.deepEqual(await decodeChunk(raw,item),raw);
  const damaged=raw.slice();damaged[3]^=1;
  await assert.rejects(decodeChunk(damaged,item),/校验失败/);
  const damagedGzip=gz.slice();damagedGzip[10]^=1;
  await assert.rejects(decodeChunk(damagedGzip,item),/校验失败/);
});
