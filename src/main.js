import { Chess } from "chess.js";
import "./styles.css";

const GAMES = {
  chess: {
    title: "国际象棋",
    icon: "♔",
    desc: "标准 8x8 棋盘，支持王车兵马象后，电脑会按难度搜索吃子和局面。",
    rows: 8,
    cols: 8,
    human: "w",
  },
  xiangqi: {
    title: "中国象棋",
    icon: "帥",
    desc: "九路十行，含车马炮兵、九宫、过河、炮架和将帅照面。",
    rows: 10,
    cols: 9,
    human: "red",
  },
  gomoku: {
    title: "五子棋",
    icon: "●",
    desc: "15 路连珠，先形成横竖斜五连者获胜，电脑会优先成五和堵四。",
    rows: 15,
    cols: 15,
    human: "black",
  },
  go: {
    title: "围棋",
    icon: "○",
    desc: "9 路快棋，支持提子、禁自杀、连续虚着终局和简化数子。",
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
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
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
};

function boot() {
  resetGame("chess");
  render();
}

function resetGame(type = state.active) {
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
}

function render() {
  const game = GAMES[state.active];
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">棋</div>
          <div>
            <h1>棋盘游戏综合</h1>
            <p>四种棋，一套电脑对战</p>
          </div>
        </div>
        <div class="game-list">
          ${Object.entries(GAMES)
            .map(
              ([key, item]) => `
                <button class="game-tab ${key === state.active ? "active" : ""}" data-game="${key}">
                  <span class="icon">${item.icon}</span>
                  <span><strong>${item.title}</strong><span>${item.rows} × ${item.cols}</span></span>
                </button>
              `,
            )
            .join("")}
        </div>
      </aside>
      <main class="main">
        <section class="topbar">
          <div class="title-block">
            <h2>${game.title}</h2>
            <p>${game.desc}</p>
          </div>
          <div class="controls">
            <div class="segmented" aria-label="电脑难度">
              ${Object.entries(DIFFICULTY)
                .map(
                  ([key, label]) =>
                    `<button class="${state.difficulty === key ? "active" : ""}" data-difficulty="${key}">${label}</button>`,
                )
                .join("")}
            </div>
            <div class="toggle" aria-label="电脑模式">
              <button class="${state.vsCpu ? "active" : ""}" data-cpu="on">电脑</button>
              <button class="${!state.vsCpu ? "active" : ""}" data-cpu="off">双人</button>
            </div>
            ${state.active === "go" ? `<button class="action secondary" data-pass="true">虚着</button>` : ""}
            <button class="action" data-reset="true">新局</button>
          </div>
        </section>
        <section class="table">
          <div class="board-wrap">${renderBoard()}</div>
          <aside class="side-panel">
            <div class="panel">
              <h3>局面</h3>
              <div class="status">${statusText()}</div>
            </div>
            <div class="panel">
              <h3>计分</h3>
              <div class="metric-grid">${metricsText()}</div>
            </div>
            <div class="panel">
              <h3>记录</h3>
              <div class="log">${state.log.map((line) => `<div>${line}</div>`).join("")}</div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
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
      state.selected = null;
      state.legal = [];
      addLog(state.vsCpu ? "已开启电脑模式。" : "已切换为本地双人。");
      render();
      maybeComputerMove();
    });
  });
  document.querySelector("[data-reset]")?.addEventListener("click", () => resetAndRender(state.active));
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

function renderBoard() {
  const game = GAMES[state.active];
  const cells = [];
  for (let r = 0; r < game.rows; r += 1) {
    for (let c = 0; c < game.cols; c += 1) {
      cells.push(renderCell(r, c));
    }
  }
  return `<div class="board ${state.active}" style="--rows:${game.rows};--cols:${game.cols}">${cells.join("")}</div>`;
}

function renderCell(r, c) {
  const isSelected = samePos(state.selected, { r, c });
  const legal = state.legal.find((move) => move.to.r === r && move.to.c === c);
  const classes = ["cell", cellSkin(r, c)];
  if (isSelected) classes.push("selected");
  if (legal) classes.push("legal");
  if (legal?.capture) classes.push("capture");

  return `<div class="${classes.join(" ")}" data-r="${r}" data-c="${c}">${pieceHtml(r, c)}</div>`;
}

function cellSkin(r, c) {
  if (state.active === "chess") return (r + c) % 2 ? "dark" : "light";
  if (state.active === "xiangqi") return "wood";
  return "grid";
}

function pieceHtml(r, c) {
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
  if (state.active === "chess") return handleChess(r, c);
  if (state.active === "xiangqi") return handleXiangqi(r, c);
  if (state.active === "gomoku") return handleGomoku(r, c);
  return handleGo(r, c);
}

function isHumanTurn() {
  if (!state.vsCpu) return true;
  return currentPlayer() === GAMES[state.active].human;
}

function currentPlayer() {
  if (state.active === "chess") return state.chess.turn();
  if (state.active === "xiangqi") return state.xiangqi.turn;
  if (state.active === "gomoku") return state.gomoku.turn;
  return state.go.turn;
}

function maybeComputerMove() {
  if (!state.vsCpu || state.gameOver || state.thinking || isHumanTurn()) return;
  state.thinking = true;
  render();
  window.setTimeout(() => {
    if (state.active === "chess") computerChess();
    if (state.active === "xiangqi") computerXiangqi();
    if (state.active === "gomoku") computerGomoku();
    if (state.active === "go") computerGo();
    state.thinking = false;
    render();
  }, 360);
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

function createXiangqi() {
  const board = emptyBoard(10, 9);
  const back = ["R", "H", "E", "A", "K", "A", "E", "H", "R"];
  back.forEach((type, c) => {
    board[0][c] = { side: "black", type };
    board[9][c] = { side: "red", type };
  });
  [1, 7].forEach((c) => {
    board[2][c] = { side: "black", type: "C" };
    board[7][c] = { side: "red", type: "C" };
  });
  [0, 2, 4, 6, 8].forEach((c) => {
    board[3][c] = { side: "black", type: "P" };
    board[6][c] = { side: "red", type: "P" };
  });
  return { board, turn: "red" };
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

function legalXiangqiMoves(game, side) {
  const moves = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const piece = game.board[r][c];
      if (piece?.side === side) moves.push(...pseudoXiangqiMoves(game, { r, c }, piece));
    }
  }
  return moves.filter((move) => {
    const clone = cloneXiangqi(game);
    applyXiangqiMove(clone, move, true);
    return !xiangqiInCheck(clone, side);
  });
}

function pseudoXiangqiMoves(game, from, piece) {
  const moves = [];
  const add = (r, c) => {
    if (!inside(r, c, 10, 9)) return;
    const target = game.board[r][c];
    if (!target || target.side !== piece.side) moves.push({ from, to: { r, c }, piece, capture: target || null });
  };

  if (piece.type === "K") {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const r = from.r + dr;
      const c = from.c + dc;
      if (inPalace(piece.side, r, c)) add(r, c);
    });
    for (let r = from.r + (piece.side === "red" ? -1 : 1); inside(r, from.c, 10, 9); r += piece.side === "red" ? -1 : 1) {
      const target = game.board[r][from.c];
      if (!target) continue;
      if (target.type === "K" && target.side !== piece.side) add(r, from.c);
      break;
    }
  }
  if (piece.type === "A") {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
      const r = from.r + dr;
      const c = from.c + dc;
      if (inPalace(piece.side, r, c)) add(r, c);
    });
  }
  if (piece.type === "E") {
    [[2, 2], [2, -2], [-2, 2], [-2, -2]].forEach(([dr, dc]) => {
      const r = from.r + dr;
      const c = from.c + dc;
      if (!inside(r, c, 10, 9)) return;
      const eye = game.board[from.r + dr / 2][from.c + dc / 2];
      const riverOk = piece.side === "red" ? r >= 5 : r <= 4;
      if (riverOk && !eye) add(r, c);
    });
  }
  if (piece.type === "H") {
    [
      [2, 1, 1, 0],
      [2, -1, 1, 0],
      [-2, 1, -1, 0],
      [-2, -1, -1, 0],
      [1, 2, 0, 1],
      [-1, 2, 0, 1],
      [1, -2, 0, -1],
      [-1, -2, 0, -1],
    ].forEach(([dr, dc, lr, lc]) => {
      if (!game.board[from.r + lr]?.[from.c + lc]) add(from.r + dr, from.c + dc);
    });
  }
  if (piece.type === "R" || piece.type === "C") {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      let screen = false;
      for (let r = from.r + dr, c = from.c + dc; inside(r, c, 10, 9); r += dr, c += dc) {
        const target = game.board[r][c];
        if (piece.type === "R") {
          if (!target) add(r, c);
          else {
            if (target.side !== piece.side) add(r, c);
            break;
          }
        } else if (!screen) {
          if (!target) add(r, c);
          else screen = true;
        } else if (target) {
          if (target.side !== piece.side) add(r, c);
          break;
        }
      }
    });
  }
  if (piece.type === "P") {
    const forward = piece.side === "red" ? -1 : 1;
    add(from.r + forward, from.c);
    const crossed = piece.side === "red" ? from.r <= 4 : from.r >= 5;
    if (crossed) {
      add(from.r, from.c - 1);
      add(from.r, from.c + 1);
    }
  }
  return moves;
}

function applyXiangqiMove(game, move, silent = false) {
  const moving = game.board[move.from.r][move.from.c];
  move.capture = game.board[move.to.r][move.to.c] || null;
  game.board[move.to.r][move.to.c] = moving;
  game.board[move.from.r][move.from.c] = null;
  if (!silent) game.turn = game.turn === "red" ? "black" : "red";
  else game.turn = game.turn === "red" ? "black" : "red";
}

function xiangqiInCheck(game, side) {
  const king = findXiangqiKing(game, side);
  if (!king) return true;
  const enemy = side === "red" ? "black" : "red";
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const piece = game.board[r][c];
      if (piece?.side === enemy && pseudoXiangqiMoves(game, { r, c }, piece).some((move) => samePos(move.to, king))) return true;
    }
  }
  return false;
}

function findXiangqiKing(game, side) {
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) if (game.board[r][c]?.side === side && game.board[r][c].type === "K") return { r, c };
  }
  return null;
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

function cloneXiangqi(game) {
  return { turn: game.turn, board: game.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))) };
}

function inPalace(side, r, c) {
  return c >= 3 && c <= 5 && (side === "red" ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
}

function moveLabel(move) {
  return `${move.from.r + 1},${move.from.c + 1} → ${move.to.r + 1},${move.to.c + 1}`;
}

function createGridGame(size) {
  return { board: emptyBoard(size, size), turn: "black", winner: null, moves: 0 };
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

function gomokuWin(board, r, c, color) {
  return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => {
    return 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color) >= 5;
  });
}

function countLine(board, r, c, dr, dc, color) {
  let count = 0;
  for (let nr = r + dr, nc = c + dc; inside(nr, nc, board.length, board.length) && board[nr][nc] === color; nr += dr, nc += dc) count += 1;
  return count;
}

function createGo() {
  return {
    board: emptyBoard(9, 9),
    turn: "black",
    captures: { black: 0, white: 0 },
    passes: 0,
    last: "",
  };
}

function handleGo(r, c) {
  const result = tryGoMove(state.go, r, c, state.go.turn);
  if (!result.ok) return;
  addLog(`你在 ${r + 1},${c + 1} 落子，提子 ${result.captured}。`);
  finishGoMove(result);
}

function humanGoPass() {
  if (state.active !== "go" || state.gameOver || !isHumanTurn()) return;
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

function tryGoMove(game, r, c, color) {
  if (!inside(r, c, 9, 9) || game.board[r][c]) return { ok: false, captured: 0 };
  const copy = game.board.map((row) => [...row]);
  copy[r][c] = color;
  const enemy = color === "black" ? "white" : "black";
  let captured = 0;
  neighbors(r, c, 9).forEach(([nr, nc]) => {
    if (copy[nr][nc] === enemy) {
      const group = collectGroup(copy, nr, nc);
      if (countLiberties(copy, group) === 0) {
        captured += group.length;
        group.forEach(([gr, gc]) => {
          copy[gr][gc] = null;
        });
      }
    }
  });
  const ownGroup = collectGroup(copy, r, c);
  if (countLiberties(copy, ownGroup) === 0) return { ok: false, captured: 0 };
  const signature = JSON.stringify(copy);
  if (signature === game.last) return { ok: false, captured: 0 };
  game.last = JSON.stringify(game.board);
  game.board = copy;
  return { ok: true, captured };
}

function goLegalMoves(game, color) {
  const snapshot = {
    board: game.board.map((row) => [...row]),
    last: game.last,
  };
  const moves = [];
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const test = { board: snapshot.board.map((row) => [...row]), last: snapshot.last };
      if (tryGoMove(test, r, c, color).ok) moves.push({ r, c });
    }
  }
  return moves;
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

function collectGroup(board, r, c) {
  const color = board[r][c];
  const stack = [[r, c]];
  const seen = new Set();
  const group = [];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const key = `${cr},${cc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    group.push([cr, cc]);
    neighbors(cr, cc, board.length).forEach(([nr, nc]) => {
      if (board[nr][nc] === color) stack.push([nr, nc]);
    });
  }
  return group;
}

function countLiberties(board, group) {
  const libs = new Set();
  group.forEach(([r, c]) => {
    neighbors(r, c, board.length).forEach(([nr, nc]) => {
      if (!board[nr][nc]) libs.add(`${nr},${nc}`);
    });
  });
  return libs.size;
}

function scoreGo(game) {
  const score = {
    black: game.captures.black,
    white: game.captures.white + 6.5,
  };
  game.board.flat().forEach((stone) => {
    if (stone) score[stone] += 1;
  });
  return score;
}

function statusText() {
  if (state.thinking) return "电脑正在思考。";
  if (state.gameOver) return "棋局已经结束，可以点击新局重新开始。";
  const player = currentPlayer();
  const name = playerName(player);
  return `当前轮到 ${name}。${state.vsCpu ? "你执先手，电脑执后手。" : "当前为本地双人模式。"}`;
}

function metricsText() {
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

function emptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function inside(r, c, rows, cols) {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

function samePos(a, b) {
  return Boolean(a && b && a.r === b.r && a.c === b.c);
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

function neighbors(r, c, size) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => inside(nr, nc, size, size));
}

boot();
