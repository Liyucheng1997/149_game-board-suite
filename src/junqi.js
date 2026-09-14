export const RANKS = {
  commander: { name: "司令", rank: 9, count: 1 },
  army: { name: "军长", rank: 8, count: 1 },
  division: { name: "师长", rank: 7, count: 1 },
  brigade: { name: "旅长", rank: 6, count: 1 },
  regiment: { name: "团长", rank: 5, count: 2 },
  battalion: { name: "营长", rank: 4, count: 2 },
  company: { name: "连长", rank: 3, count: 2 },
  platoon: { name: "排长", rank: 2, count: 2 },
  engineer: { name: "工兵", rank: 1, count: 3 },
  bomb: { name: "炸弹", rank: 0, count: 1 },
  mine: { name: "地雷", rank: 0, count: 1 },
  flag: { name: "军旗", rank: 0, count: 1 },
};

export const STANDARD_COUNTS = { commander: 1, army: 1, division: 2, brigade: 2, regiment: 2, battalion: 2, company: 3, platoon: 3, engineer: 3, bomb: 2, mine: 3, flag: 1 };

export function stationType(r, c) {
  if ((r === 0 || r === 11) && (c === 1 || c === 3)) return "headquarters";
  if (([2, 4, 7, 9].includes(r) && [1, 3].includes(c)) || ([3, 8].includes(r) && c === 2)) return "camp";
  return "station";
}

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inBoard = (r, c) => r >= 0 && r < 12 && c >= 0 && c < 5;
const key = (r, c) => `${r},${c}`;

export function roadNeighbors(r, c) {
  const results = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = r + dr, nc = c + dc;
    if ((!dr && !dc) || !inBoard(nr, nc)) continue;
    if ((r === 5 && nr === 6) || (r === 6 && nr === 5)) {
      if (dc === 0 && [0, 2, 4].includes(c)) results.push({ r: nr, c: nc });
    } else if (!dr || !dc || stationType(r, c) === "camp" || stationType(nr, nc) === "camp") {
      results.push({ r: nr, c: nc });
    }
  }
  return results;
}

export function railNeighbors(r, c) {
  return directions.map(([dr, dc]) => ({ r: r + dr, c: c + dc })).filter((to) => {
    if (!inBoard(to.r, to.c)) return false;
    if (to.r === r) return [1, 5, 6, 10].includes(r);
    return ([0, 4].includes(c) && Math.min(r, to.r) >= 1 && Math.max(r, to.r) <= 10)
      || (c === 2 && Math.min(r, to.r) === 5 && Math.max(r, to.r) === 6);
  });
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createStandard() {
  const board = Array.from({ length: 12 }, () => Array(5).fill(null));
  for (const side of ["black", "red"]) {
    const back = side === "black" ? 0 : 11;
    const front = side === "black" ? 5 : 6;
    const positions = [];
    for (let r = side === "black" ? 0 : 6; r < (side === "black" ? 6 : 12); r++) {
      for (let c = 0; c < 5; c++) if (stationType(r, c) !== "camp") positions.push({ r, c });
    }
    const place = (type, candidates) => {
      const pos = shuffled(candidates.filter(({ r, c }) => !board[r][c]))[0];
      board[pos.r][pos.c] = { side, type, revealed: true };
    };
    place("flag", [{ r: back, c: 1 }, { r: back, c: 3 }]);
    for (let i = 0; i < 3; i++) place("mine", positions.filter(({ r }) => Math.abs(r - back) <= 1));
    for (let i = 0; i < 2; i++) place("bomb", positions.filter(({ r }) => r !== front));
    for (const [type, count] of Object.entries(STANDARD_COUNTS)) {
      if (["flag", "mine", "bomb"].includes(type)) continue;
      for (let i = 0; i < count; i++) place(type, positions);
    }
  }
  return { mode: "standard", board, turn: "red", moves: 0, quiet: 0, winner: null, reason: "" };
}

export function createJunqi(mode = "standard") {
  if (mode === "standard") return createStandard();
  const pieces = ["red", "black"].flatMap((side) => Object.entries(RANKS).flatMap(([type, info]) =>
    Array.from({ length: info.count }, () => ({ side, type, revealed: false }))));
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return { mode: "flip", board: Array.from({ length: 6 }, (_, r) => pieces.slice(r * 6, r * 6 + 6)), turn: "red", moves: 0, quiet: 0, winner: null, reason: "" };
}

function standardActions(game, side) {
  const actions = [];
  game.board.forEach((row, r) => row.forEach((piece, c) => {
    if (piece?.side !== side || ["mine", "flag"].includes(piece.type) || stationType(r, c) === "headquarters") return;
    const destinations = new Map();
    const add = (to) => {
      const target = game.board[to.r][to.c];
      if (target?.side === side || (target && stationType(to.r, to.c) === "camp")) return;
      destinations.set(key(to.r, to.c), { kind: "move", from: { r, c }, to, capture: Boolean(target) });
    };
    roadNeighbors(r, c).forEach(add);
    if (piece.type === "engineer") {
      const visited = new Set([key(r, c)]);
      const queue = [{ r, c }];
      while (queue.length) {
        const pos = queue.pop();
        for (const to of railNeighbors(pos.r, pos.c)) {
          const id = key(to.r, to.c);
          if (visited.has(id)) continue;
          visited.add(id);
          add(to);
          if (!game.board[to.r][to.c]) queue.push(to);
        }
      }
    } else {
      for (const [dr, dc] of directions) {
        let pos = { r, c };
        while (true) {
          const to = { r: pos.r + dr, c: pos.c + dc };
          if (!railNeighbors(pos.r, pos.c).some((p) => p.r === to.r && p.c === to.c)) break;
          add(to);
          if (game.board[to.r][to.c]) break;
          pos = to;
        }
      }
    }
    actions.push(...destinations.values());
  }));
  return actions;
}

export function junqiActions(game, side = game.turn) {
  if (game.winner) return [];
  if (game.mode === "standard") return standardActions(game, side);
  const actions = [];
  game.board.forEach((row, r) => row.forEach((piece, c) => {
    if (piece && !piece.revealed) {
      actions.push({ kind: "flip", to: { r, c } });
    } else if (piece?.side === side && !["mine", "flag"].includes(piece.type)) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= 6 || nc < 0 || nc >= 6) continue;
        const target = game.board[nr][nc];
        if (!target || (target.revealed && target.side !== side)) {
          actions.push({ kind: "move", from: { r, c }, to: { r: nr, c: nc }, capture: Boolean(target) });
        }
      }
    }
  }));
  return actions;
}

export function battle(attacker, defender) {
  if (defender.type === "flag") return "win";
  if (attacker.type === "bomb" || defender.type === "bomb") return "both";
  if (defender.type === "mine") return attacker.type === "engineer" ? "win" : "lose";
  const difference = RANKS[attacker.type].rank - RANKS[defender.type].rank;
  return difference > 0 ? "win" : difference < 0 ? "lose" : "both";
}

export function playJunqi(game, action) {
  const valid = junqiActions(game).find((item) => item.kind === action.kind &&
    item.to.r === action.to.r && item.to.c === action.to.c &&
    (item.kind === "flip" || (item.from.r === action.from?.r && item.from.c === action.from?.c)));
  if (!valid) return null;
  const name = (piece) => `${piece.side === "red" ? "红方" : "黑方"}${RANKS[piece.type].name}`;
  const target = game.board[valid.to.r][valid.to.c];
  let message;
  if (valid.kind === "flip") {
    target.revealed = true;
    game.quiet = 0;
    message = `翻开 ${name(target)}（${valid.to.r + 1},${valid.to.c + 1}）。`;
  } else {
    const piece = game.board[valid.from.r][valid.from.c];
    const result = target ? battle(piece, target) : "win";
    game.board[valid.from.r][valid.from.c] = null;
    game.board[valid.to.r][valid.to.c] = result === "win" ? piece : result === "both" ? null : target;
    game.quiet = target ? 0 : game.quiet + 1;
    message = target
      ? `${name(piece)} 对战 ${name(target)}：${result === "win" ? "进攻方胜" : result === "both" ? "同归于尽" : "进攻方阵亡"}。`
      : `${name(piece)} 移至 ${valid.to.r + 1},${valid.to.c + 1}。`;
    if (target?.type === "flag") {
      game.winner = game.turn;
      game.reason = "夺取军旗";
    }
  }
  game.moves++;
  game.lastMove = valid;
  game.turn = game.turn === "red" ? "black" : "red";
  if (!game.winner && junqiActions(game).length === 0) {
    game.winner = game.turn === "red" ? "black" : "red";
    game.reason = "对方无棋可走";
  }
  if (!game.winner && game.quiet >= 80) {
    game.winner = "draw";
    game.reason = game.mode === "standard" ? "连续 80 手未吃子" : "连续 80 手未翻棋或吃子";
  }
  return message;
}

function value(piece) {
  return piece.type === "flag" ? 10000 : piece.type === "bomb" ? 6 : piece.type === "mine" ? 4 : RANKS[piece.type].rank + 1;
}

export function chooseJunqiAction(game, difficulty) {
  const actions = junqiActions(game);
  if (!actions.length) return null;
  if (difficulty === "easy") return actions[Math.floor(Math.random() * actions.length)];
  let best, bestScore = -Infinity;
  for (const action of actions) {
    // Hidden pieces are never inspected by the computer's evaluation.
    let score = Math.random() * 0.5;
    if (action.kind === "flip") score += 1;
    else {
      const piece = game.board[action.from.r][action.from.c];
      const target = game.board[action.to.r][action.to.c];
      if (target) {
        const result = battle(piece, target);
        score += result === "win" ? value(target) : result === "both" ? value(target) - value(piece) : -value(piece);
      }
      if (difficulty === "hard") {
        const copy = { ...game, board: game.board.map((row) => row.map((p) => p ? (p.revealed ? { ...p } : { revealed: false }) : null)) };
        playJunqi(copy, action);
        if (copy.winner === game.turn) score += 20000;
        else if (copy.winner && copy.winner !== "draw") score -= 20000;
        else {
          let risk = 0;
          for (const reply of junqiActions(copy)) {
            if (!reply.capture) continue;
            const attacker = copy.board[reply.from.r][reply.from.c];
            const defender = copy.board[reply.to.r][reply.to.c];
            const result = battle(attacker, defender);
            risk = Math.max(risk, result === "win" ? value(defender) : result === "both" ? value(defender) - value(attacker) : 0);
          }
          score -= risk;
          if (!target) {
            const enemies = copy.board.flatMap((row, r) => row.flatMap((p, c) => p?.revealed && p.side !== piece.side ? [{ r, c }] : []));
            if (enemies.length) score += 0.6 / (1 + Math.min(...enemies.map((p) => Math.abs(p.r - action.to.r) + Math.abs(p.c - action.to.c))));
          }
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best;
}
