import { test, expect } from '@playwright/test';

test.describe('Departments page', () => {
  test('shows tab bar with all department views', async ({ page }) => {
    await page.goto('/teams');
    const tabs = page.locator('.ghost-button');
    const labels = await tabs.allTextContents();
    expect(labels).toContain('Overview');
    expect(labels).toContain('Pipeline');
    expect(labels).toContain('Roles');
    expect(labels).toContain('Activity');
    expect(labels).toContain('Manage');
  });

  test('shows local-only disclaimer', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('text=Departments are a local grouping')).toBeVisible();
  });

  test('factory floor shows departments', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('text=Department overview')).toBeVisible();
    const count = await page.locator('.info-card').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('switching to Manage tab works', async ({ page }) => {
    await page.goto('/teams');
    await page.click('button:has-text("Manage")');
    await expect(page.locator('text=Manage Departments')).toBeVisible();
  });

  test('switching to Pipeline tab works', async ({ page }) => {
    await page.goto('/teams');
    await page.click('button:has-text("Pipeline")');
    await expect(page.locator('text=Queue stages by department')).toBeVisible();
  });

  test('create department form is on Overview tab', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('text=Create new department')).toBeVisible();
    await expect(page.locator('input[placeholder="Department name"]')).toBeVisible();
  });

  test('creating a duplicate department shows inline error', async ({ page }) => {
    await page.goto('/teams');
    await page.fill('input[placeholder="Department name"]', 'Orchestration');
    await page.click('button:has-text("Create")');
    await expect(page.locator('.error-state')).toContainText('already exists');
  });
});
