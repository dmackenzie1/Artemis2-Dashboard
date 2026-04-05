const { chromium } = require('playwright');

const APP_URL = 'http://localhost:8080';
const SCREENSHOT_PATH = 'screenshot.png';

async function captureScreenshot() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(APP_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForLoadState('networkidle', { timeout: 60000 });

    await page.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

captureScreenshot().catch((error) => {
  console.error(error);
  process.exit(1);
});
