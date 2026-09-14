import { Chess } from 'chess.js';
import { createJunqi, playJunqi } from '../src/junqi.js';
import { createXiangqi, legalXiangqiMoves, applyXiangqiMove, createGridGame, gomokuWin, createGo, tryGoMove, scoreGo } from '../src/rules.js';

export const sides = { chess: ['w', 'b'], xiangqi: ['red', 'black'], junqi: ['red', 'black'], gomoku: ['black', 'white'], go: ['black', 'white'] };
const names = { w: '白方', b: '黑方', red: '红方', black: '黑方', white: '白方' };
export function createMatch(type, mode = 'standard') {
  if (!Object.hasOwn(sides, type) || !['standard', 'flip'].includes(mode)) throw new Error('不支持的玩法');
  const data = type === 'chess' ? new Chess() : type === 'xiangqi' ? createXiangqi() : type === 'gomoku' ? createGridGame(15) : type === 'go' ? createGo() : createJunqi(mode);
  return { type, mode, data, over: false, result: '', log: ['联机对局已创建。'], revision: 0 };
}
export const turn = (match) => match.type === 'chess' ? match.data.turn() : match.data.turn;
const pos = (p, rows, cols) => p && Number.isInteger(p.r) && Number.isInteger(p.c) && p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols;
const equal = (a, b) => a && b && a.r === b.r && a.c === b.c;
const square = (p) => `${'abcdefgh'[p.c]}${8 - p.r}`;

export function moveMatch(match, seat, action) {
  if (match.over) throw new Error('棋局已结束');
  const side = sides[match.type][seat];
  if (turn(match) !== side) throw new Error('还未轮到你');
  if (!action || typeof action !== 'object') throw new Error('无效走法');
  const game = match.data;
  let message;
  if (match.type === 'chess') {
    if (!pos(action.from, 8, 8) || !pos(action.to, 8, 8)) throw new Error('无效位置');
    let result;
    try { result = game.move({ from: square(action.from), to: square(action.to), promotion: 'q' }); } catch { throw new Error('这一步不符合规则'); }
    message = result.san;
    match.over = game.isGameOver();
    if (match.over) match.result = game.isCheckmate() ? `${names[side]}获胜：将死。` : '和棋。';
  } else if (match.type === 'xiangqi') {
    const move = legalXiangqiMoves(game, side).find((m) => equal(m.from, action.from) && equal(m.to, action.to));
    if (!move) throw new Error('这一步不符合规则');
    applyXiangqiMove(game, move);
    message = `${move.from.r + 1},${move.from.c + 1} → ${move.to.r + 1},${move.to.c + 1}`;
    match.over = legalXiangqiMoves(game, game.turn).length === 0;
    if (match.over) match.result = `${names[side]}获胜。`;
  } else if (match.type === 'junqi') {
    if (!pos(action.to, game.board.length, game.board[0].length)) throw new Error('无效位置');
    message = playJunqi(game, action);
    if (!message) throw new Error('这一步不符合规则');
    match.over = Boolean(game.winner);
    if (match.over) match.result = `${game.winner === 'draw' ? '和棋' : names[game.winner] + '获胜'}：${game.reason}。`;
  } else if (match.type === 'gomoku') {
    if (!pos(action.to, 15, 15) || game.board[action.to.r][action.to.c]) throw new Error('请选择空位');
    const { r, c } = action.to;
    game.board[r][c] = side;
    game.moves++;
    if (gomokuWin(game.board, r, c, side)) {
      game.winner = side; match.over = true; match.result = `${names[side]}五子连线，获胜。`;
    } else if (game.moves === 225) { match.over = true; match.result = '棋盘已满，和棋。'; }
    game.turn = side === 'black' ? 'white' : 'black';
    message = `落子 ${r + 1},${c + 1}`;
  } else {
    if (action.kind === 'pass') {
      game.passes++;
      message = '虚着';
      if (game.passes >= 2) {
        match.over = true;
        const score = scoreGo(game);
        match.result = `终局：黑 ${score.black}，白 ${score.white}；${score.black > score.white ? '黑方' : '白方'}获胜。`;
      }
    } else {
      if (!pos(action.to, 9, 9)) throw new Error('无效位置');
      const result = tryGoMove(game, action.to.r, action.to.c, side);
      if (!result.ok) throw new Error('此处不能落子');
      game.captures[side] += result.captured;
      game.passes = 0;
      message = `落子 ${action.to.r + 1},${action.to.c + 1}，提子 ${result.captured}`;
    }
    game.turn = side === 'black' ? 'white' : 'black';
  }
  match.revision++;
  match.log = [match.over ? match.result : `${names[side]}：${message}`, ...match.log].slice(0, 12);
}

export function packMatch(match, publicView = true) {
  const result = { ...match, data: match.type === 'chess' ? (publicView ? { fen: match.data.fen() } : { pgn: match.data.pgn() }) : structuredClone(match.data) };
  if (match.type === 'junqi' && publicView) {
    result.remaining = Object.fromEntries(['red', 'black'].map((side) => [side, match.data.board.flat().filter((p) => p?.side === side).length]));
    result.data.board = result.data.board.map((row) => row.map((p) => p && !p.revealed ? { revealed: false } : p));
  }
  return result;
}
export function restoreMatch(saved) {
  if (saved.type !== 'chess') return saved;
  const data = new Chess();
  if (saved.data.pgn) data.loadPgn(saved.data.pgn);
  return { ...saved, data };
}
