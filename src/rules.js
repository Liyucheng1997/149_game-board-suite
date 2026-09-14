export function createXiangqi() {
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

export function legalXiangqiMoves(game, side) {
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

export function pseudoXiangqiMoves(game, from, piece) {
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

export function applyXiangqiMove(game, move, silent = false) {
  const moving = game.board[move.from.r][move.from.c];
  move.capture = game.board[move.to.r][move.to.c] || null;
  game.board[move.to.r][move.to.c] = moving;
  game.board[move.from.r][move.from.c] = null;
  if (!silent) game.turn = game.turn === "red" ? "black" : "red";
  else game.turn = game.turn === "red" ? "black" : "red";
}

export function xiangqiInCheck(game, side) {
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

export function findXiangqiKing(game, side) {
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) if (game.board[r][c]?.side === side && game.board[r][c].type === "K") return { r, c };
  }
  return null;
}

export function cloneXiangqi(game) {
  return { turn: game.turn, board: game.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))) };
}

export function inPalace(side, r, c) {
  return c >= 3 && c <= 5 && (side === "red" ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
}

export function createGridGame(size) {
  return { board: emptyBoard(size, size), turn: "black", winner: null, moves: 0 };
}

export function gomokuWin(board, r, c, color) {
  return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => {
    return 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color) >= 5;
  });
}

export function countLine(board, r, c, dr, dc, color) {
  let count = 0;
  for (let nr = r + dr, nc = c + dc; inside(nr, nc, board.length, board.length) && board[nr][nc] === color; nr += dr, nc += dc) count += 1;
  return count;
}

export function createGo() {
  return {
    board: emptyBoard(9, 9),
    turn: "black",
    captures: { black: 0, white: 0 },
    passes: 0,
    last: "",
  };
}

export function tryGoMove(game, r, c, color) {
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

export function goLegalMoves(game, color) {
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

export function collectGroup(board, r, c) {
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

export function countLiberties(board, group) {
  const libs = new Set();
  group.forEach(([r, c]) => {
    neighbors(r, c, board.length).forEach(([nr, nc]) => {
      if (!board[nr][nc]) libs.add(`${nr},${nc}`);
    });
  });
  return libs.size;
}

export function scoreGo(game) {
  const score = {
    black: game.captures.black,
    white: game.captures.white + 6.5,
  };
  game.board.flat().forEach((stone) => {
    if (stone) score[stone] += 1;
  });
  return score;
}

export function emptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

export function inside(r, c, rows, cols) {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

export function samePos(a, b) {
  return Boolean(a && b && a.r === b.r && a.c === b.c);
}

export function neighbors(r, c, size) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => inside(nr, nc, size, size));
}
