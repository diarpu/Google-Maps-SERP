import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger } from './logger';

export interface ScrapedReview {
    reviewId?: string;
    reviewerName: string;
    reviewerUrl?: string;
    reviewImage?: string;
    reviewCount?: number;
    photoCount?: number;
    rating: number;
    text?: string;
    publishedDate?: string;
    responseText?: string;
    responseDate?: string;
}

export interface ScrapedBusinessInfo {
    name: string;
    averageRating: number;
    totalReviews: number;
    placeId?: string;
}

/**
 * Scrapes all Google reviews for a business from its Google Maps URL.
 * 
 * CRITICAL: Google Maps is an SPA that never fires standard 'load' or 
 * 'domcontentloaded' events. We use fire-and-forget goto() and wait 
 * for specific content selectors instead.
 */
export async function scrapeGoogleReviews(
    businessUrl: string,
    onProgress?: (msg: string) => void
): Promise<{ business: ScrapedBusinessInfo; reviews: ScrapedReview[] }> {
    let browser: Browser | null = null;

    const log = (msg: string) => {
        onProgress?.(msg);
        logger.info(msg, 'REVIEW_SCRAPER');
    };

    try {
        log('Launching browser...');
        browser = await chromium.launch({ headless: true });

        const context = await browser.newContext({
            viewport: { width: 1400, height: 900 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            locale: 'en-US',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
            },
            serviceWorkers: 'block',
        });

        // Pre-seed consent cookies to bypass Google consent screen
        await context.addCookies([
            { name: 'CONSENT', value: 'PENDING+987', domain: '.google.com', path: '/' },
            { name: 'SOCS', value: 'CAISHAgBEhJnd3NfMjAyMzA4MTUtMF9SQzIaAmVuIAEaBgiA_bSmBg', domain: '.google.com', path: '/' },
        ]);

        const page = await context.newPage();

        // Clean query params but DO NOT modify the data path
        // (stripping !9m1!1b1 etc breaks Google's data structure)
        let targetUrl = businessUrl;
        try {
            const parsed = new URL(businessUrl);
            parsed.searchParams.set('hl', 'en');
            parsed.searchParams.set('gl', 'us');
            parsed.searchParams.delete('entry');
            parsed.searchParams.delete('g_ep');
            targetUrl = parsed.toString();
        } catch { /* use original */ }

        // Retry wrapper — attempt up to 3 times with full re-navigation
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) {
                    log(`Retry attempt ${attempt}/3...`);
                    await page.waitForTimeout(3000);
                }

                log('Navigating to business page...');

                // FIRE-AND-FORGET: Google Maps never fires load/domcontentloaded 
                page.goto(targetUrl).catch(() => { });

                // Wait for business content to appear
                log('Waiting for business panel to render...');
                try {
                    await page.waitForSelector('h1.DUwDvf, div.fontDisplayLarge, div[data-review-id], tr.BHOKXe', { timeout: 20000 });
                } catch {
                    log('Selectors not found — waiting longer...');
                }

                // Extra wait for SPA to fully hydrate
                await page.waitForTimeout(5000);

                // Handle consent dialog if it appears
                try {
                    const consentBtn = page.locator('button[aria-label="Accept all"], form[action*="consent"] button:last-child');
                    if (await consentBtn.first().isVisible({ timeout: 2000 })) {
                        await consentBtn.first().click();
                        await page.waitForTimeout(3000);
                    }
                } catch { /* no consent needed */ }

                // Extract business info
                log('Extracting business info...');
                let business = await extractBusinessInfo(page);
                log(`Found: "${business.name}", ${business.averageRating}★, ${business.totalReviews} reviews`);

                // If totalReviews is 0, try harder
                if (business.totalReviews === 0) {
                    log('⚠️ totalReviews is 0 — waiting for full render...');
                    await page.waitForTimeout(5000);
                    business = await extractBusinessInfo(page);
                    log(`Re-extracted: "${business.name}", ${business.averageRating}★, ${business.totalReviews} reviews`);
                }

                // Ensure we're on the Reviews tab for scraping
                log('Opening reviews tab...');
                await openReviewsTab(page);

                // Wait for review elements to appear after clicking the tab
                log('Waiting for review elements to load...');
                try {
                    await page.waitForSelector('div[data-review-id], div.jftiEf', { timeout: 15000 });
                    log('Review elements detected.');
                } catch {
                    log('Review elements not found via waitForSelector — trying extra wait...');
                    await page.waitForTimeout(5000);
                }

                // Sort by newest to get chronological data
                log('Sorting reviews by newest...');
                await sortReviewsByNewest(page);

                // Verify we can see review elements
                await page.waitForTimeout(2000);
                const initialCount = await page.evaluate(() => {
                    const withId = document.querySelectorAll('div[data-review-id]');
                    if (withId.length > 0) {
                        const uniqueIds = new Set<string>();
                        withId.forEach(el => {
                            const id = el.getAttribute('data-review-id');
                            if (id) uniqueIds.add(id);
                        });
                        return uniqueIds.size;
                    }
                    return document.querySelectorAll('div.jftiEf, div.jJc9Ad').length;
                });
                log(`Review elements visible: ${initialCount}`);

                if (initialCount === 0) {
                    const debugInfo = await page.evaluate(() => ({
                        title: document.title,
                        h1: document.querySelector('h1')?.textContent || 'none',
                        bodyLen: document.body?.innerHTML?.length || 0,
                        tabCount: document.querySelectorAll('button[role="tab"]').length,
                        scrollContainer: !!document.querySelector('div.m6QErb'),
                    }));
                    log(`Debug: title="${debugInfo.title}", h1="${debugInfo.h1}", bodyLen=${debugInfo.bodyLen}, tabs=${debugInfo.tabCount}, scrollContainer=${debugInfo.scrollContainer}`);
                    throw new Error(`No review elements found (attempt ${attempt})`);
                }

                // Scroll and collect all reviews
                const target = business.totalReviews || 100;
                log(`Scrolling to load all ${target} reviews (this may take a while)...`);
                const reviews = await scrollAndCollectReviews(page, target, log);

                if (reviews.length === 0) {
                    throw new Error('Scraped 0 reviews — DOM selectors may have changed');
                }

                log(`✅ Successfully scraped ${reviews.length} reviews for "${business.name}"`);
                return { business, reviews };

            } catch (err: any) {
                lastError = err;
                log(`Attempt ${attempt} failed: ${err.message}`);
                if (attempt >= 3) break;
            }
        }

        throw lastError || new Error('Failed to scrape reviews after retries');

    } finally {
        if (browser) await browser.close();
    }
}

async function extractBusinessInfo(page: Page): Promise<ScrapedBusinessInfo> {
    return await page.evaluate(() => {
        // ---- Business Name (multiple fallbacks) ----
        let name = '';
        const nameEl = document.querySelector('h1.DUwDvf') ||
            document.querySelector('div.tAiQdd h1') ||
            document.querySelector('h1');
        if (nameEl) {
            name = nameEl.textContent?.trim() || '';
        }
        // Fallback: parse from page title "Business Name - Google Maps"
        if (!name) {
            const titleMatch = document.title.match(/^(.+?)\s*[-–]\s*Google Maps/);
            if (titleMatch) name = titleMatch[1].trim();
        }
        if (!name) name = 'Unknown Business';

        // ---- Rating ----
        let averageRating = 0;
        const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]') ||
            document.querySelector('span.ceNzKf') ||
            document.querySelector('div.fontDisplayLarge');
        if (ratingEl) {
            averageRating = parseFloat(ratingEl.textContent?.replace(',', '.') || '0');
        }
        // Fallback: search body text
        if (averageRating === 0) {
            const bodyText = document.body?.innerText || '';
            const m = bodyText.match(/(\d\.\d)\s*(?:\([\d,]+\)|reviews)/i);
            if (m) averageRating = parseFloat(m[1]);
        }

        // ---- Total Reviews (3 approaches) ----
        let totalReviews = 0;

        // Approach 1: Sum from rating bar rows (tr.BHOKXe) — MOST RELIABLE
        // Works on both Overview and Reviews tabs
        // e.g. "5 stars, 1,208 reviews"
        const rows = document.querySelectorAll('tr.BHOKXe[aria-label]');
        if (rows.length > 0) {
            let sum = 0;
            rows.forEach(row => {
                const label = row.getAttribute('aria-label') || '';
                const m = label.match(/([\d,]+)\s*review/i);
                if (m) sum += parseInt(m[1].replace(/[^\d]/g, ''));
            });
            if (sum > 0) totalReviews = sum;
        }

        // Approach 2: div.F7nice parenthesized count "(1,799)"
        if (totalReviews === 0) {
            const f7nice = document.querySelector('div.F7nice');
            if (f7nice) {
                const txt = f7nice.textContent || '';
                const m = txt.match(/\(([\d,.\s]+)\)/);
                if (m) {
                    const num = parseInt(m[1].replace(/[^\d]/g, ''));
                    if (num > 0 && num < 1000000) totalReviews = num;
                }
            }
        }

        // Approach 3: Body text search "1,799 reviews"  
        if (totalReviews === 0) {
            const bodyText = document.body?.innerText || '';
            const m = bodyText.match(/([\d,]+)\s+reviews/i);
            if (m) {
                const num = parseInt(m[1].replace(/[^\d]/g, ''));
                if (num > 10 && num < 1000000) totalReviews = num;
            }
        }

        // ---- Place ID from URL ----
        let placeId = '';
        const placeMatch = window.location.href.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
        if (placeMatch) placeId = placeMatch[1];
        const cidMatch = window.location.href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/);
        if (!placeId && cidMatch) placeId = cidMatch[1];

        return { name, averageRating, totalReviews, placeId: placeId || undefined };
    });
}

async function openReviewsTab(page: Page): Promise<void> {
    // Try clicking the reviews tab button — multiple approaches
    try {
        const reviewTab = page.locator('button[aria-label*="Reviews"], button[aria-label*="reviews"], button[data-tab-id="reviews"]');
        if (await reviewTab.first().isVisible({ timeout: 3000 })) {
            await reviewTab.first().click();
            await page.waitForTimeout(2000);
            return;
        }
    } catch { /* fallback below */ }

    // Fallback 1: Try all tab buttons and find one with "review" text
    try {
        const tabs = page.locator('button[role="tab"]');
        const count = await tabs.count();
        for (let i = 0; i < count; i++) {
            const text = await tabs.nth(i).textContent() || '';
            const label = await tabs.nth(i).getAttribute('aria-label') || '';
            if (text.toLowerCase().includes('review') || label.toLowerCase().includes('review')) {
                await tabs.nth(i).click();
                await page.waitForTimeout(2000);
                return;
            }
        }
        // If no match found, just click the 2nd or 3rd tab
        if (count >= 2) {
            await tabs.nth(count >= 3 ? 2 : 1).click();
            await page.waitForTimeout(2000);
            return;
        }
    } catch { /* fallback below */ }

    // Fallback 2: click on the review count text
    try {
        const reviewLink = page.locator('span[aria-label*="review"], span[aria-label*="Review"]').first();
        if (await reviewLink.isVisible({ timeout: 3000 })) {
            await reviewLink.click();
            await page.waitForTimeout(2000);
        }
    } catch { /* reviews may already be visible */ }
}

async function sortReviewsByNewest(page: Page): Promise<void> {
    try {
        // Click the sort button
        const sortBtn = page.locator('button[aria-label="Sort reviews"], button[data-value="Sort"]');
        if (await sortBtn.first().isVisible({ timeout: 5000 })) {
            await sortBtn.first().click();
            await page.waitForTimeout(1000);

            // Click "Newest"
            const newestOption = page.locator('div[role="menuitemradio"]:has-text("Newest"), li[data-index="1"]');
            if (await newestOption.first().isVisible({ timeout: 3000 })) {
                await newestOption.first().click();
                await page.waitForTimeout(2000);
            }
        }
    } catch {
        // Continue without sorting — default "Most Relevant" is still usable
    }
}

async function scrollAndCollectReviews(
    page: Page,
    expectedTotal: number,
    log: (msg: string) => void
): Promise<ScrapedReview[]> {
    const maxScrollAttempts = Math.min(expectedTotal * 6, 8000);
    let lastCount = 0;
    let noNewReviewsCount = 0;
    const startTime = Date.now();
    const GLOBAL_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes max for very large businesses
    let lastLoggedCount = 0;

    /**
     * Adaptive delay that scales with how many reviews are loaded.
     * Google Maps throttles aggressively above ~300 reviews.
     * We add random jitter (±500ms) to appear human.
     */
    const getScrollDelay = (loaded: number): number => {
        let base: number;
        if (loaded < 100) base = 1500;
        else if (loaded < 300) base = 2000;
        else if (loaded < 500) base = 2500;
        else if (loaded < 1000) base = 3000;
        else base = 3500;
        // Add random jitter ±500ms
        return base + Math.floor(Math.random() * 1000) - 500;
    };

    /**
     * Random incremental scroll distance (1000—2000px).
     * Larger steps are needed to trigger Google's lazy loader reliably.
     */
    const getScrollDistance = (): number => {
        return 1000 + Math.floor(Math.random() * 1000);
    };

    // Count unique review IDs currently in the DOM
    const countReviewsInDOM = async (): Promise<number> => {
        return page.evaluate(() => {
            const withId = document.querySelectorAll('div[data-review-id]');
            if (withId.length > 0) {
                const uniqueIds = new Set<string>();
                withId.forEach(el => {
                    const id = el.getAttribute('data-review-id');
                    if (id) uniqueIds.add(id);
                });
                return uniqueIds.size;
            }
            return document.querySelectorAll('div.jftiEf, div.jJc9Ad').length;
        });
    };

    // Expand all truncated review text ("More" buttons)
    const expandReviewText = async () => {
        await page.evaluate(() => {
            // Multiple selector patterns for the "More"/"See more" button
            const selectors = [
                'button.w8nwRe.kyuRq',
                'button.w8nwRe',
                'span.w8nwRe',
            ];
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(btn => {
                    const text = btn.textContent?.trim().toLowerCase() || '';
                    if (text.includes('more') || text.includes('see more')) {
                        (btn as HTMLElement).click();
                    }
                });
            }
        });
    };

    // Find the scrollable reviews container — try multiple selectors dynamically
    const findScrollContainer = async (): Promise<string> => {
        const found = await page.evaluate(() => {
            // Priority: most specific to least specific
            const candidates = [
                'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
                'div.m6QErb.DxyBCb',
                'div.m6QErb',
            ];
            for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (el && el.scrollHeight > el.clientHeight) return sel;
            }
            // Fallback: find any scrollable container near reviews
            const reviewEl = document.querySelector('div[data-review-id]');
            if (reviewEl) {
                let parent = reviewEl.parentElement;
                for (let i = 0; i < 10 && parent; i++) {
                    if (parent.scrollHeight > parent.clientHeight + 100) {
                        // Tag it with an ID for reuse
                        parent.id = parent.id || '__review_scroll_container';
                        return `#${parent.id}`;
                    }
                    parent = parent.parentElement;
                }
            }
            return 'div.m6QErb.DxyBCb';
        });
        return found;
    };

    for (let i = 0; i < maxScrollAttempts; i++) {
        // ── Global timeout safety net ──
        if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
            log(`⚠️ Global timeout reached (45 min). Stopping at ${lastCount} reviews.`);
            break;
        }

        const scrollContainerSelector = await findScrollContainer();

        // ── Incremental scroll (primary strategy) ──
        // Every 5th scroll, do a full scroll-to-bottom to catch up;
        // otherwise, scroll incrementally to trigger lazy loading.
        const scrollDist = getScrollDistance();
        if (i % 5 === 4) {
            // Full scroll-to-bottom (catch-up)
            await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (el) el.scrollTop = el.scrollHeight;
            }, scrollContainerSelector);
        } else {
            // Incremental scroll — this is what triggers Google's lazy loader
            await page.evaluate(({ selector, dist }) => {
                const el = document.querySelector(selector);
                if (el) el.scrollTop += dist;
            }, { selector: scrollContainerSelector, dist: scrollDist });
        }

        // ── Wait for network + rendering ──
        // First, wait for network to idle (XHR review fetches to complete)
        try {
            await page.waitForLoadState('networkidle', { timeout: 3000 });
        } catch { /* timeout is fine — just means network is still busy */ }

        // Then apply the adaptive delay for DOM rendering
        await page.waitForTimeout(getScrollDelay(lastCount));

        // ── Expand "More" buttons every 5 scrolls ──
        if (i % 5 === 0) {
            await expandReviewText();
        }

        // ── Count current reviews ──
        const currentCount = await countReviewsInDOM();

        // ── Progress logging every 5 scrolls or when count changes significantly ──
        if (i % 5 === 0 || (currentCount - lastLoggedCount >= 20)) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const rate = elapsed > 0 ? Math.round((currentCount / elapsed) * 60) : 0;
            log(`📊 Loaded ${currentCount} / ~${expectedTotal} reviews (${elapsed}s elapsed, ~${rate} reviews/min)`);
            lastLoggedCount = currentCount;
        }

        // ── Stall detection and recovery ──
        if (currentCount === lastCount) {
            noNewReviewsCount++;

            // Phase 1 (after 5 stalls): Gentle jiggle — scroll up a bit, then back down
            if (noNewReviewsCount >= 5 && noNewReviewsCount < 15) {
                await page.evaluate(({ selector }) => {
                    const el = document.querySelector(selector);
                    if (el) {
                        // Scroll up by 30% of container height
                        const upBy = Math.floor(el.scrollHeight * 0.3);
                        el.scrollTop -= upBy;
                    }
                }, { selector: scrollContainerSelector });
                await page.waitForTimeout(2000);

                // Now scroll back to bottom incrementally
                for (let s = 0; s < 3; s++) {
                    await page.evaluate(({ selector, dist }) => {
                        const el = document.querySelector(selector);
                        if (el) el.scrollTop += dist;
                    }, { selector: scrollContainerSelector, dist: getScrollDistance() });
                    await page.waitForTimeout(1000);
                }
            }

            // Phase 2 (after 15 stalls): Full scroll-to-bottom + longer wait
            if (noNewReviewsCount >= 15 && noNewReviewsCount < 30) {
                await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) el.scrollTop = el.scrollHeight;
                }, scrollContainerSelector);
                await page.waitForTimeout(4000);

                // Try clicking load-more / pagination elements
                await page.evaluate(() => {
                    const loadMore = document.querySelector(
                        'button.HzLjNd, button[jsaction*="pane.review-list"], button[jsaction*="review.moreReviews"]'
                    );
                    if (loadMore) (loadMore as HTMLElement).click();
                });
                await page.waitForTimeout(3000);
            }

            // Phase 3 (every 30 stalls): Nuclear — re-sort to force Google to reload review data
            if (noNewReviewsCount > 0 && noNewReviewsCount % 30 === 0) {
                log(`⚙️ Stalled at ${currentCount}. Attempting sort-toggle recovery (#${Math.floor(noNewReviewsCount / 30)})...`);
                try {
                    // Click sort button
                    const sortBtn = page.locator('button[aria-label="Sort reviews"], button[data-value="Sort"]');
                    if (await sortBtn.first().isVisible({ timeout: 3000 })) {
                        await sortBtn.first().click();
                        await page.waitForTimeout(1500);

                        // Click "Most relevant" (index 0) to force reload
                        const relevantOption = page.locator('div[role="menuitemradio"]').first();
                        if (await relevantOption.isVisible({ timeout: 2000 })) {
                            await relevantOption.click();
                            await page.waitForTimeout(4000);
                        }

                        // Now switch back to "Newest"
                        await sortBtn.first().click();
                        await page.waitForTimeout(1500);
                        const newestOption = page.locator('div[role="menuitemradio"]:has-text("Newest"), li[data-index="1"]');
                        if (await newestOption.first().isVisible({ timeout: 2000 })) {
                            await newestOption.first().click();
                            await page.waitForTimeout(4000);
                        }
                    }
                } catch {
                    // Sort toggle failed — not critical, continue scrolling
                }

                // Also try a full scroll to top then back to bottom to shake things loose
                const scrollSel = await findScrollContainer();
                await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) el.scrollTop = 0;
                }, scrollSel);
                await page.waitForTimeout(2000);
                for (let s = 0; s < 5; s++) {
                    await page.evaluate(({ selector, dist }) => {
                        const el = document.querySelector(selector);
                        if (el) el.scrollTop += dist;
                    }, { selector: scrollSel, dist: getScrollDistance() });
                    await page.waitForTimeout(1500);
                }
            }

            // ── Final stall limit ──
            // Very high patience: 200 cycles for large businesses (1000+), 100 for medium, 60 for small
            let stallLimit: number;
            if (expectedTotal > 1000) stallLimit = 200;
            else if (expectedTotal > 500) stallLimit = 150;
            else if (expectedTotal > 200) stallLimit = 100;
            else stallLimit = 60;

            if (noNewReviewsCount > stallLimit) {
                const pct = expectedTotal > 0 ? Math.round((currentCount / expectedTotal) * 100) : 0;
                log(`⚠️ Stall limit reached (${noNewReviewsCount} cycles). Collected ${currentCount}/${expectedTotal} (${pct}%).`);
                break;
            }
        } else {
            noNewReviewsCount = 0;
        }
        lastCount = currentCount;

        // ── Completion check ──
        if (currentCount >= expectedTotal) {
            log(`✅ All ${currentCount} reviews loaded.`);
            break;
        }
    }

    // Now extract all reviews from the page
    log('Extracting review data from page...');
    const rawReviews = await page.evaluate(() => {
        // Step 1: Collect review elements — only outermost data-review-id to avoid nested dupes
        const withId = document.querySelectorAll('div[data-review-id]');
        let reviewElements: Element[];

        if (withId.length > 0) {
            const outermost: Element[] = [];
            const seenIds = new Set<string>();
            withId.forEach(el => {
                const id = el.getAttribute('data-review-id') || '';
                let parent = el.parentElement;
                let isNested = false;
                while (parent) {
                    if (parent.hasAttribute('data-review-id')) {
                        isNested = true;
                        break;
                    }
                    parent = parent.parentElement;
                }
                if (!isNested && id && !seenIds.has(id)) {
                    seenIds.add(id);
                    outermost.push(el);
                }
            });
            reviewElements = outermost;
        } else {
            const candidates = document.querySelectorAll('div.jftiEf, div.jJc9Ad');
            const filtered: Element[] = [];
            candidates.forEach(el => {
                let dominated = false;
                for (const other of filtered) {
                    if (other.contains(el) && other !== el) { dominated = true; break; }
                }
                if (!dominated) {
                    for (let j = filtered.length - 1; j >= 0; j--) {
                        if (el.contains(filtered[j]) && el !== filtered[j]) {
                            filtered.splice(j, 1);
                        }
                    }
                    filtered.push(el);
                }
            });
            reviewElements = filtered;
        }

        const results: any[] = [];

        reviewElements.forEach((el) => {
            try {
                const reviewId = el.getAttribute('data-review-id') || '';
                const nameEl = el.querySelector('div.d4r55, button.WEBjve div.d4r55');
                const reviewerName = nameEl?.textContent?.trim() || 'Anonymous';
                const profileLink = el.querySelector('button.WEBjve');
                const reviewerUrl = profileLink?.getAttribute('data-href') || '';

                let reviewImage = '';
                const imgBtn = el.querySelector('button.Tya61d');
                if (imgBtn) {
                    const style = imgBtn.getAttribute('style') || '';
                    const match = style.match(/url\("?([^")]+)"?\)/);
                    if (match) reviewImage = match[1];
                }

                let reviewCount = 0;
                let photoCount = 0;
                const subText = el.textContent || '';
                const rc = subText.match(/(\d+)\s*reviews?/i);
                if (rc) reviewCount = parseInt(rc[1]);
                const pc = subText.match(/(\d+)\s*photos?/i);
                if (pc) photoCount = parseInt(pc[1]);

                const ratingEl = el.querySelector('span.kvMYJc');
                const ratingAttr = ratingEl?.getAttribute('aria-label') || '';
                const ratingMatch = ratingAttr.match(/(\d)/);
                const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

                const textEl = el.querySelector('span.wiI7pd');
                const text = textEl?.textContent?.trim() || '';

                const dateEl = el.querySelector('span.rsqaWe');
                const publishedDate = dateEl?.textContent?.trim() || '';

                let responseText = '';
                let responseDate = '';
                const responseContainer = el.querySelector('div.CDe7pd');
                if (responseContainer) {
                    const respDateEl = responseContainer.querySelector('span.DZSIDd');
                    responseDate = respDateEl?.textContent?.trim() || '';
                    const respTextEl = responseContainer.querySelector('div.wiI7pd');
                    responseText = respTextEl?.textContent?.trim() || '';
                }

                if (rating > 0) {
                    results.push({
                        reviewId: reviewId || undefined,
                        reviewerName,
                        reviewerUrl: reviewerUrl || undefined,
                        reviewImage: reviewImage || undefined,
                        reviewCount: reviewCount || undefined,
                        photoCount: photoCount || undefined,
                        rating,
                        text: text || undefined,
                        publishedDate: publishedDate || undefined,
                        responseText: responseText || undefined,
                        responseDate: responseDate || undefined,
                    });
                }
            } catch (err) {
                // Skip malformed review elements
            }
        });

        return results;
    });

    // Post-extraction deduplication — only by reviewId
    const seen = new Set<string>();
    const dedupedReviews: ScrapedReview[] = [];

    for (const r of rawReviews) {
        if (r.reviewId) {
            const key = `id:${r.reviewId}`;
            if (!seen.has(key)) {
                seen.add(key);
                dedupedReviews.push(r as ScrapedReview);
            }
        } else {
            dedupedReviews.push(r as ScrapedReview);
        }
    }

    const dupeCount = rawReviews.length - dedupedReviews.length;
    if (dupeCount > 0) {
        log(`Removed ${dupeCount} duplicate reviews (${rawReviews.length} raw → ${dedupedReviews.length} unique)`);
    }

    return dedupedReviews;
}
