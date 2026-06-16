import { test, expect } from '@playwright/test';

test('login → edit → preview updates → publish → published API reflects change', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');

  // Login (locate the password by input type so it survives copy changes).
  await page.locator('input[type="password"]').fill('letmein');
  await page.getByRole('button', { name: 'Sign in to Content Studio' }).click();
  await expect(page.getByText('Content Studio')).toBeVisible();

  // Edit the headline (the first text/rich card in the Hero group).
  const headline = page.locator('.fld textarea, .fld input[type="text"]').first();
  await headline.fill('Brand New Headline');

  // Preview iframe repaints with the new value.
  const frame = page.frameLocator('iframe[title="Site preview"]');
  await expect(frame.locator('[data-cms="hero.headline"]')).toHaveText('Brand New Headline');

  // Wait for the autosave debounce to flush before publishing.
  await expect(page.locator('.ss.saved')).toBeVisible();

  // Publish.
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/your changes are now live/)).toBeVisible();

  // Published API reflects the change.
  const res = await request.get('/api/content?state=published');
  const body = await res.json();
  expect(body.content['hero.headline']).toBe('Brand New Headline');
});

test('set a YouTube video URL → preview embeds an iframe → publish persists the URL', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');
  await page.locator('input[type="password"]').fill('letmein');
  await page.getByRole('button', { name: 'Sign in to Content Studio' }).click();
  await expect(page.getByText('Content Studio')).toBeVisible();

  // Find the Hero video card, switch to URL mode, paste a YouTube link.
  const videoCard = page.locator('.fld', { hasText: 'Hero video' });
  await videoCard.getByRole('button', { name: 'URL' }).click();
  await videoCard.getByPlaceholder(/Paste a video URL/).fill('https://youtu.be/dQw4w9WgXcQ');

  // Preview iframe renders a nested embed iframe inside the video wrapper.
  const frame = page.frameLocator('iframe[title="Site preview"]');
  await expect(frame.locator('[data-cms="hero.video"] iframe')).toHaveAttribute(
    'src',
    /youtube\.com\/embed\/dQw4w9WgXcQ/,
  );

  await expect(page.locator('.ss.saved')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/your changes are now live/)).toBeVisible();

  const res = await request.get('/api/content?state=published');
  const body = await res.json();
  expect(body.content['hero.video']).toBe('https://youtu.be/dQw4w9WgXcQ');
});
