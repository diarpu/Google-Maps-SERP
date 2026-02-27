# Changelog

All notable changes to this project will be documented in this file.

## [1.6.0] - 2026-02-27

### Grid Status Enhancements Release

#### Added
- **Interactive Grid Status List:** The Grid Status tab now displays a lightweight interactive MiniMap for each row, avoiding performance issues for large grids.
- **Address Resolution:** Added reverse geocoding to automatically resolve grid anchor coordinates into full, readable street addresses using OpenStreetMap.
- **Enlarged Map View:** Clicking the enlarge icon on any row's MiniMap opens a full-screen interactive modal for precise spatial inspection of that specific coordinate.

#### Changed
- Removed character limits and truncation from the street address display so the full location context is fully visible.

---

## [1.5.0] - 2026-02-27

### Timeline, History & One-Click Update Release

#### Added
- **Scan Timeline:** Scan detail page now shows a horizontal timeline bar to switch between previous runs. Only visible when a scan has 2+ runs (scheduled repeats or manual reruns).
- **Run History Preservation:** Re-running a scan no longer deletes old results. Each execution gets a unique `runId` — all history is preserved in the database.
- **Scheduled Scan Info in Header:** Scheduled scans now display frequency badge (DAILY/WEEKLY), next run countdown, and a "Cancel Schedule" button directly in the scan report header.
- **One-Click App Update:** The update notification banner now has a "Get Update" button that runs `git pull → pnpm install → prisma db push` in the background and shows a live terminal log — no command line needed.
- **Cancel Schedule Endpoint:** `POST /api/scans/[id]/cancel-schedule` sets frequency to ONCE and clears nextRun.
- **Dynamic Version Check:** `GET /api/system/update` returns the local `package.json` version so the update banner always shows the correct current version.

#### Fixed
- **Update Banner Always Showing:** `CURRENT_VERSION` was hardcoded to `1.2.0` in the component — now fetched dynamically from the server, so it only shows when there is actually a newer version on GitHub.
- **Map Auto-Pan on Pin Click:** Prior fix using `requestAnimationFrame` + `map.setView` to freeze position was reinforced with `bubblingMouseEvents={false}`.

---

## [1.4.0] - 2026-02-27

### Scanner Accuracy & CID Matching Release

This release fixes critical accuracy issues in the scanner — businesses are now matched by their unique CID/Place ID instead of loose name matching, and zip code lookups are geographically precise.

#### Fixed
- **Critical: PlaceId Never Saved** — `api/scans/route.ts` used `(req as any).placeId` instead of the destructured `placeId` variable, meaning the Place ID was **never persisted** to the database. Every scan fell back to name matching.
- **CID Format Mismatch** — Business lookup extracted CID as hex while the scraper converted to decimal. These never matched. Both now use consistent decimal format.
- **False Positive Name Matching** — Removed the 80% token overlap matching that caused unrelated businesses sharing common words (e.g., "Cash For Junk Cars Arizona" matching "Cash For Junk Scrap Cars") to show as found. Now requires exact match or 10+ character substring containment.
- **Zip Code Search Returning Wrong Cities** — Postal lookup used substring matching (`pnLower.includes(cityLower)`) which matched "Chicago Park, CA" for a "Chicago" search. Now uses strict exact-match and bounding-box-first strategy.
- **Map Auto-Pan on Pin Click** — Clicking a pin no longer moves or zooms the map. View position is frozen using save/restore with `requestAnimationFrame`.

#### Added
- **CID-First Matching** — Scanner now matches businesses in priority order: CID → PlaceID → Cross-check → Strict name match. This eliminates false positives.
- **Auto-Save CID** — On first name-based match, the CID is automatically saved to the scan record so all subsequent grid points use CID matching.
- **Numbered Map Markers** — Grid points now display the actual rank number (1-20) inside each marker. Colors: green (1-3), orange (4-10), red (11-20), dark gray with ✕ (not found).
- **Radius-Based Postal Lookup** — Added Haversine-based radius search as a fallback for zip code lookups when bounding box returns too few results.
- **Updated Map Legend** — Legend now shows numbered examples for each rank tier and includes the "Not Found" state.

#### Changed
- **Zip Code Strategy Reversed** — Bounding box is now the primary lookup (geographically exact), with radius and name-match as fallbacks. Previously name-match was primary, causing cross-state false positives.
- **Lookup CID Extraction** — Both URL imports and search results now extract CID as decimal and include ChIJ Place ID when available.

---

## [1.3.0] - 2026-02-12

### Review Intel & Deep Scraping Release

This release transforms the Review Intelligence module with deep scraping capabilities, source attribution for every insight, and robust handling for large business profiles (1000+ reviews).

#### Added
- **Source Attribution:** Every insight (Strengths, Weaknesses, Sentiments, Themes) now includes an expandable "Source Reviews" section showing the exact reviews that generated the finding.
- **Deep Scraping for Large Businesses:** Completely rewritten scraper logic to handle businesses with 1700+ reviews. Includes robust retry logic, "Load More" handling, and unique ID tracking.
- **CSV Export:** Added ability to export all review data and computed metrics to a formatted CSV file.
- **Client-Side Local Guide Fallback:** Ensures Local Guide distribution graphs render even if API data is incomplete, by computing from the review list on the fly.

#### Fixed
- **"Zero Reviews" Bug:** Fixed a critical issue where looking up businesses would sometimes return 0 reviews due to DOM selector changes or timing issues.
- **Duplicate Reviews:** Implemented a multi-layer deduplication strategy (Strict ID matching + Nested element filtering) to eliminate duplicate reviews caused by Google's nested DOM structure.
- **Preview Count Accuracy:** Fixed a regex bug in the preview route where ratings (e.g., "4.3") were sometimes misread as review counts (e.g., "43").

---
## [1.2.0] - 2026-02-11

### Place ID & Automation Release

This release introduces precision business tracking using Google Place IDs and significantly improves the installation/update experience.

#### Added
- **Place ID Tracking:** Businesses are now tracked via their unique Google Place ID (`pid`) and CID (`cid`) instead of name matching. This eliminates hallucinations and ensures 100% accurate tracking even if business names change.
- **Improved Browser Isolation:** Implemented stricter "clean slate" logic for every scan point, including randomized User-Agents and canvas noise to prevent fingerprinting.
- **One-Click Installation:** Installers for macOS and Windows now automatically create the `.env` file with default configurations. No manual setup required.
- **One-Click Updates:** Added `update_mac.sh` and `update_windows.bat` to automate pulling latest code, updating dependencies, and rebuilding the app.

#### Changed
- **Scan Creation:** "My Business" mode now captures Place ID from Google Maps URLs or search results.
- **Business Cards:** Now display Place ID and CID in the expanded view for verification.

---

## [1.1.0] - 2026-02-10

### Comprehensive Audit & Accuracy Release

This release focuses on a deep audit of the application's core logic, significantly improving scanning accuracy, data reliability, and user experience.

#### Added
- **Isolated Browser Contexts:** Each grid point now runs in a fresh browser context to prevent Google's personalization from skewing results.
- **Improved Scraper Logic:** Added intelligent scrolling to ensure all 20 local pack results are captured reliably.
- **Enhanced Accuracy Headers:** Implemented `DNT` and `Sec-GPC` headers to further reduce search personalization.
- **Normalized Business Matching:** Replaced naive substring matching with a robust normalization algorithm (strips LLC/Inc suffixes, punctuation, etc.) for precise target business detection.
- **Real-time Dashboard Stats:** Dashboard now pulls actual data from the database (completed/active scans) instead of placeholder values.
- **Click-outside Dismiss:** Business lookup search dropdown now automatically dismisses when clicking elsewhere.

#### Changed
- **Scanner Zoom Level:** Increased to `15z` for better local-pack relevance at each grid point.
- **Competitor Intelligence Calculation:** Fixed a critical bug where review metrics were double-counted per-appearance. Statistics now correctly reflect unique businesses.
- **Strategic Analysis Refinement:** Threat score calculation denominator fixed to use total appearances instead of grid points.
- **UI Tab Fix:** Categories data now correctly renders under the "Categories" tab in the Competitor Intelligence dashboard.
- **openNow logic:** Refined to prevent false-positives for closed businesses (e.g., "Opens at 9 AM").

#### Fixed
- **Profile Metrics Typo:** Fixed `servicAreaBusinesses` typo throughout the codebase.
- **Strategic Analysis Styling:** Removed hacky string manipulation for threat level colors; implemented a type-safe hex color mapping.

#### Security
- **PATCH Endpoint Hardening:** Added field whitelisting to the scan update API to prevent arbitrary field modification.

---
