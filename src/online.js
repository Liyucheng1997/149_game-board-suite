const base = import.meta.env.VITE_ROOM_SERVER || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:4399/' : 'https://board.liyucheng.me/games/');
const endpoint = new URL('ws', base.endsWith('/') ? base : base + '/');
endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';

export class OnlineRoom {
  constructor(onState, onChange) {
    this.onState = onState; this.onChange = onChange;
    this.active = false; this.connected = false; this.pending = false;
    this.snapshot = null; this.roomId = null; this.message = ''; this.timer = null;
  }
  start(options) {
    this.stop(false);
    this.active = true; this.options = options; this.roomId = options.roomId || null;
    this.attempt = 0; this.token = null;
    if (this.roomId) { try { this.token = localStorage.getItem(`chess-room:${this.roomId}`); } catch {} }
    this.connect();
  }
  connect() {
    if (!this.active) return;
    this.message = this.attempt ? '连接中断，正在重连…' : '正在连接房间…';
    this.connected = false; this.onChange();
    const ws = new WebSocket(endpoint);
    this.ws = ws;
    const timeout = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) ws.close(); }, 10000);
    ws.onopen = () => {
      clearTimeout(timeout);
      if (this.ws !== ws) return;
      ws.send(JSON.stringify(this.roomId ? { type: 'join', roomId: this.roomId, token: this.token } : { type: 'create', game: this.options.game, mode: this.options.mode }));
    };
    ws.onmessage = ({ data }) => {
      if (this.ws !== ws) return;
      const message = JSON.parse(data);
      if (message.type === 'welcome') {
        this.message = '';
        this.roomId = message.roomId; this.token = message.token;
        try { localStorage.setItem(`chess-room:${this.roomId}`, this.token); } catch {}
        const url = new URL(location.href); url.searchParams.set('room', this.roomId);
        history.replaceState(null, '', url);
      } else if (message.type === 'state') {
        this.snapshot = message; this.connected = true; this.pending = false; this.attempt = 0;
        this.onState(message);
      } else if (message.type === 'error') {
        this.message = message.message; this.pending = false;
        if (message.fatal) { this.fatal = true; ws.close(); }
        this.onChange();
      }
    };
    ws.onerror = () => {};
    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (!this.active || this.ws !== ws) return;
      this.connected = false; this.pending = false;
      if (event.code === 4001 || event.code === 4002) {
        this.fatal = true;
        this.message = event.code === 4001 ? '此房间已在另一个窗口恢复，请在那个窗口继续。' : '房间已过期，请退出后重新创建。';
      }
      if (!this.fatal) {
        this.message = '连接中断，正在重连…';
        this.timer = setTimeout(() => this.connect(), Math.min(15000, 1000 * 2 ** Math.min(this.attempt++, 4)));
      }
      this.onChange();
    };
  }
  send(type, extra = {}) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, ...extra }));
    return true;
  }
  move(action) {
    if (this.pending) return;
    if (this.send('move', { action, revision: this.snapshot.match.revision })) {
      this.pending = true; this.message = ''; this.onChange();
    }
  }
  stop(notify = true) {
    if (notify && this.active) this.send('leave');
    this.active = false; this.connected = false; this.pending = false; this.fatal = false;
    clearTimeout(this.timer); this.ws?.close(); this.ws = null;
    this.snapshot = null; this.message = ''; this.roomId = null;
    if (notify) {
      const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
    }
  }
  inviteUrl() {
    const url = new URL(location.href); url.searchParams.set('room', this.roomId); return url.href;
  }
}
