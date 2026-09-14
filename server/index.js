import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, moveMatch, packMatch, restoreMatch, sides } from './match.js';

const port = Number(process.env.PORT || 4399);
const dataDir = resolve(process.env.DATA_DIR || '.room-data');
const staticDir = resolve('dist');
const allowed = new Set((process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4399,https://board.liyucheng.me,https://liyucheng1997.github.io').split(','));
const ttl = 24 * 60 * 60 * 1000;
const rooms = new Map();
const sockets = new Map();
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const savedPath = resolve(dataDir, 'rooms.json');
if (existsSync(savedPath)) {
  for (const room of JSON.parse(readFileSync(savedPath, 'utf8'))) {
    if (Date.now() - room.updated < ttl) rooms.set(room.id, { ...room, match: restoreMatch(room.match) });
  }
}
function save() {
  const records = [...rooms.values()].map((r) => ({ ...r, match: packMatch(r.match, false) }));
  writeFileSync(savedPath + '.tmp', JSON.stringify(records), { mode: 0o600 });
  renameSync(savedPath + '.tmp', savedPath);
}
const send = (ws, message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
const connected = (room, seat) => sockets.get(`${room.id}:${seat}`)?.readyState === WebSocket.OPEN;
function broadcast(room) {
  const snapshot = { type: 'state', roomId: room.id, match: packMatch(room.match), online: [connected(room, 0), connected(room, 1)], joined: room.tokens.map(Boolean), closed: room.closed, rematch: room.rematch };
  for (let seat = 0; seat < 2; seat++) {
    const ws = sockets.get(`${room.id}:${seat}`);
    if (ws) send(ws, { ...snapshot, seat, side: sides[room.match.type][seat] });
  }
}
function attach(ws, room, seat) {
  const id = `${room.id}:${seat}`;
  const previous = sockets.get(id);
  sockets.set(id, ws);
  ws.room = room.id; ws.seat = seat;
  if (previous && previous !== ws) previous.close(4001, 'Session resumed elsewhere');
  send(ws, { type: 'welcome', roomId: room.id, token: room.tokens[seat] });
  broadcast(room);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = resolve(staticDir, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(staticDir + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const attempts = new Map();
server.on('upgrade', (req, socket, head) => {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  let bucket = attempts.get(ip);
  if (!bucket || Date.now() - bucket.time > 60000) { bucket = { time: Date.now(), count: 0 }; attempts.set(ip, bucket); }
  if (req.url !== '/ws' || !allowed.has(req.headers.origin) || wss.clients.size >= 512 || ++bucket.count > 40) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (ws) => {
  ws.alive = true; ws.count = 0; ws.window = Date.now();
  const authTimeout = setTimeout(() => { if (!ws.room) ws.close(4000, 'Join timeout'); }, 15000);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    try {
      if (Date.now() - ws.window > 1000) { ws.count = 0; ws.window = Date.now(); }
      if (++ws.count > 12) throw new Error('操作太频繁，请稍后再试');
      const message = JSON.parse(raw.toString());
      if (!message || typeof message !== 'object') throw new Error('无效请求');
      if (!ws.room) {
        if (message.type === 'create') {
          if (rooms.size >= 500) throw new Error('房间已满，请稍后再试');
          const match = createMatch(message.game, message.mode);
          const room = { id: randomBytes(12).toString('hex'), tokens: [randomBytes(24).toString('hex'), null], match, updated: Date.now(), closed: false, rematch: null };
          rooms.set(room.id, room); save(); attach(ws, room, 0);
        } else if (message.type === 'join') {
          const room = rooms.get(message.roomId);
          if (!room || Date.now() - room.updated > ttl) throw new Error('房间不存在或已过期');
          let seat = typeof message.token === 'string' ? room.tokens.indexOf(message.token) : -1;
          if (seat < 0) {
            if (room.closed) throw new Error('房间已经关闭');
            seat = room.tokens.indexOf(null);
            if (seat < 0) throw new Error('房间已满，仅限两位玩家');
            room.tokens[seat] = randomBytes(24).toString('hex');
          }
          room.updated = Date.now(); save(); attach(ws, room, seat);
        } else throw new Error('请先加入房间');
        return;
      }
      const room = rooms.get(ws.room);
      if (!room || sockets.get(`${room.id}:${ws.seat}`) !== ws) throw new Error('连接已失效');
      if (room.closed) throw new Error('房间已经关闭');
      if (message.type === 'leave') {
        room.closed = true; room.updated = Date.now(); save(); broadcast(room); return;
      }
      if (!connected(room, 0) || !connected(room, 1)) throw new Error('请等待对方连接');
      if (message.type === 'move') {
        if (message.revision !== room.match.revision) throw new Error('棋局已更新，请重新落子');
        moveMatch(room.match, ws.seat, message.action);
      } else if (message.type === 'rematch') {
        if (room.rematch !== null && room.rematch !== ws.seat) {
          const revision = room.match.revision + 1;
          room.match = createMatch(room.match.type, room.match.mode);
          room.match.revision = revision; room.rematch = null;
        } else room.rematch = ws.seat;
      } else if (message.type === 'decline') {
        room.rematch = null;
      } else throw new Error('无效请求');
      room.updated = Date.now(); save(); broadcast(room);
    } catch (error) {
      send(ws, { type: 'error', message: error instanceof SyntaxError ? '无效请求' : error.message, fatal: !ws.room });
      if (ws.room && rooms.has(ws.room)) broadcast(rooms.get(ws.room));
    }
  });
  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (sockets.get(`${ws.room}:${ws.seat}`) === ws) {
      sockets.delete(`${ws.room}:${ws.seat}`);
      if (rooms.has(ws.room)) broadcast(rooms.get(ws.room));
    }
  });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  for (const [ip, bucket] of attempts) if (Date.now() - bucket.time > 60000) attempts.delete(ip);
  let changed = false;
  for (const [id, room] of rooms) if (Date.now() - room.updated > ttl) {
    room.closed = true; broadcast(room);
    for (let seat = 0; seat < 2; seat++) sockets.get(`${id}:${seat}`)?.close(4002, 'Room expired');
    rooms.delete(id); changed = true;
  }
  if (changed) save();
}, 20000);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Board game server listening on ${port}`));
function shutdown() {
  clearInterval(heartbeat); save();
  for (const ws of wss.clients) ws.close(1012, 'Service restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
