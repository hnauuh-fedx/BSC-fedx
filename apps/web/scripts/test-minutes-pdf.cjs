const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Read the actual downloaded PDF, not screenshots or colored-pixel approximations.
async function main() {
  const { createServer } = await import('vite');
  const root = path.resolve(__dirname, '..');
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const output = path.resolve(root, '../../test-results/minutes-pdf-vector');
    await fs.mkdir(output, { recursive: true });
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor });
      try {
        const page = await context.newPage();
        for (const scenario of [
          { scroll: 0, zoom: 1 }, { scroll: 500, zoom: 0.8 }, { scroll: 500, zoom: 1.25 },
          ...(deviceScaleFactor === 1 ? [{ scroll: 500, zoom: 1, count: 45 }, { scroll: 500, zoom: 1, long: true }] : []),
        ]) {
          const { scroll, zoom, count = 25, long = false } = scenario;
          const url = new URL('test/fixtures/minutes-pdf.html', server.resolvedUrls.local[0]);
          url.searchParams.set('rows', count);
          if (long) url.searchParams.set('long', '1');
          await page.goto(url.href);
          await page.waitForFunction(() => typeof window.exportTestMinutes === 'function');
          await page.evaluate(({ scroll, zoom }) => { document.body.style.zoom = String(zoom); window.scrollTo(0, scroll); }, { scroll, zoom });
          const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.exportTestMinutes())]);
          const name = `dpr-${deviceScaleFactor}-zoom-${zoom}-rows-${count}${long ? '-long' : ''}`;
          const file = path.join(output, `${name}.pdf`);
          await download.saveAs(file);
          const pages = await page.evaluate(({ bytes, render }) => window.readSavedPdf(bytes, render), {
            bytes: [...await fs.readFile(file)], render: deviceScaleFactor === 1 && zoom === 1,
          });
          const props = await page.evaluate(() => window.minutesTestProps);
          await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(pages.map(({ image, ...page }) => page), null, 2));
          for (let i = 0; i < pages.length; i++) {
            if (pages[i].image) await fs.writeFile(path.join(output, `${name}-page-${i + 1}.png`), Buffer.from(pages[i].image.split(',')[1], 'base64'));
          }
          const normalize = (value) => value.replace(/\s+/g, ' ').trim();
          const texts = pages.map((page) => normalize(page.items.map((item) => item.text).join(' ')));
          const bodyFont = pages.flatMap((page) => page.items).find((item) => item.text === props.rows[0].employeeName).fontName;
          const columnText = (page, millimeters) => normalize(page.items
            .filter((item) => item.fontName === bodyFont && Math.abs(item.x - millimeters * 72 / 25.4) < 0.3)
            .map((item) => item.text).join(' '));
          const namesByPage = pages.map((page) => columnText(page, 30.55));
          const noteText = pages.map((page) => columnText(page, 143.6)).join(' ');
          assert.ok(pages.length > 1, 'Fixture must cross a page boundary');
          const allText = texts.join(' ');
          for (const row of props.rows) {
            const matches = namesByPage.map((text, index) => ({ text, index })).filter(({ text }) => text.includes(row.employeeName));
            assert.equal(matches.length, 1, `${name}: employee name missing or split: ${row.employeeName}`);
            assert.equal(namesByPage.join(' ').split(row.employeeName).length - 1, 1, `${name}: duplicate employee name: ${row.employeeName}`);
            assert.ok(texts[matches[0].index].includes('Họ và tên'), `${name}: missing repeated table header`);
            if (row.explanation) {
              const expected = normalize(row.explanation);
              let difference = 0;
              while (difference < expected.length && expected[difference] === noteText[difference]) difference++;
              assert.ok(noteText.includes(expected), `${name}: explanation text differs at ${difference}: expected ${expected.slice(difference, difference + 100)}, read ${noteText.slice(difference, difference + 100)}`);
            }
          }
          assert.ok(allText.includes(normalize(props.conclusion)), 'Conclusion must be complete');
          for (const savedPage of pages) {
            for (const item of savedPage.items.filter((item) => item.text.trim())) {
              assert.ok(item.x >= 55 && item.x + item.width <= savedPage.width - 55, `${name}: text outside horizontal margins`);
              assert.ok(item.baseline >= 55 && item.baseline + item.height <= savedPage.height - 55, `${name}: text outside vertical margins ${JSON.stringify(item)} pageHeight=${savedPage.height}`);
            }
          }
          assert.equal(await page.evaluate(() => window.scrollY), scroll, 'Export must preserve editor scroll');
          await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(pages, null, 2));
          console.log(`PASS ${name}: opened ${pages.length} saved PDF pages; all ${count} complete names, explanations, repeated headers and margins verified.`);
          if (deviceScaleFactor === 1 && count === 25 && !long && zoom === 1) {
            await page.emulateMedia({ media: 'print' });
            const nativeFile = path.join(output, 'native-print.pdf');
            await page.pdf({ path: nativeFile, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
            await page.emulateMedia({ media: 'screen' });
            const printed = await page.evaluate((bytes) => window.readSavedPdf(bytes, true), [...await fs.readFile(nativeFile)]);
            for (const row of props.rows) {
              const matches = printed.filter((sheet) => sheet.items.some((item) => item.text === row.employeeName));
              assert.equal(matches.length, 1, `Native print: missing or split employee ${row.employeeName}`);
              assert.ok(matches[0].items.some((item) => item.text === 'Họ và tên'), 'Native print: missing repeated header');
            }
            for (let i = 0; i < printed.length; i++) await fs.writeFile(path.join(output, `native-print-page-${i + 1}.png`), Buffer.from(printed[i].image.split(',')[1], 'base64'));
            console.log(`PASS native browser print: all ${count} names remain complete on ${printed.length} PDF pages.`);
          }
        }
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
