import { test, expect } from '@playwright/test';

test('login → edit → preview updates → publish → published API reflects change', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');

  // Login
  await page.getByPlaceholder('Password').fill('letmein');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Content Studio')).toBeVisible();

  // Edit the headline (the first text/rich card in the Hero group).
  const headline = page.locator('.field-card textarea, .field-card input[type="text"]').first();
  await headline.fill('Brand New Headline');

  // Preview iframe repaints with the new value.
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.locator('[data-cms="hero.headline"]')).toHaveText('Brand New Headline');

  // Wait for the autosave debounce to flush before publishing.
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // Publish.
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published — your changes are now live')).toBeVisible();

  // Published API reflects the change.
  const res = await request.get('/api/content?state=published');
  const body = await res.json();
  expect(body.content['hero.headline']).toBe('Brand New Headline');
});
