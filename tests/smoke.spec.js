import { expect, test } from "@playwright/test";

test("switches games and accepts first moves", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByRole("heading", { name: "国际象棋" })).toBeVisible();

  for (const name of ["中国象棋", "五子棋", "围棋", "国际象棋"]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await page.locator(".cell").nth(52).click();
  await page.locator(".cell").nth(44).click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /五子棋/ }).click();
  await page.locator(".cell").nth(112).click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /围棋/ }).click();
  await page.locator(".cell").nth(40).click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /中国象棋/ }).click();
  await page.locator(".cell").nth(83).click();
  await page.locator(".cell").nth(74).click();
  await page.waitForTimeout(500);

  expect(errors).toEqual([]);
});
