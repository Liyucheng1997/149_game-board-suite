import { test, expect } from '@playwright/test';

test('two browsers join one link, enforce seats, reconnect and agree to a rematch', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [host, guest, third] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  [host, guest, third].forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  try {
    await host.goto('http://127.0.0.1:5173/');
    await host.getByRole('button', { name: '联机', exact: true }).click();
    await expect(host.locator('.room-status')).toContainText('等待朋友加入');
    const link = await host.getByRole('textbox', { name: '邀请链接' }).inputValue();
    await guest.goto(link);
    await expect(host.locator('.room-status')).toContainText('双方已连接');
    await expect(guest.locator('.status')).toContainText('等待对方落子');
    await guest.locator('.cell').nth(52).click();
    expect(await guest.locator('.cell.selected').count()).toBe(0);
    await host.locator('.cell').nth(52).click();
    await host.locator('.cell').nth(36).click();
    await expect(guest.locator('.cell').nth(36).locator('.piece.white')).toHaveCount(1);
    await expect(guest.locator('.status')).toContainText('轮到你落子');
    await third.goto(link);
    await expect(third.locator('.room-status')).toContainText('房间已满');
    await guest.reload();
    await expect(guest.locator('.status')).toContainText('轮到你落子');
    await expect(guest.locator('.cell').nth(36).locator('.piece.white')).toHaveCount(1);
    await guest.locator('.cell').nth(12).click();
    await guest.locator('.cell').nth(28).click();
    await expect(host.locator('.cell').nth(28).locator('.piece.black')).toHaveCount(1);
    await host.getByRole('button', { name: '邀请新局', exact: true }).click();
    await expect(guest.getByRole('button', { name: '同意新局' })).toBeVisible();
    await expect(host.locator('.cell').nth(36).locator('.piece.white')).toHaveCount(1);
    await guest.getByRole('button', { name: '同意新局' }).click();
    await expect(host.locator('.cell').nth(52).locator('.piece.white')).toHaveCount(1);
    await expect(host.locator('.cell').nth(36).locator('.piece')).toHaveCount(0);
    await contexts[1].setOffline(true);
    await guest.reload().catch(() => {});
    await expect(host.locator('.room-status')).toContainText('离线');
    await contexts[1].setOffline(false);
    await guest.goto(link);
    await expect(host.locator('.room-status')).toContainText('双方已连接');
    await guest.getByRole('button', { name: '退出房间' }).click();
    await expect(host.locator('.room-status')).toContainText('已关闭');
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((c) => c.close())); }
});

for (const game of ['xiangqi', 'gomoku', 'go', 'junqi', 'flip']) {
  test(`online ${game} shares authoritative board state`, async ({ browser }) => {
    const a = await browser.newContext(), b = await browser.newContext();
    const host = await a.newPage(), guest = await b.newPage();
    try {
      await host.goto('http://127.0.0.1:5173/');
      await host.locator(`[data-game="${game === 'flip' ? 'junqi' : game}"]`).click();
      if (game === 'flip') await host.getByRole('button', { name: '翻棋快局', exact: true }).click();
      await host.getByRole('button', { name: '联机', exact: true }).click();
      await expect(host.locator('.room-status')).toContainText('等待朋友加入');
      await guest.goto(await host.getByRole('textbox', { name: '邀请链接' }).inputValue());
      await expect(host.locator('.room-status')).toContainText('双方已连接');
      if (game === 'xiangqi') {
        await host.locator('.cell').nth(54).click(); await host.locator('.cell').nth(45).click();
      } else if (game === 'gomoku') await host.locator('.cell').nth(112).click();
      else if (game === 'go') await host.locator('.cell').nth(40).click();
      else if (game === 'flip') await host.locator('.cell').first().click();
      else {
        await host.locator('.cell[data-r="6"][data-c="0"]').click();
        await host.locator('.cell.legal').first().click();
      }
      await expect(guest.locator('.status')).toContainText('轮到你落子');
      const board = (page) => page.locator('.cell').evaluateAll((cells) => cells.map((c) => c.innerHTML));
      expect(await board(host)).toEqual(await board(guest));
      if (game === 'go') {
        await guest.getByRole('button', { name: '虚着', exact: true }).click();
        await expect(host.locator('.status')).toContainText('轮到你落子');
        await host.getByRole('button', { name: '虚着', exact: true }).click();
        await expect(guest.locator('.status')).toContainText('终局');
      }
      await host.getByRole('button', { name: '退出房间' }).click();
    } finally { await a.close(); await b.close(); }
  });
}
