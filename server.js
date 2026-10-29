// Servidor do Alerta SP: entrega o site e guarda as ocorrências enviadas (sem dependências externas).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'reports.json');
const MAX_BODY = 16 * 1024;

// Só estes arquivos podem ser baixados (o resto, como server.js e reports.json, fica protegido).
const PUBLIC = [/^\/(index|report)\.html$/, /^\/(styles\.css|script\.js|favicon\.svg)$/, /^\/assets\/(js|data)\/[\w.-]+\.js$/];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP };

function readReports() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function writeReports(reports) { try { fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2), 'utf8'); return true; } catch { return false; } }

function sendJson(res, status, data) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SECURITY));
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { pathname = ''; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, '.' + pathname);
  const allowed = PUBLIC.some(re => re.test(pathname)) && file.startsWith(ROOT + path.sep);
  if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY)); res.end('Não encontrado'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache' }, SECURITY));
  fs.createReadStream(file).pipe(res);
}

// limite simples: no máximo 10 relatos por minuto por endereço
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list); if (hits.size > 500) hits.clear();
  return list.length > 10;
}

const clean = (v, n) => String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health' && req.method === 'GET') { sendJson(res, 200, { status: 'ok' }); return; }
  if (url === '/api/reports' && req.method === 'GET') { sendJson(res, 200, readReports()); return; }
  if (url === '/api/reports' && req.method === 'POST') {
    if (tooMany(req.socket.remoteAddress || '')) { sendJson(res, 429, { error: 'Muitos envios seguidos. Aguarde um minuto.' }); return; }
    let body = '', dead = false;
    req.on('data', chunk => { body += chunk; if (body.length > MAX_BODY) { dead = true; sendJson(res, 413, { error: 'Relato grande demais.' }); req.destroy(); } });
    req.on('end', () => {
      if (dead) return;
      try {
        const input = JSON.parse(body);
        const required = ['type', 'location', 'description', 'severity'];
        if (!input || required.some(key => typeof input[key] !== 'string' || !input[key].trim())) { sendJson(res, 400, { error: 'Dados incompletos.' }); return; }
        const report = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: clean(input.type, 80), location: clean(input.location, 120), description: clean(input.description, 500), severity: clean(input.severity, 80),
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        };
        const reports = [report, ...readReports()].slice(0, 100);
        if (!writeReports(reports)) { sendJson(res, 500, { error: 'Não foi possível guardar o relato agora.' }); return; }
        sendJson(res, 201, report);
      } catch { sendJson(res, 400, { error: 'Não foi possível processar o relato.' }); }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY); res.end(); return; }
  serveStatic(req, res);
});

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log(`Alerta SP disponível na porta ${PORT}`));
module.exports = server;
