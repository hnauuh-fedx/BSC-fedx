const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Exercise real page rendering at different scroll positions and editor zoom levels.
async function main() {
  const { createServer } = await import('vite');
  const root = path.resolve(__dirname, '..');
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const baseUrl = server.resolvedUrls.local[0];
    const output = path.resolve(root, '../../test-results/minutes-pdf');
    await fs.mkdir(output, { recursive: true });

    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor });
      try {
        const page = await context.newPage();
        const baselines = new Map();
        const scenarios = [
          { scroll: 0, zoom: 1 }, { scroll: 5, zoom: 1 },
          { scroll: 500, zoom: 1 },
          { scroll: 0, zoom: 0.8 }, { scroll: 500, zoom: 0.8 },
          { scroll: 0, zoom: 1.25 }, { scroll: 500, zoom: 1.25 },
          ...(deviceScaleFactor === 1 ? [{ scroll: 500, zoom: 1.25, count: 45 }, { scroll: 500, zoom: 0.8, long: true }] : []),
        ];
        for (const { scroll, zoom, count = 25, long = false } of scenarios) {
          const url = new URL('test/fixtures/minutes-pdf.html', baseUrl);
          url.searchParams.set('rows', count);
          if (long) url.searchParams.set('long', '1');
          await page.goto(url.href);
          await page.waitForSelector('.minutes-print-document', { state: 'attached' });
          await page.evaluate(({ scroll, zoom }) => {
            document.body.style.zoom = String(zoom);
            window.pdfPageImages = [];
            // Each employee gets a unique text color so a split or lost row is detectable.
            const rows = document.querySelectorAll('.minutes-print-table tbody tr:not(.minutes-print-group)');
            rows.forEach((row, i) => row.querySelectorAll('td').forEach((cell) => cell.style.setProperty('color', `rgb(${100 + i * 3},0,0)`, 'important')));
            window.scrollTo(0, scroll);
            const original = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function (...args) {
              const pixels = this.getContext('2d').getImageData(0, 0, this.width, this.height).data;
              const rowPixels = Array(rows.length).fill(0);
              for (let i = 0; i < pixels.length; i += 4) {
                const row = (pixels[i] - 100) / 3;
                if (pixels[i + 1] === 0 && pixels[i + 2] === 0 && Number.isInteger(row) && row >= 0 && row < rows.length) {
                  rowPixels[row]++;
                }
              }
              const data = original.apply(this, args);
              window.pdfPageImages.push({ data, rowPixels });
              return data;
            };
          }, { scroll, zoom });

          const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.exportTestMinutes())]);
          const name = `dpr-${deviceScaleFactor}-scroll-${scroll}-zoom-${zoom}-rows-${count}${long ? '-long' : ''}`;
          await download.saveAs(path.join(output, `${name}.pdf`));
          const images = await page.evaluate(() => window.pdfPageImages);
          for (let i = 0; i < images.length; i++) {
            await fs.writeFile(path.join(output, `${name}-page-${i + 1}.png`), Buffer.from(images[i].data.split(',')[1], 'base64'));
          }
          for (let row = 0; row < count; row++) {
            assert.equal(images.filter((image) => image.rowPixels[row] > 0).length, 1, `${name}: employee row ${row + 1} is split, duplicated or missing`);
          }
          const hashes = images.map((image) => createHash('sha256').update(image.data).digest('hex'));
          const key = `${zoom}:${count}:${long}`;
          if (!baselines.has(key)) baselines.set(key, hashes);
          assert.deepEqual(hashes, baselines.get(key), `${name}: scrolling changed the PDF page pixels`);
          assert.equal(await page.evaluate(() => window.scrollY), scroll, 'Export must preserve the editor scroll position');
          console.log(`PASS ${name}: ${images.length} pages; every employee appears whole on one page.`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
