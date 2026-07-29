// 本地抓帧收图服务（仅测试期使用）：页面把 canvas.toDataURL 的结果 POST 过来，落盘为图片。
// 用法：node docs/capture-server.mjs   然后页面 fetch('http://127.0.0.1:5599/shot?name=xxx', {method:'POST', body: dataUrl})
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), 'qa');
mkdirSync(outDir, { recursive: true });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();

  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/shot') {
    res.statusCode = 404;
    return res.end('no');
  }
  const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9._-]/gi, '');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const comma = body.indexOf(',');
    const meta = body.slice(0, comma);
    const ext = meta.includes('jpeg') ? 'jpg' : 'png';
    const file = resolve(outDir, name + '.' + ext);
    writeFileSync(file, Buffer.from(body.slice(comma + 1), 'base64'));
    console.log('saved', file, (body.length / 1024).toFixed(0) + 'KB');
    res.end('ok');
  });
}).listen(5599, '127.0.0.1', () => console.log('capture server on http://127.0.0.1:5599'));
