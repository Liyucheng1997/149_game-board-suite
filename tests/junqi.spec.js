import { expect, test } from "@playwright/test";
import { createJunqi, battle, junqiActions, playJunqi, chooseJunqiAction } from "../src/junqi.js";

const piece = (type, side = "red", revealed = true) => ({ type, side, revealed });
function position(entries) {
  const game = { ...createJunqi("flip"), board: Array.from({ length: 6 }, () => Array(6).fill(null)) };
  for (const [r, c, p] of entries) game.board[r][c] = p;
  return game;
}

test("initial army distribution and combat rules", () => {
  const game = createJunqi("flip");
  expect(game.board.flat()).toHaveLength(36);
  for (const side of ["red", "black"]) {
    expect(game.board.flat().filter((p) => p.side === side)).toHaveLength(18);
  }
  expect(junqiActions(game)).toHaveLength(36);
  expect(game.board.flat().every((p) => !p.revealed)).toBe(true);
  expect(battle(piece("army"), piece("division"))).toBe("win");
  expect(battle(piece("battalion"), piece("regiment"))).toBe("lose");
  expect(battle(piece("brigade"), piece("brigade"))).toBe("both");
  expect(battle(piece("engineer"), piece("mine"))).toBe("win");
  expect(battle(piece("commander"), piece("mine"))).toBe("lose");
  expect(battle(piece("bomb"), piece("mine"))).toBe("both");
  expect(battle(piece("commander"), piece("bomb"))).toBe("both");
  expect(battle(piece("bomb"), piece("flag"))).toBe("win");
});

test("movement rejects hidden targets, friendly pieces, diagonals and immobile pieces", () => {
  const game = position([[2, 2, piece("army")], [2, 3, piece("flag", "black", false)],
    [2, 1, piece("engineer")], [5, 5, piece("mine")], [5, 4, piece("flag")]]);
  const moves = junqiActions(game).filter((a) => a.from?.r === 2 && a.from.c === 2);
  expect(moves.map((a) => a.to)).toEqual([{ r: 3, c: 2 }, { r: 1, c: 2 }]);
  expect(junqiActions(game).some((a) => a.from?.r === 5)).toBe(false);
  expect(playJunqi(game, { kind: "move", from: { r: 2, c: 2 }, to: { r: 3, c: 3 } })).toBeNull();
  expect(game.moves).toBe(0);
});

test("captures, equal ranks, defeat and game endings update the board", () => {
  for (const [type, target, survivor] of [["army", "division", "army"], ["brigade", "brigade", null], ["engineer", "army", "army"]]) {
    const game = position([[0, 0, piece(type)], [0, 1, piece(target, "black")], [5, 5, piece("platoon", "black", false)]]);
    playJunqi(game, { kind: "move", from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });
    expect(game.board[0][0]).toBeNull();
    expect(game.board[0][1]?.type ?? null).toBe(survivor);
    expect(game.turn).toBe("black");
  }
  const flag = position([[0, 0, piece("engineer")], [0, 1, piece("flag", "black")]]);
  playJunqi(flag, { kind: "move", from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });
  expect(flag.winner).toBe("red");
  expect(flag.reason).toBe("夺取军旗");
  expect(junqiActions(flag)).toEqual([]);
  const blocked = position([[0, 0, piece("army")], [5, 5, piece("mine", "black")]]);
  playJunqi(blocked, { kind: "move", from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });
  expect(blocked.reason).toBe("对方无棋可走");
  const draw = position([[0, 0, piece("army")], [5, 5, piece("army", "black")]]);
  draw.quiet = 79;
  playJunqi(draw, { kind: "move", from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });
  expect(draw.winner).toBe("draw");
});

test("AI takes exposed flags and does not read hidden identities", () => {
  for (const difficulty of ["normal", "hard"]) {
    const game = position([[0, 0, piece("army")], [0, 1, piece("flag", "black")]]);
    const action = chooseJunqiAction(game, difficulty);
    expect(action.to).toEqual({ r: 0, c: 1 });
    playJunqi(game, action);
    expect(game.winner).toBe("red");
  }
  const hidden = { revealed: false, get side() { throw new Error("Hidden side read"); }, get type() { throw new Error("Hidden rank read"); } };
  const game = position([[0, 0, piece("army")], [5, 5, hidden]]);
  for (const difficulty of ["easy", "normal", "hard"]) {
    expect(() => chooseJunqiAction(game, difficulty)).not.toThrow();
  }
});

test("military board supports flipping, modes, reset, and mobile layout", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: /军师旅团营/ }).click();
  await page.getByRole("button", { name: "翻棋快局", exact: true }).click();
  await expect(page.locator(".hidden-piece")).toHaveCount(36);
  await page.locator(".cell").first().click();
  await expect(page.locator(".hidden-piece")).toHaveCount(34);
  await page.getByRole("button", { name: "双人", exact: true }).click();
  await page.locator(".cell").filter({ has: page.locator(".hidden-piece") }).first().click();
  await expect(page.locator(".hidden-piece")).toHaveCount(33);
  await expect(page.locator(".status")).toContainText("黑棋");
  await page.getByRole("button", { name: "新局", exact: true }).click();
  await expect(page.locator(".hidden-piece")).toHaveCount(36);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/junqi-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("pending computer moves are cancelled on reset, mode and game changes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173");
  await page.clock.install();
  await page.getByRole("button", { name: /军师旅团营/ }).click();
  await page.getByRole("button", { name: "翻棋快局", exact: true }).click();
  await page.locator(".cell").first().click();
  await page.getByRole("button", { name: "新局", exact: true }).click();
  await page.clock.fastForward(1000);
  await expect(page.locator(".hidden-piece")).toHaveCount(36);
  await page.locator(".cell").first().click();
  await page.getByRole("button", { name: "双人", exact: true }).click();
  await page.clock.fastForward(1000);
  await expect(page.locator(".hidden-piece")).toHaveCount(35);
  await page.getByRole("button", { name: "电脑", exact: true }).click();
  await page.getByRole("button", { name: /围棋/ }).click();
  await page.clock.fastForward(1000);
  await expect(page.locator(".stone")).toHaveCount(0);
  expect(errors).toEqual([]);
});

