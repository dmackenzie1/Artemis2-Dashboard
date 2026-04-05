const { mkdir } = require('node:fs/promises');
const { dirname } = require('node:path');
const { chromium } = require('playwright');

const DEFAULT_URL = 'http://localhost:8080';
const DEFAULT_OUTPUT = 'artifacts/client-screenshot.png';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {
    url: DEFAULT_URL,
    output: DEFAULT_OUTPUT,
    timeoutMs: 120_000,
    retries: 8,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--url' && args[index + 1]) {
      config.url = args[index + 1];
      index += 1;
      continue;
    }

    if (current === '--output' && args[index + 1]) {
      config.output = args[index + 1];
      index += 1;
      continue;
    }

    if (current === '--timeout-ms' && args[index + 1]) {
      config.timeoutMs = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (current === '--retries' && args[index + 1]) {
      config.retries = Number(args[index + 1]);
      index += 1;
    }
  }

  return config;
};

const wait = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const waitForApp = async (url, retries) => {
  let attempt = 0;

  while (attempt < retries) {
    try {
      const response = await fetch(url, { redirect: 'manual' });

      if (response.ok || response.status === 304) {
        return;
      }
    } catch {
      // Retry until app is available.
    }

    attempt += 1;
    await wait(2_500);
  }

  throw new Error(`Unable to reach ${url} after ${retries} attempts`);
};

const captureScreenshot = async () => {
  const { output, retries, timeoutMs, url } = parseArgs();

  await waitForApp(url, retries);
  await mkdir(dirname(output), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    });

    await page.waitForLoadState('networkidle', { timeout: timeoutMs });

    await page.screenshot({
      fullPage: true,
      path: output,
    });
  } finally {
    await browser.close();
  }
};

captureScreenshot().catch((error) => {
  console.error(error);
  process.exit(1);
});
