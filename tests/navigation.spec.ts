import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('sidebar shows all nav items in correct order', async ({ page }) => {
    await page.goto('/overview');
    const navItems = page.locator('.nav-item');
    const labels: string[] = [];
    for (const item of await navItems.all()) {
      const text = (await item.textContent() ?? '').trim();
      if (text) labels.push(text);
    }
    expect(labels).toEqual(['Overview', 'Agents', 'Departments', 'Tasks', 'Events', 'Settings']);
  });

  test('clicking each nav item navigates to the correct page', async ({ page }) => {
    await page.goto('/overview');

    await page.click('.nav-item:has-text("Agents")');
    await expect(page).toHaveURL(/\/agents/);

    await page.click('.nav-item:has-text("Departments")');
    await expect(page).toHaveURL(/\/teams/);

    await page.click('.nav-item:has-text("Tasks")');
    await expect(page).toHaveURL(/\/tasks/);

    await page.click('.nav-item:has-text("Events")');
    await expect(page).toHaveURL(/\/events/);

    await page.click('.nav-item:has-text("Settings")');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('version number is visible in sidebar footer', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('.sidebar-bottom')).toContainText('Mission Control v1.0.0');
  });
});
