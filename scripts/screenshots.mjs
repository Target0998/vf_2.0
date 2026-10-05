// Full-page screenshots of the local site (desktop 1440 + mobile 390) for design review.
//   docker run --rm --network host -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.55.0-noble \
//     sh -c "npm i --no-save playwright@1.55.0 >/dev/null && node scripts/screenshots.mjs"
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://host.docker.internal:2368';
const OUT = process.env.OUT || 'screenshots';
const pages = { notfound: '/nincs-ilyen/', home: '/', naplo: '/naplo/', tag: '/tag/kozlemeny/', post: '/naplo/vilagithatunk-a-megmaradasunkert-kuzdunk/', tamogatas: '/tamogatas/', rolunk: '/rolunk/', koszonjuk: '/koszonjuk/?a=10000&f=monthly', tevekenysegunk: '/tevekenysegunk/', galeria: '/galeria/', kapcsolat: '/kapcsolat/', atlathatosag: '/atlathatosag/', adatvedelem: '/adatvedelem/', top: '/top-plusz/' };
const only = process.argv.slice(2);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [vp, size] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const [name, path] of Object.entries(pages)) {
        if (only.length && !only.includes(name)) continue;
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        // full-page shots never scroll, so lazy images below the fold would stay blank
        await page.evaluate(() => Promise.all([...document.images].map((img) => {
            img.loading = 'eager';
            return img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; });
        })));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await page.screenshot({ path: `${OUT}/${vp}-${name}.png`, fullPage: true });
        console.log(`${vp}-${name}.png${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ''}`);
    }
    await ctx.close();
}
await browser.close();
