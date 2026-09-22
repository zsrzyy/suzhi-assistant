/**
 * 素质测评填表助手（新版）- 本地服务器
 * 零依赖，Node 18+ 直接运行：node server.mjs
 * 1. 提供静态页面
 * 2. /api/chat 代理 DeepSeek 接口（规避浏览器 CORS，Key 保留在服务端）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8002;
const HOST = '127.0.0.1';
const UPSTREAM = 'https://api.deepseek.com';

/**
 * DeepSeek API Key 读取顺序：
 *   1. 环境变量 DEEPSEEK_API_KEY
 *   2. 同目录 .env.local 文件（本地私密，已加入 .gitignore，勿上传）
 * 两者都没有时返回空字符串，接口会返回 401。
 */
function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const p = path.join(__dirname, '.env.local');
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const m = content.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/m);
      if (m) return m[1].trim();
    }
  } catch { /* ignore */ }
  return '';
}

const API_KEY = loadApiKey();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(__dirname, path.normalize(rel));
  if (!filePath.startsWith(__dirname)) {
    return send(res, 403, 'Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, 'Not Found: ' + rel, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

async function handleChat(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(`${UPSTREAM}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body,
    });

    const headers = { 'Content-Type': upstream.headers.get('content-type') || 'application/json' };
    res.writeHead(upstream.status, headers);

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    send(res, 502, JSON.stringify({ error: { message: '代理请求失败: ' + String(err) } }), {
      'Content-Type': 'application/json',
    });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/chat') {
    if (req.method !== 'POST') {
      return send(res, 405, 'Method Not Allowed');
    }
    handleChat(req, res);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log('===========================================');
  console.log('  徐海学院素质测评填表助手（新版）已启动');
  console.log(`  请用浏览器打开  http://localhost:${PORT}`);
  if (!API_KEY) {
    console.log('  [警告] 未配置 DeepSeek API Key，识别/问答将不可用。');
    console.log('         请在 .env.local 中设置 DEEPSEEK_API_KEY，或设置环境变量后重启。');
  }
  console.log('  使用期间请勿关闭本窗口；关闭即停止程序。');
  console.log('===========================================');
});
