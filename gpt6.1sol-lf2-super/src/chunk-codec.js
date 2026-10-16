export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
}

export async function decodeChunk(received, chunk) {
  // Static servers may serve .gz with Content-Encoding:gzip. Fetch then
  // transparently decompresses it; verify the decoded hash in either case.
  let bytes = received;
  if (received[0] === 0x1f && received[1] === 0x8b) {
    if (received.length !== chunk.compressed_length || await sha256(received) !== chunk.sha256) throw new Error(`资源校验失败：${chunk.path}`);
    const stream = new Blob([received]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (bytes.length !== chunk.length || await sha256(bytes) !== chunk.decoded_sha256) throw new Error(`解压校验失败：${chunk.path}`);
  return bytes;
}
