import { createXiangqi, legalXiangqiMoves, pseudoXiangqiMoves, applyXiangqiMove, xiangqiInCheck, findXiangqiKing, cloneXiangqi, inPalace, createGridGame, gomokuWin, countLine, createGo, tryGoMove, goLegalMoves, collectGroup, countLiberties, scoreGo, emptyBoard, inside, samePos, neighbors } from './rules.js';
import { Chess } from "chess.js";
import { OnlineRoom } from "./online.js";
import { RANKS, createJunqi, junqiActions, playJunqi, chooseJunqiAction, stationType, roadNeighbors, railNeighbors } from "./junqi.js";
import "./styles.css";

const GAMES = {
  junqi: {
    title: "军师旅团营",
    icon: "军",
    desc: "标准军棋 · 铁路、公路、行营与大本营",
    rows: 12,
    cols: 5,
    human: "red",
  },
  chess: {
    title: "国际象棋",
    icon: "♔",
    desc: "8 × 8 棋盘 · 白方先行",
    rows: 8,
    cols: 8,
    human: "w",
  },
  xiangqi: {
    title: "中国象棋",
    icon: "帥",
    desc: "九路十行 · 红方先行",
    rows: 10,
    cols: 9,
    human: "red",
  },
  gomoku: {
    title: "五子棋",
    icon: "●",
    desc: "横、竖或斜，五子连线即获胜。",
    rows: 15,
    cols: 15,
    human: "black",
  },
  go: {
    title: "围棋",
    icon: "○",
    desc: "9 路快棋 · 支持提子与虚着，简化数子",
    rows: 9,
    cols: 9,
    human: "black",
  },
};

const DIFFICULTY = {
  easy: "轻松",
  normal: "均衡",
  hard: "困难",
};

const CHESS_SYMBOL = {
  wp: "♟",
  wn: "♞",
  wb: "♝",
  wr: "♜",
  wq: "♛",
  wk: "♚",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

const XIANGQI_SYMBOL = {
  red: { K: "帥", A: "仕", E: "相", H: "傌", R: "俥", C: "炮", P: "兵" },
  black: { K: "将", A: "士", E: "象", H: "馬", R: "車", C: "砲", P: "卒" },
};

const CHESS_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const XIANGQI_VALUE = { P: 120, A: 130, E: 130, H: 300, C: 350, R: 600, K: 20000 };

const app = document.querySelector("#app");

const state = {
  active: "chess",
  difficulty: "normal",
  vsCpu: true,
  selected: null,
  legal: [],
  log: [],
  thinking: false,
  gameOver: false,
  chess: null,
  xiangqi: null,
  gomoku: null,
  go: null,
  junqi: null,
  junqiMode: "standard",
  cpuTimer: null,
};

function boot() {
  resetGame("chess");
  render();
  const roomId = new URLSearchParams(location.search).get('room');
  if (roomId && /^[a-f0-9]{24}$/.test(roomId)) online.start({ roomId });
}

const online = new OnlineRoom((snapshot) => {
  const match = snapshot.match;
  state.junqiMode = match.mode;
  resetGame(match.type);
  state.vsCpu = false;
  state[match.type] = match.type === 'chess' ? new Chess(match.data.fen) : match.data;
  state.gameOver = match.over;
  state.log = match.log;
  render();
}, () => render());

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function roomPanel() {
  if (!online.active) return '';
  const snapshot = online.snapshot;
  const status = !online.connected ? online.message : snapshot.closed ? '房间已关闭，请退出后创建新房间。' : !snapshot.joined[1] ? '等待朋友加入 · 将邀请链接发送给对方' : !snapshot.online[1 - snapshot.seat] ? '对方暂时离线，等待重新连接' : `双方已连接 · 你执${playerName(snapshot.side)}`;
  return `<section class="room-panel" aria-label="联机房间">
    <div><strong>联机对战</strong><span class="room-status" role="status">${escapeHtml(status)}</span></div>
    ${online.roomId ? `<div class="invite-controls"><input aria-label="邀请链接" value="${escapeHtml(online.inviteUrl())}" readonly><button class="action secondary" data-copy-room>复制邀请链接</button></div>` : ''}
    ${snapshot && snapshot.rematch !== null && !snapshot.closed ? `<div class="rematch-request">${snapshot.rematch === snapshot.seat ? '已邀请对方重新开局，等待同意。' : '对方邀请重新开局。<button class="action secondary" data-rematch>同意新局</button><button class="action secondary" data-decline>继续本局</button>'}</div>` : ''}
    ${online.connected && online.message ? `<span class="room-message">${escapeHtml(online.message)}</span>` : ''}
    <button class="action secondary" data-leave-room>退出房间</button>
  </section>`;
}

function resetGame(type = state.active) {
  window.clearTimeout(state.cpuTimer);
  state.cpuTimer = null;
  state.active = type;
  state.selected = null;
  state.legal = [];
  state.log = [`${GAMES[type].title} 已开始。`];
  state.thinking = false;
  state.gameOver = false;

  if (type === "chess") state.chess = new Chess();
  if (type === "xiangqi") state.xiangqi = createXiangqi();
  if (type === "gomoku") state.gomoku = createGridGame(15);
  if (type === "go") state.go = createGo();
  if (type === "junqi") {
    state.junqi = createJunqi(state.junqiMode);
    GAMES.junqi.rows = state.junqiMode === "standard" ? 12 : 6;
    GAMES.junqi.cols = state.junqiMode === "standard" ? 5 : 6;
    GAMES.junqi.desc = state.junqiMode === "standard" ? "标准军棋 · 铁路、公路、行营与大本营" : "翻棋快局 · 翻开棋子，夺取对方军旗";
  }
}

function render() {
  const game = GAMES[state.active];
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">棋</div>
          <div>
            <h1>棋盘游戏综合</h1>
            <p>电脑 · 双人 · 联机对战</p>
          </div>
        </div>
        <div class="nav-label">游戏收藏</div>
        <nav class="game-list" aria-label="选择游戏">
          ${Object.entries(GAMES)
            .map(
              ([key, item]) => `
                <button class="game-tab ${key === state.active ? "active" : ""}" data-game="${key}" aria-pressed="${key === state.active}">
                  <span class="icon" aria-hidden="true">${item.icon}</span>
                  <span class="game-name"><strong>${item.title}</strong><span class="game-size">${item.rows} × ${item.cols}</span></span>
                </button>
              `,
            )
            .join("")}
        </nav>
        <div class="sidebar-note"><span class="availability-dot"></span>随时开始一局<span>电脑对战 · 本地双人</span></div>
      </aside>
      <main class="main">
        <section class="topbar">
          <div class="title-block">
            <span class="eyebrow">棋盘游戏</span>
            <h2>${game.title}</h2>
            <p>${game.desc}</p>
          </div>
        </section>
          <div class="controls" role="group" aria-label="对局设置">
            <span class="control-label">对局设置</span>
            ${state.active === "junqi" ? `<div class="segmented junqi-mode" aria-label="军棋玩法">
              <button data-junqi-mode="standard" class="${state.junqiMode === "standard" ? "active" : ""}" aria-pressed="${state.junqiMode === "standard"}">标准军棋</button>
              <button data-junqi-mode="flip" class="${state.junqiMode === "flip" ? "active" : ""}" aria-pressed="${state.junqiMode === "flip"}">翻棋快局</button>
            </div>` : ""}
            <div class="segmented" aria-label="电脑难度">
              ${Object.entries(DIFFICULTY)
                .map(
                  ([key, label]) =>
                    `<button class="${state.difficulty === key ? "active" : ""}" data-difficulty="${key}" aria-pressed="${state.difficulty === key}">${label}</button>`,
                )
                .join("")}
            </div>
            <div class="toggle" aria-label="电脑模式">
              <button class="${state.vsCpu ? "active" : ""}" data-cpu="on" aria-pressed="${state.vsCpu}">电脑</button>
              <button class="${!state.vsCpu ? "active" : ""}" data-cpu="off" aria-pressed="${!state.vsCpu}">双人</button>
            </div>
            ${!online.active ? '<button class="action secondary" data-online>联机</button>' : ''}
            ${state.active === "go" ? `<button class="action secondary" data-pass="true">虚着</button>` : ""}
            <button class="action" data-reset="true"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>新局</button>
          </div>
        ${roomPanel()}
        <section class="table">
          <div class="board-stage ${isStandardJunqi() ? "standard-stage" : ""}" style="--board-ratio:${isStandardJunqi() ? 500 / 760 : game.cols / game.rows}">
            <div class="board-caption"><span>${game.rows} × ${game.cols}<span class="caption-divider">/</span>${state.active === "junqi" ? (isStandardJunqi() ? "明棋 · 黑方在上" : "翻棋对局") : state.active === "go" ? "九路 · 简化数子" : "经典对局"}</span><span class="turn-indicator"><i class="turn-dot ${currentPlayer()}"></i>${state.gameOver ? "已结束" : `${playerName(currentPlayer())}回合`}</span></div>
            <div class="board-wrap">${renderBoard()}</div>
            ${isStandardJunqi() ? `<div class="board-legend"><span><i class="legend-rail"></i>铁路</span><span><i class="legend-road"></i>公路</span><span><i class="legend-camp"></i>行营 · 免战</span><span><i class="legend-hq"></i>大本营 · 只进不出</span></div>` : ""}
            <div class="board-footnote">${state.active === "junqi" ? (isStandardJunqi() ? "自动布阵 · 红方先行 · 选择棋子查看可走位置" : "点击暗棋翻开，或选择己方明棋移动") : ["gomoku", "go"].includes(state.active) ? "点击棋盘空位落子" : "选择棋子，查看可走的位置"}</div>
          </div>
          <aside class="side-panel">
            ${state.active === "junqi" ? `<details class="panel junqi-rules">
              <summary>${isStandardJunqi() ? "标准军棋 · 玩法" : "军棋翻棋 · 玩法"}</summary>
              ${isStandardJunqi() ? `<p>每方 25 枚明棋，自动合法布阵。军旗放在大本营，地雷位于后两排，炸弹不在最前排，行营开局留空。点击新局可重新布阵。</p>
              <p>沿公路走一步，行营有斜线公路。沿铁路可直行任意距离，不能越子；只有工兵能沿相通的铁路转弯。中央山界仅有左、中、右三条通道。</p>
              <p>行营中的棋子不能被攻击；进入大本营后不能再移动，但仍可被攻击。地雷与军旗不能移动。</p>
              <p class="rank-order">司令 ＞ 军长 ＞ 师长 ＞ 旅长 ＞ 团长 ＞ 营长 ＞ 连长 ＞ 排长 ＞ 工兵</p>
              <p>大吃小，同级同归于尽，小攻大则阵亡。工兵可排雷，其他普通棋子撞雷阵亡、雷保留；炸弹与对方棋子同归于尽。夺取军旗（含炸弹夺旗）或对方无棋可走即胜。</p>
              <p>每方：司令、军长、军旗各 1；师长、旅长、团长、营长、炸弹各 2；连长、排长、工兵、地雷各 3。连续 80 手未吃子判和。</p>` : `
              <p>红方先手。每回合翻开任意暗棋，或移动己方明棋。点击棋子后，亮点表示可走位置。</p>
              <p class="rank-order">司令 ＞ 军长 ＞ 师长 ＞ 旅长 ＞ 团长 ＞ 营长 ＞ 连长 ＞ 排长 ＞ 工兵</p>
              <p>上下左右走一格，大吃小，小攻大则阵亡，同级同归于尽。不能走入暗棋或己方棋子所在格。</p>
              <p>炸弹与对方棋子同归于尽；工兵可排雷，其他棋子碰雷阵亡。地雷、军旗不能移动。任何可移动棋子（含炸弹）夺旗即胜，对方无棋可走也获胜。</p>
              <p>6×6 简化版，每方 18 子，无铁路、行营。连续 80 手未翻棋或吃子判和。</p>`}
            </details>` : ""}
            <div class="panel">
              <h3><span class="availability-dot"></span>当前对局</h3>
              <div class="status" role="status">${statusText()}</div>
            </div>
            <div class="panel">
              <h3>棋盘概况</h3>
              <div class="metric-grid">${metricsText()}</div>
            </div>
            <div class="panel">
              <h3>行棋记录<span class="panel-subtitle">最近 ${state.log.length} 条</span></h3>
              <div class="log">${state.log.map((line) => `<div>${line}</div>`).join("")}</div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  `;

  bindEvents();
  if (online.active) {
    document.querySelectorAll('[data-game], [data-cpu], [data-difficulty], [data-junqi-mode]').forEach((button) => { button.disabled = true; });
    const reset = document.querySelector('[data-reset]');
    reset.textContent = '邀请新局';
    reset.disabled = !online.connected || !online.snapshot?.online.every(Boolean) || online.snapshot?.closed;
  }
}

function bindEvents() {
  document.querySelector('[data-online]')?.addEventListener('click', () => {
    window.clearTimeout(state.cpuTimer); state.thinking = false; state.vsCpu = false;
    state.selected = null; state.legal = [];
    online.start({ game: state.active, mode: state.junqiMode });
  });
  document.querySelector('[data-leave-room]')?.addEventListener('click', () => { online.stop(); state.vsCpu = true; resetAndRender(state.active); });
  document.querySelector('[data-copy-room]')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(online.inviteUrl()); online.message = '邀请链接已复制。'; }
    catch { online.message = '请选中邀请链接后复制。'; }
    render();
    if (online.message.includes('选中')) document.querySelector('[aria-label="邀请链接"]')?.select();
  });
  document.querySelector('[data-rematch]')?.addEventListener('click', () => online.send('rematch'));
  document.querySelector('[data-decline]')?.addEventListener('click', () => online.send('decline'));
  document.querySelectorAll("[data-junqi-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.junqiMode === button.dataset.junqiMode) return;
      state.junqiMode = button.dataset.junqiMode;
      resetAndRender("junqi");
    });
  });
  document.querySelectorAll("[data-game]").forEach((button) => {
    button.addEventListener("click", () => resetAndRender(button.dataset.game));
  });
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      state.difficulty = button.dataset.difficulty;
      addLog(`难度切换为 ${DIFFICULTY[state.difficulty]}。`);
      render();
    });
  });
  document.querySelectorAll("[data-cpu]").forEach((button) => {
    button.addEventListener("click", () => {
      state.vsCpu = button.dataset.cpu === "on";
      window.clearTimeout(state.cpuTimer);
      state.cpuTimer = null;
      state.thinking = false;
      state.selected = null;
      state.legal = [];
      addLog(state.vsCpu ? "已开启电脑模式。" : "已切换为本地双人。");
      render();
      maybeComputerMove();
    });
  });
  document.querySelector("[data-reset]")?.addEventListener("click", () => online.active ? online.send('rematch') : resetAndRender(state.active));
  document.querySelector("[data-pass]")?.addEventListener("click", () => humanGoPass());
  document.querySelectorAll(".cell").forEach((cell) => {
    cell.addEventListener("click", () => handleCell(Number(cell.dataset.r), Number(cell.dataset.c)));
  });
}

function resetAndRender(type) {
  resetGame(type);
  render();
  maybeComputerMove();
}

function isStandardJunqi() {
  return state.active === "junqi" && state.junqiMode === "standard";
}

function militaryRoutes() {
  const point = (r, c) => ({ x: c * 100 + 50, y: r * 60 + 30 + (r >= 6 ? 40 : 0) });
  const paths = { road: [], rail: [] };
  for (let r = 0; r < 12; r++) for (let c = 0; c < 5; c++) {
    for (const [type, neighbors] of [["road", roadNeighbors], ["rail", railNeighbors]]) {
      for (const to of neighbors(r, c)) {
        if (to.r * 5 + to.c < r * 5 + c) continue;
        const a = point(r, c), b = point(to.r, to.c);
        paths[type].push(`M${a.x},${a.y}L${b.x},${b.y}`);
      }
    }
  }
  return `<svg class="military-routes" viewBox="0 0 500 760" preserveAspectRatio="none" aria-hidden="true">
    <path class="route-road" d="${paths.road.join(" ")}"/>
    <path class="route-rail" d="${paths.rail.join(" ")}"/>
    <path class="route-sleepers" d="${paths.rail.join(" ")}"/>
    <text x="150" y="384">山界</text><text x="350" y="384">山界</text>
  </svg>`;
}

function renderBoard() {
  const game = GAMES[state.active];
  const cells = [];
  for (let r = 0; r < game.rows; r += 1) {
    for (let c = 0; c < game.cols; c += 1) {
      cells.push(renderCell(r, c));
    }
  }
  return `<div class="board ${state.active} ${isStandardJunqi() ? "standard-junqi" : ""}" style="--rows:${game.rows};--cols:${game.cols}" aria-label="${game.title}棋盘">${isStandardJunqi() ? militaryRoutes() : ""}${cells.join("")}</div>`;
}

function renderCell(r, c) {
  const isSelected = samePos(state.selected, { r, c });
  const legal = state.legal.find((move) => move.to.r === r && move.to.c === c);
  const classes = ["cell", cellSkin(r, c)];
  if (isSelected) classes.push("selected");
  if (legal) classes.push("legal");
  if (legal?.capture) classes.push("capture");

  if (state.active === "junqi") {
    const piece = state.junqi.board[r][c];
    const label = piece ? (piece.revealed ? `${playerName(piece.side)}${RANKS[piece.type].name}` : "未翻棋子") : "空格";
    if (isStandardJunqi()) {
      const type = stationType(r, c);
      const place = { camp: "行营", headquarters: "大本营", station: "兵站" }[type];
      const last = state.junqi.lastMove;
      if (samePos(last?.from, { r, c }) || samePos(last?.to, { r, c })) classes.push("last-move");
      return `<button type="button" class="${classes.join(" ")} ${type}" style="grid-row:${r + 1 + (r >= 6 ? 1 : 0)};grid-column:${c + 1}" data-r="${r}" data-c="${c}" aria-label="${r + 1}行${c + 1}列 ${place} ${label}" aria-pressed="${isSelected}" title="${place}${type === "camp" ? "：营内棋子免受攻击" : type === "headquarters" ? "：棋子进入后不能移动" : ""}"><span class="station-mark" aria-hidden="true">${type === "station" ? "" : place}</span>${pieceHtml(r, c)}</button>`;
    }
    return `<button type="button" class="${classes.join(" ")}" data-r="${r}" data-c="${c}" aria-label="${r + 1}行${c + 1}列 ${label}" aria-pressed="${isSelected}">${pieceHtml(r, c)}</button>`;
  }

  return `<div class="${classes.join(" ")}" data-r="${r}" data-c="${c}">${pieceHtml(r, c)}</div>`;
}

function cellSkin(r, c) {
  if (state.active === "junqi") return "military";
  if (state.active === "chess") return (r + c) % 2 ? "dark" : "light";
  if (state.active === "xiangqi") return "wood";
  return "grid";
}

function pieceHtml(r, c) {
  if (state.active === "junqi") {
    const piece = state.junqi.board[r][c];
    if (!piece) return "";
    if (!piece.revealed) return `<span class="army-piece hidden-piece" aria-hidden="true">军</span>`;
    return `<span class="army-piece ${piece.side}" aria-hidden="true">${RANKS[piece.type].name}</span>`;
  }
  if (state.active === "chess") {
    const piece = state.chess.board()[r][c];
    if (!piece) return "";
    return `<span class="piece chess ${piece.color === "w" ? "white" : "black"}">${CHESS_SYMBOL[piece.color + piece.type]}</span>`;
  }
  if (state.active === "xiangqi") {
    const piece = state.xiangqi.board[r][c];
    if (!piece) return "";
    return `<span class="piece ${piece.side}">${XIANGQI_SYMBOL[piece.side][piece.type]}</span>`;
  }
  if (state.active === "gomoku") {
    const stone = state.gomoku.board[r][c];
    return stone ? `<span class="stone ${stone}"></span>` : "";
  }
  const stone = state.go.board[r][c];
  return stone ? `<span class="stone ${stone}"></span>` : "";
}

function handleCell(r, c) {
  if (state.gameOver || state.thinking || !isHumanTurn()) return;
  if (online.active) return handleOnlineCell(r, c);
  if (state.active === "junqi") return handleJunqi(r, c);
  if (state.active === "chess") return handleChess(r, c);
  if (state.active === "xiangqi") return handleXiangqi(r, c);
  if (state.active === "gomoku") return handleGomoku(r, c);
  return handleGo(r, c);
}

function isHumanTurn() {
  if (online.active) return online.connected && !online.pending && !online.snapshot?.closed && online.snapshot?.online.every(Boolean) && currentPlayer() === online.snapshot.side;
  if (!state.vsCpu) return true;
  return currentPlayer() === GAMES[state.active].human;
}

function currentPlayer() {
  if (state.active === "junqi") return state.junqi.turn;
  if (state.active === "chess") return state.chess.turn();
  if (state.active === "xiangqi") return state.xiangqi.turn;
  if (state.active === "gomoku") return state.gomoku.turn;
  return state.go.turn;
}

function maybeComputerMove() {
  if (online.active) return;
  if (!state.vsCpu || state.gameOver || state.thinking || isHumanTurn()) return;
  state.thinking = true;
  render();
  state.cpuTimer = window.setTimeout(() => {
    state.cpuTimer = null;
    if (!state.vsCpu || state.gameOver || isHumanTurn()) {
      state.thinking = false;
      render();
      return;
    }
    if (state.active === "junqi") commitJunqi(chooseJunqiAction(state.junqi, state.difficulty));
    if (state.active === "chess") computerChess();
    if (state.active === "xiangqi") computerXiangqi();
    if (state.active === "gomoku") computerGomoku();
    if (state.active === "go") computerGo();
    state.thinking = false;
    render();
  }, 360);
}

function handleOnlineCell(r, c) {
  if (['gomoku', 'go'].includes(state.active)) {
    if (!state[state.active].board[r][c]) online.move({ kind: 'move', to: { r, c } });
    return;
  }
  const legal = state.legal.find((m) => samePos(m.to, { r, c }));
  if (legal) {
    online.move({ kind: 'move', from: state.selected, to: { r, c } });
    return;
  }
  if (state.active === 'junqi') {
    const piece = state.junqi.board[r][c];
    if (piece && !piece.revealed) { online.move({ kind: 'flip', to: { r, c } }); return; }
    state.selected = piece?.side === currentPlayer() ? { r, c } : null;
    state.legal = state.selected ? junqiActions(state.junqi).filter((m) => samePos(m.from, state.selected)) : [];
  } else if (state.active === 'xiangqi') {
    state.selected = state.xiangqi.board[r][c]?.side === currentPlayer() ? { r, c } : null;
    state.legal = state.selected ? legalXiangqiMoves(state.xiangqi, currentPlayer()).filter((m) => samePos(m.from, state.selected)) : [];
  } else {
    const square = toChessSquare(r, c);
    state.selected = state.chess.get(square)?.color === currentPlayer() ? { r, c } : null;
    state.legal = state.selected ? state.chess.moves({ square, verbose: true }).map((m) => ({ to: fromChessSquare(m.to), capture: Boolean(m.captured) })) : [];
  }
  render();
}

function handleJunqi(r, c) {
  const piece = state.junqi.board[r][c];
  const move = state.legal.find((item) => samePos(item.to, { r, c }));
  if (piece && !piece.revealed) {
    commitJunqi({ kind: "flip", to: { r, c } });
  } else if (move) {
    commitJunqi(move);
  } else {
    state.selected = piece?.side === state.junqi.turn && !samePos(state.selected, { r, c }) ? { r, c } : null;
    state.legal = state.selected ? junqiActions(state.junqi).filter((item) => item.kind === "move" && samePos(item.from, state.selected)) : [];
  }
  render();
  maybeComputerMove();
}

function commitJunqi(action) {
  if (!action) return;
  const actor = playerName(state.junqi.turn);
  const message = playJunqi(state.junqi, action);
  if (!message) return;
  state.selected = null;
  state.legal = [];
  addLog(`${actor}：${message}`);
  state.gameOver = Boolean(state.junqi.winner);
  if (state.gameOver) addLog(junqiResult());
}

function junqiResult() {
  const game = state.junqi;
  return `${game.winner === "draw" ? "平局" : `${playerName(game.winner)}获胜`}：${game.reason}。`;
}

function handleChess(r, c) {
  const square = toChessSquare(r, c);
  const piece = state.chess.get(square);

  if (state.selected) {
    const move = state.legal.find((item) => item.to.r === r && item.to.c === c);
    if (move) {
      const result = state.chess.move({ from: toChessSquare(state.selected.r, state.selected.c), to: square, promotion: "q" });
      state.selected = null;
      state.legal = [];
      if (result) {
        addLog(`你走了 ${result.san}。`);
        updateChessOver();
        render();
        maybeComputerMove();
      }
      return;
    }
  }

  if (piece && piece.color === state.chess.turn()) {
    state.selected = { r, c };
    state.legal = state.chess.moves({ square, verbose: true }).map((move) => ({
      to: fromChessSquare(move.to),
      capture: Boolean(move.captured),
    }));
    render();
  }
}

function computerChess() {
  const moves = state.chess.moves({ verbose: true });
  const move = chooseChessMove(moves);
  if (!move) return;
  const result = state.chess.move(move);
  addLog(`电脑走了 ${result.san}。`);
  updateChessOver();
}

function chooseChessMove(moves) {
  if (state.difficulty === "easy") return randomItem(moves);
  const maximizing = state.chess.turn() === "w";
  let best = null;
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of shuffle(moves)) {
    const clone = new Chess(state.chess.fen());
    clone.move(move);
    const score =
      state.difficulty === "hard"
        ? minimaxChess(clone, 1, -Infinity, Infinity, !maximizing)
        : evaluateChess(clone) + captureBonus(move, CHESS_VALUE);
    if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

function minimaxChess(game, depth, alpha, beta, maximizing) {
  if (depth === 0 || game.isGameOver()) return evaluateChess(game);
  const moves = game.moves({ verbose: true });
  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const clone = new Chess(game.fen());
      clone.move(move);
      value = Math.max(value, minimaxChess(clone, depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  let value = Infinity;
  for (const move of moves) {
    const clone = new Chess(game.fen());
    clone.move(move);
    value = Math.min(value, minimaxChess(clone, depth - 1, alpha, beta, true));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluateChess(game) {
  if (game.isCheckmate()) return game.turn() === "w" ? -999999 : 999999;
  let score = 0;
  game.board().flat().forEach((piece) => {
    if (piece) score += (piece.color === "w" ? 1 : -1) * CHESS_VALUE[piece.type];
  });
  return score;
}

function updateChessOver() {
  if (!state.chess.isGameOver()) return;
  state.gameOver = true;
  if (state.chess.isCheckmate()) addLog("将死，棋局结束。");
  else addLog("和棋，棋局结束。");
}

function toChessSquare(r, c) {
  return `${"abcdefgh"[c]}${8 - r}`;
}

function fromChessSquare(square) {
  return { r: 8 - Number(square[1]), c: "abcdefgh".indexOf(square[0]) };
}

function handleXiangqi(r, c) {
  const piece = state.xiangqi.board[r][c];
  if (state.selected) {
    const move = state.legal.find((item) => item.to.r === r && item.to.c === c);
    if (move) {
      applyXiangqiMove(state.xiangqi, move);
      state.selected = null;
      state.legal = [];
      addLog(`你走了 ${moveLabel(move)}。`);
      updateXiangqiOver();
      render();
      maybeComputerMove();
      return;
    }
  }
  if (piece && piece.side === state.xiangqi.turn) {
    state.selected = { r, c };
    state.legal = legalXiangqiMoves(state.xiangqi, piece.side).filter((move) => samePos(move.from, { r, c }));
    render();
  }
}

function computerXiangqi() {
  const moves = legalXiangqiMoves(state.xiangqi, state.xiangqi.turn);
  const move = chooseXiangqiMove(moves);
  if (!move) return;
  applyXiangqiMove(state.xiangqi, move);
  addLog(`电脑走了 ${moveLabel(move)}。`);
  updateXiangqiOver();
}

function chooseXiangqiMove(moves) {
  if (state.difficulty === "easy") return randomItem(moves);
  let best = null;
  let bestScore = state.xiangqi.turn === "red" ? -Infinity : Infinity;
  for (const move of shuffle(moves)) {
    const clone = cloneXiangqi(state.xiangqi);
    applyXiangqiMove(clone, move);
    const score =
      evaluateXiangqi(clone) +
      (move.capture ? XIANGQI_VALUE[move.capture.type] * (state.xiangqi.turn === "red" ? 1 : -1) : 0);
    if ((state.xiangqi.turn === "red" && score > bestScore) || (state.xiangqi.turn === "black" && score < bestScore)) {
      best = move;
      bestScore = score;
    }
  }
  if (state.difficulty !== "hard") return best;
  return best ?? randomItem(moves);
}

function updateXiangqiOver() {
  const next = state.xiangqi.turn;
  if (!findXiangqiKing(state.xiangqi, "red") || !findXiangqiKing(state.xiangqi, "black") || legalXiangqiMoves(state.xiangqi, next).length === 0) {
    state.gameOver = true;
    addLog("棋局结束。");
  }
}

function evaluateXiangqi(game) {
  let score = 0;
  game.board.flat().forEach((piece) => {
    if (piece) score += (piece.side === "red" ? 1 : -1) * XIANGQI_VALUE[piece.type];
  });
  return score;
}

function moveLabel(move) {
  return `${move.from.r + 1},${move.from.c + 1} → ${move.to.r + 1},${move.to.c + 1}`;
}

function handleGomoku(r, c) {
  if (state.gomoku.board[r][c]) return;
  playGomoku(r, c, "你");
  render();
  maybeComputerMove();
}

function playGomoku(r, c, actor) {
  const color = state.gomoku.turn;
  state.gomoku.board[r][c] = color;
  state.gomoku.moves += 1;
  addLog(`${actor}在 ${r + 1},${c + 1} 落下${color === "black" ? "黑子" : "白子"}。`);
  if (gomokuWin(state.gomoku.board, r, c, color)) {
    state.gomoku.winner = color;
    state.gameOver = true;
    addLog(`${color === "black" ? "黑棋" : "白棋"}五连，棋局结束。`);
  } else if (state.gomoku.moves === 225) {
    state.gameOver = true;
    addLog("棋盘已满，平局。");
  } else {
    state.gomoku.turn = color === "black" ? "white" : "black";
  }
}

function computerGomoku() {
  const move = chooseGomokuMove();
  if (move) playGomoku(move.r, move.c, "电脑");
}

function chooseGomokuMove() {
  const candidates = gomokuCandidates();
  if (state.difficulty === "easy") return randomItem(candidates);
  const color = state.gomoku.turn;
  const enemy = color === "black" ? "white" : "black";
  let best = null;
  let score = -Infinity;
  for (const pos of shuffle(candidates)) {
    const own = gomokuPointScore(state.gomoku.board, pos.r, pos.c, color);
    const block = gomokuPointScore(state.gomoku.board, pos.r, pos.c, enemy) * 0.92;
    const total = state.difficulty === "hard" ? own + block : Math.max(own, block);
    if (total > score) {
      score = total;
      best = pos;
    }
  }
  return best;
}

function gomokuCandidates() {
  const board = state.gomoku.board;
  const list = [];
  let hasStone = false;
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      if (board[r][c]) hasStone = true;
      if (!board[r][c] && hasNeighbor(board, r, c, 2)) list.push({ r, c });
    }
  }
  return hasStone ? list : [{ r: 7, c: 7 }];
}

function gomokuPointScore(board, r, c, color) {
  return [[1, 0], [0, 1], [1, 1], [1, -1]].reduce((sum, [dr, dc]) => {
    const count = 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color);
    if (count >= 5) return sum + 100000;
    if (count === 4) return sum + 8000;
    if (count === 3) return sum + 900;
    if (count === 2) return sum + 90;
    return sum + 8;
  }, 0);
}

function handleGo(r, c) {
  const result = tryGoMove(state.go, r, c, state.go.turn);
  if (!result.ok) return;
  addLog(`你在 ${r + 1},${c + 1} 落子，提子 ${result.captured}。`);
  finishGoMove(result);
}

function humanGoPass() {
  if (state.active !== "go" || state.gameOver || !isHumanTurn()) return;
  if (online.active) { online.move({ kind: 'pass' }); return; }
  goPass("你");
}

function computerGo() {
  const moves = goLegalMoves(state.go, state.go.turn);
  if (moves.length === 0 || (state.difficulty === "easy" && Math.random() < 0.08)) {
    goPass("电脑");
    return;
  }
  const move = chooseGoMove(moves);
  const result = tryGoMove(state.go, move.r, move.c, state.go.turn);
  addLog(`电脑在 ${move.r + 1},${move.c + 1} 落子，提子 ${result.captured}。`);
  finishGoMove(result);
}

function finishGoMove(result) {
  state.go.captures[state.go.turn] += result.captured;
  state.go.turn = state.go.turn === "black" ? "white" : "black";
  state.go.passes = 0;
  render();
  maybeComputerMove();
}

function goPass(actor) {
  addLog(`${actor}选择虚着。`);
  state.go.passes += 1;
  if (state.go.passes >= 2) {
    state.gameOver = true;
    const score = scoreGo(state.go);
    addLog(`终局：黑 ${score.black}，白 ${score.white}。`);
  } else {
    state.go.turn = state.go.turn === "black" ? "white" : "black";
  }
  render();
  maybeComputerMove();
}

function chooseGoMove(moves) {
  if (state.difficulty === "easy") return randomItem(moves);
  const color = state.go.turn;
  let best = null;
  let bestScore = -Infinity;
  for (const move of shuffle(moves)) {
    const test = {
      board: state.go.board.map((row) => [...row]),
      last: state.go.last,
    };
    const result = tryGoMove(test, move.r, move.c, color);
    const center = 8 - Math.abs(4 - move.r) - Math.abs(4 - move.c);
    const liberties = countLiberties(test.board, collectGroup(test.board, move.r, move.c));
    const score = result.captured * 80 + liberties * 12 + center * (state.difficulty === "hard" ? 4 : 2);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function statusText() {
  if (online.active) {
    if (!online.connected) return '联机连接中，棋盘暂不可操作。';
    if (online.snapshot.closed) return '房间已关闭。';
    if (state.gameOver) return online.snapshot.match.result;
    if (!online.snapshot.online.every(Boolean)) return '等待对方加入或重新连接。';
    if (online.pending) return '正在同步落子…';
    return `你执${playerName(online.snapshot.side)}。${isHumanTurn() ? '轮到你落子。' : '等待对方落子。'}`;
  }
  if (state.active === "junqi" && state.gameOver) return `${junqiResult()}点击新局再来一盘。`;
  if (state.thinking) return "电脑正在思考。";
  if (state.gameOver) return "棋局已经结束，可以点击新局重新开始。";
  const player = currentPlayer();
  const name = playerName(player);
  return `当前轮到 ${name}。${state.vsCpu ? "你执先手，电脑执后手。" : "当前为本地双人模式。"}`;
}

function metricsText() {
  if (state.active === "junqi") {
    const pieces = state.junqi.board.flat().filter(Boolean);
    return metric("红方剩余", online.active ? online.snapshot?.match.remaining?.red ?? 0 : pieces.filter((p) => p.side === "red").length)
      + metric("黑方剩余", online.active ? online.snapshot?.match.remaining?.black ?? 0 : pieces.filter((p) => p.side === "black").length)
      + (isStandardJunqi() ? metric("可走步数", junqiActions(state.junqi).length) : metric("待翻棋子", pieces.filter((p) => !p.revealed).length))
      + metric("手数", state.junqi.moves);
  }
  if (state.active === "chess") {
    return metric("回合", state.chess.moveNumber()) + metric("合法走法", state.chess.moves().length);
  }
  if (state.active === "xiangqi") {
    return metric("红方子力", materialXiangqi("red")) + metric("黑方子力", materialXiangqi("black"));
  }
  if (state.active === "gomoku") {
    return metric("手数", state.gomoku.moves) + metric("空位", 225 - state.gomoku.moves);
  }
  const score = scoreGo(state.go);
  return metric("黑棋", score.black) + metric("白棋", score.white);
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function materialXiangqi(side) {
  return state.xiangqi.board.flat().filter((piece) => piece?.side === side).length;
}

function playerName(player) {
  return {
    w: "白方",
    b: "黑方",
    white: "白棋",
    black: "黑棋",
    red: "红方",
  }[player] ?? player;
}

function addLog(line) {
  state.log = [line, ...state.log].slice(0, 12);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function captureBonus(move, values) {
  return move.captured ? values[move.captured] || 0 : 0;
}

function hasNeighbor(board, r, c, distance) {
  for (let dr = -distance; dr <= distance; dr += 1) {
    for (let dc = -distance; dc <= distance; dc += 1) {
      if ((dr || dc) && inside(r + dr, c + dc, board.length, board.length) && board[r + dr][c + dc]) return true;
    }
  }
  return false;
}

boot();
