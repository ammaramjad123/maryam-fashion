import puppeteer from 'puppeteer';

// One shared headless browser, launched lazily and reused across requests.
let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

/**
 * Render a report to PDF by loading its /print page in headless Chrome and
 * printing it — the SAME page and the SAME @media print CSS Ctrl+P uses. The
 * report's own <PageSize> @page rule drives orientation (preferCSSPageSize).
 *
 * @param {string} baseUrl   origin serving the client (derived from the request)
 * @param {string} printPath e.g. '/print/daily-sale?date=2025-07-24'
 * @param {string} token     JWT injected into localStorage so the page authes
 */
export async function renderReportPdf({ baseUrl, printPath, token }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    if (token) {
      // Runs in the browser page context (before its scripts) so the client's
      // apiFetch finds the token. globalThis.localStorage keeps ESLint (Node) happy.
      await page.evaluateOnNewDocument((t) => {
        try {
          globalThis.localStorage.setItem('auth_token', t);
        } catch {
          // storage unavailable — the page will surface an auth error
        }
      }, token);
    }

    await page.goto(`${baseUrl}${printPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    // Wait until the report has fetched its data and rendered.
    await page.waitForSelector('[data-report-ready="true"]', { timeout: 20000 });

    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await page.close();
  }
}
