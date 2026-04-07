import { test, expect } from '@playwright/test';

test.describe('Overview page', () => {
  test('loads and shows orchestration board', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('.mission-board-panel')).toBeVisible();
    await expect(page.locator('.mission-board-panel .panel-label').first()).toContainText('orchestration board');
  });

  test('shows Charlie in the centre of the board', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('.charlie-core')).toBeVisible();
    await expect(page.locator('.charlie-core')).toContainText('Charlie');
  });

  test('shows agent stations on the board', async ({ page }) => {
    await page.goto('/overview');
    // Wait for board data to load and render agent stations
    await expect(page.locator('.agent-station').first()).toBeVisible({ timeout: 10000 });
    const count = await page.locator('.agent-station').count();
    expect(count).toBeGreaterThan(0);
  });

  test('demo mode toggle activates flow animations', async ({ page }) => {
    await page.goto('/overview');
    const demoBtn = page.locator('button:has-text("Demo")');
    await expect(demoBtn).toBeVisible();

    await demoBtn.click();
    await expect(demoBtn).toContainText('Demo active');

    const particles = page.locator('.flow-particle');
    const count = await particles.count();
    expect(count).toBeGreaterThan(0);
  });

  test('hovering a handoff line shows tooltip', async ({ page }) => {
    await page.goto('/overview');
    // Enable demo mode to ensure active lines exist
    await page.click('button:has-text("Demo")');
    const activeLink = page.locator('.handoff-link.flow-active').first();
    await activeLink.hover();
    const tooltip = activeLink.locator('.flow-tooltip');
    await expect(tooltip).toBeVisible();
  });

  test('clicking an agent station opens inspector', async ({ page }) => {
    await page.goto('/overview');
    const station = page.locator('.agent-station').first();
    await station.click();
    await expect(page.locator('.right-rail')).toContainText('State');
  });

  test('mission status section is visible below the board', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('.hero-panel')).toBeVisible();
  });

  test('source health section is visible', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('text=Truthful source health')).toBeVisible();
  });
});
