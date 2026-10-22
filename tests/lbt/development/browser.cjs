const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LBT_CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 950 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const login = async (email) => {
      await page.goto('http://127.0.0.1:4330');
      await page.locator('#email').selectOption(email);
      await page.locator('#password').fill('tim@apple.dev');
      await page.getByRole('button', { name: 'Sign in with Twenty' }).click();
      await expect(page.locator('#identity')).toContainText(email, {
        timeout: 60000,
      });
    };
    const logout = async () => {
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page.locator('#login')).toBeVisible();
    };
    await login('tim@apple.dev');
    if (!process.argv.includes('--capture-only')) {
      await page
        .getByRole('button', { name: 'Generate November cycle' })
        .click();
      await expect(page.locator('article')).toHaveCount(2, { timeout: 60000 });
      let first = page.locator('article').nth(0),
        second = page.locator('article').nth(1);
      await first.getByRole('button', { name: 'Book visit' }).click();
      await expect(first).toContainText('Booked');
      await second.getByRole('button', { name: 'Book visit' }).click();
      await expect(page.locator('#message')).toContainText('Resource conflict');
      await second.locator('input[name=start]').fill('2026-11-10T15:00:00Z');
      await second.locator('input[name=end]').fill('2026-11-10T16:00:00Z');
      await second.getByRole('button', { name: 'Book visit' }).click();
      await expect(second).toContainText('Booked');
      await page.getByRole('button', { name: 'Complete cycle' }).click();
      await expect(page.locator('#message')).toContainText(
        'Both visits require',
      );
      await page.screenshot({
        path: 'docs/lbt/evidence/development/scheduled.png',
        fullPage: true,
      });
      await logout();
      for (const email of ['jony.ive@apple.dev', 'phil.schiler@apple.dev']) {
        await login(email);
        await expect(page.locator('article')).toHaveCount(1);
        await page
          .getByRole('button', { name: 'Record synthetic execution' })
          .click();
        await expect(
          page.getByRole('button', { name: 'Submit new report version' }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Submit new report version' })
          .click();
        await expect(page.locator('article')).toContainText('Awaiting review');
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('link', { name: 'Download current report' }).click(),
        ]);
        const downloaded = await download.path();
        if (!fs.readFileSync(downloaded, 'utf8').startsWith('SYNTHETIC:'))
          throw Error('Downloaded bytes are not synthetic report');
        await logout();
      }
      await login('jane.austen@apple.dev');
      await expect(page.locator('article')).toHaveCount(2);
      await page
        .getByRole('button', { name: 'Approve current report' })
        .first()
        .click();
      await expect(page.locator('article').first()).toContainText('Approved');
      await page
        .getByRole('button', { name: 'Approve current report' })
        .click();
      await expect(page.locator('article').nth(1)).toContainText('Approved');
      await page.screenshot({
        path: 'docs/lbt/evidence/development/reviewed.png',
        fullPage: true,
      });
      await logout();
      await login('tim@apple.dev');
      await page.getByRole('button', { name: 'Complete cycle' }).click();
      await expect(page.locator('article').first()).toContainText(
        'Cycle complete',
      );
    }
    await page.screenshot({
      path: 'docs/lbt/evidence/development/completed.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'docs/lbt/evidence/development/mobile.png',
      fullPage: true,
    });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ))
    )
      throw Error('Mobile horizontal overflow');
    if (errors.length) throw Error(errors.join('\n'));
    console.log(
      process.argv.includes('--capture-only')
        ? 'PASS repeated native sign-in, retained completed workflow rendering and mobile width (capture only; no mutations rerun)'
        : 'PASS browser native sign-in, two visits, overlap error, adjacent booking, early completion denial, two separate employee report submissions/downloads, reviewer approvals, controlled completion and mobile width',
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
