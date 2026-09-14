import { expect, test } from "@playwright/test";
import { createJunqi, STANDARD_COUNTS, stationType, junqiActions, playJunqi, chooseJunqiAction } from "../src/junqi.js";

const piece = (type, side = "red") => ({ type, side, revealed: true });
function position(entries) {
  const game = { ...createJunqi(), board: Array.from({ length: 12 }, () => Array(5).fill(null)) };
  entries.forEach(([r, c, p]) => { game.board[r][c] = p; });
  return game;
}
const movesFrom = (game, r, c) => junqiActions(game).filter((m) => m.from.r === r && m.from.c === c).map((m) => `${m.to.r},${m.to.c}`);

test("standard setup has 50 correctly placed pieces and 10 empty camps", () => {
  for (let i = 0; i < 40; i++) {
    const game = createJunqi();
    expect(game.board).toHaveLength(12);
    expect(game.board.flat().filter(Boolean)).toHaveLength(50);
    for (const side of ["black", "red"]) for (const [type, count] of Object.entries(STANDARD_COUNTS)) {
      expect(game.board.flat().filter((p) => p?.side === side && p.type === type)).toHaveLength(count);
    }
    game.board.forEach((row, r) => row.forEach((p, c) => {
      if (stationType(r, c) === "camp") expect(p).toBeNull();
      if (!p) return;
      expect(p.revealed).toBe(true);
      expect(p.side).toBe(r < 6 ? "black" : "red");
      if (p.type === "flag") expect(stationType(r, c)).toBe("headquarters");
      if (p.type === "mine") expect([0, 1, 10, 11]).toContain(r);
      if (p.type === "bomb") expect([5, 6]).not.toContain(r);
    }));
    expect(junqiActions(game).length).toBeGreaterThan(0);
  }
});

test("ordinary units run straight on rails, stop at blockers and cannot turn", () => {
  const game = position([[5, 0, piece("army")], [5, 3, piece("platoon", "black")], [3, 0, piece("engineer")]]);
  const moves = movesFrom(game, 5, 0);
  expect(moves).toEqual(expect.arrayContaining(["5,1", "5,2", "5,3", "4,0", "10,0"]));
  expect(moves).not.toContain("5,4");
  expect(moves).not.toContain("3,0");
  expect(moves).not.toContain("2,0");
  expect(moves).not.toContain("6,4");
});

test("engineers turn on connected railways but never jump blockers", () => {
  const game = position([[5, 0, piece("engineer")]]);
  expect(movesFrom(game, 5, 0)).toEqual(expect.arrayContaining(["1,4", "10,2", "6,4"]));
  const blocked = position([[5, 0, piece("engineer")], [4, 0, piece("army")], [6, 0, piece("army")], [5, 1, piece("army")]]);
  expect(movesFrom(blocked, 5, 0)).not.toContain("10,2");
  expect(movesFrom(blocked, 5, 0)).not.toContain("5,2");
});

test("camp diagonals, immunity, headquarters lock and mountain crossings", () => {
  const game = position([[3, 0, piece("army")], [2, 1, piece("platoon", "black")], [1, 2, piece("engineer")]]);
  expect(movesFrom(game, 3, 0)).not.toContain("2,1");
  expect(movesFrom(game, 3, 0)).toContain("4,1");
  expect(movesFrom(game, 1, 2)).not.toContain("2,1");
  const camp = position([[2, 1, piece("platoon")]]);
  expect(movesFrom(camp, 2, 1)).toEqual(expect.arrayContaining(["1,0", "1,2", "3,0", "3,2"]));
  const hq = position([[11, 1, piece("army")], [11, 3, piece("flag")], [10, 4, piece("mine")]]);
  expect(junqiActions(hq)).toHaveLength(0);
  const mountain = position([[5, 1, piece("army")]]);
  expect(movesFrom(mountain, 5, 1)).not.toContain("6,1");
  expect(movesFrom(mountain, 5, 1)).not.toContain("6,0");
  const bridge = position([[5, 2, piece("army")]]);
  expect(movesFrom(bridge, 5, 2)).toContain("6,2");
  expect(movesFrom(bridge, 5, 2)).not.toContain("7,2");
});

test("standard AI moves legally on every difficulty and can capture a headquarters flag", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const game = createJunqi();
    for (let i = 0; i < 8 && !game.winner; i++) {
      const action = chooseJunqiAction(game, difficulty);
      expect(action).toBeTruthy();
      expect(playJunqi(game, action)).toBeTruthy();
    }
  }
  const game = position([[1, 1, piece("engineer")], [0, 1, piece("flag", "black")]]);
  expect(playJunqi(game, { kind: "move", from: { r: 1, c: 1 }, to: { r: 0, c: 1 } })).toBeTruthy();
  expect(game.winner).toBe("red");
});

test("full board renders routes, plays against computer, and preserves quick variant", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: /军师旅团营/ }).click();
  await expect(page.locator(".cell")).toHaveCount(60);
  await expect(page.locator(".army-piece")).toHaveCount(50);
  await expect(page.locator(".camp")).toHaveCount(10);
  await expect(page.locator(".headquarters")).toHaveCount(4);
  await expect(page.locator(".military-routes")).toBeVisible();
  await page.locator('.cell[data-r="6"][data-c="0"]').click();
  await expect(page.locator(".cell.legal").first()).toBeVisible();
  await page.locator(".cell.legal").first().click();
  await expect(page.locator(".status")).not.toContainText("思考");
  await expect(page.locator(".metric").filter({ hasText: "手数" }).locator("strong")).toHaveText("2");
  await page.getByText("标准军棋 · 玩法", { exact: true }).click();
  await expect(page.getByText(/只有工兵能沿相通的铁路转弯/)).toBeVisible();
  await page.getByRole("button", { name: "翻棋快局", exact: true }).click();
  await expect(page.locator(".hidden-piece")).toHaveCount(36);
  await page.getByRole("button", { name: "标准军棋", exact: true }).click();
  await expect(page.locator(".army-piece")).toHaveCount(50);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/standard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/standard-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
