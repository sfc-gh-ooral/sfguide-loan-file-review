// Screenshots of the running app in Sample (no-account) mode for the guide and the catalog card.
// Usage: `npm run dev` without .env.local, then `node scripts/capture-screenshots.mjs`.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const APP = process.env.APP_URL ?? 'http://localhost:3000';
mkdirSync('docs/images', { recursive: true });
mkdirSync('docs/catalog', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

async function shot(name, path, prep) {
  await page.goto(`${APP}${path}`);
  await page.waitForTimeout(2500);
  if (prep) await prep();
  await page.screenshot({ path: `docs/images/${name}.png` });
  console.log('captured', name);
}
const scrollTo = (text) => async () => {
  await page.getByText(text, { exact: true }).first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  await page.waitForTimeout(400);
};

await shot('01-pipeline', '/');
await shot('02-income-mismatch', '/loan?id=LN-260101');
await shot('03-deposit-statement', '/loan?id=LN-260102&doc=DOC-0015', scrollTo('Documents'));
await shot('04-request-document', '/loan?id=LN-260101', async () => {
  await page.getByText('Conditions (', { exact: false }).first().scrollIntoViewIfNeeded();
  await page.locator('tr', { hasText: 'R-LN-260101-income' }).getByRole('button', { name: 'Request document' }).click();
  await page.waitForSelector('text=Sample AI response', { timeout: 20000 });
  await page.waitForSelector('textarea', { timeout: 20000 });
  await page.waitForTimeout(500);
});
await shot('05-qc-sampling', '/qc?id=LN-260103', async () => { await page.waitForSelector('text=QC narrative ·'); await page.waitForTimeout(800); });
await shot('06-ask-income', '/ask?id=LN-260101', async () => {
  await page.getByRole('button', { name: "What's the borrower's verified monthly income?" }).click();
  await page.waitForSelector('text=Sample AI response', { timeout: 20000 });
  await page.waitForTimeout(500);
});
await shot('07-clean-file', '/loan?id=LN-260104');
await browser.close();

// Catalog cards: 960x600 JPEG, dashboard first.
const cards = ['01-pipeline', '02-income-mismatch', '03-deposit-statement', '04-request-document', '05-qc-sampling', '06-ask-income'];
cards.forEach((c, i) => {
  const out = `docs/catalog/loan-file-review-${i + 1}.jpg`;
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '48', '-z', '600', '960', `docs/images/${c}.png`, '--out', out], { stdio: 'ignore' });
});
console.log('catalog cards written');
