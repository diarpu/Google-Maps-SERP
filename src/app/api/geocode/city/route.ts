import { NextResponse } from 'next/server';
import { findPostalCodesByCity, findPostalCodesInBbox, findPostalCodesInRadius, hasPostalData } from '@/lib/postalLookup';

/**
 * Smart City Grid API — Bulletproof Edition
 * 
 * ZIP CODES: Uses GeoNames offline data (1.8M+ postal codes, 121 countries)
 *   → Instant lookups, no API calls, always available
 *   
 * NEIGHBORHOODS: Uses Overpass API (OpenStreetMap suburbs/quarters)
 *   → Deep geographic data, global coverage
 *   → Falls back to bbox grid if Overpass fails
 */

interface GridPoint {
    lat: number;
    lng: number;
    name: string;
    id: string;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city');
    const state = searchParams.get('state');
    const country = searchParams.get('country');
    const type = searchParams.get('type') as 'zip' | 'neighborhood';

    if (!city || !type) {
        return NextResponse.json({ error: 'City and type are required' }, { status: 400 });
    }

    try {
        // ── Step 1: Geocode the city to get coordinates & bounding box ──
        const q = [city, state, country].filter(Boolean).join(', ');
        console.log(`[SmartGrid] Geocoding: "${q}" (type: ${type})`);

        const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
            {
                headers: { 'User-Agent': 'GeoRanker/2.0 (contact@georanker.app)' },
                signal: AbortSignal.timeout(15000),
            }
        );

        const nomData = await nomRes.json();
        if (!nomData || nomData.length === 0) {
            return NextResponse.json({ error: 'City not found. Try a different name or spelling.' }, { status: 404 });
        }

        const cityData = nomData[0];
        const osmId = cityData.osm_id;
        const osmType = cityData.osm_type;
        const bbox = cityData.boundingbox; // [south, north, west, east]
        const cityMeta = {
            name: cityData.display_name,
            lat: parseFloat(cityData.lat),
            lng: parseFloat(cityData.lon),
        };

        // Extract country code from address details
        const countryCode = cityData.address?.country_code?.toUpperCase() ||
            guessCountryCode(country || '');

        console.log(`[SmartGrid] Found: ${cityData.display_name} (${osmType} #${osmId}, CC=${countryCode})`);

        let points: GridPoint[] = [];

        if (type === 'zip') {
            points = await getZipCodePoints(countryCode, city, bbox, cityMeta.lat, cityMeta.lng);
        } else {
            points = await getNeighborhoodPoints(osmId, osmType, city, bbox);
        }

        // Final fallback: radial grid
        if (points.length === 0) {
            console.log(`[SmartGrid] All methods exhausted. Using radial grid.`);
            points = generateRadialGrid(cityMeta.lat, cityMeta.lng, city);
        }

        console.log(`[SmartGrid] Returning ${points.length} grid points for "${city}"`);
        return NextResponse.json({ points, cityMeta });

    } catch (error: any) {
        console.error('[SmartGrid] Error:', error.message || error);
        return NextResponse.json({ error: `Failed to generate smart grid: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
}


// ═══════════════════════════════════════════════════════
// ZIP CODES — GeoNames Offline Database (121 countries)
// ═══════════════════════════════════════════════════════

async function getZipCodePoints(
    countryCode: string,
    cityName: string,
    bbox: string[] | null,
    cityLat: number,
    cityLng: number
): Promise<GridPoint[]> {
    if (!countryCode || !hasPostalData(countryCode)) {
        console.log(`[SmartGrid] No postal data for country "${countryCode}"`);
        if (bbox) return generateBboxGrid(bbox, 'zip', cityName);
        return [];
    }

    let results: { postalCode: string; placeName: string; lat: number; lng: number }[] = [];

    // ── PRIMARY: Bounding box lookup (geographically exact) ──
    if (bbox) {
        const south = parseFloat(bbox[0]);
        const north = parseFloat(bbox[1]);
        const west = parseFloat(bbox[2]);
        const east = parseFloat(bbox[3]);
        results = findPostalCodesInBbox(countryCode, south, north, west, east);
        console.log(`[SmartGrid] Bbox lookup: ${results.length} postal codes within city boundary`);
    }

    // ── FALLBACK 1: Radius search (if bbox returned too few) ──
    if (results.length < 3) {
        console.log(`[SmartGrid] Bbox returned ${results.length}. Trying 25km radius from city center...`);
        const radiusResults = findPostalCodesInRadius(countryCode, cityLat, cityLng, 25);
        console.log(`[SmartGrid] Radius lookup: ${radiusResults.length} postal codes`);
        if (radiusResults.length > results.length) {
            results = radiusResults;
        }
    }

    // ── FALLBACK 2: Exact city name match ──
    if (results.length < 3) {
        console.log(`[SmartGrid] Still few results. Trying exact name match for "${cityName}"...`);
        const nameResults = findPostalCodesByCity(countryCode, cityName);
        console.log(`[SmartGrid] Exact name match: ${nameResults.length} postal codes`);
        if (nameResults.length > results.length) {
            results = nameResults;
        }
    }

    // Convert to grid points
    let points = results.map((r, i) => ({
        lat: r.lat,
        lng: r.lng,
        name: `${r.postalCode} — ${r.placeName}`,
        id: `zip-${r.postalCode}-${i}`,
    }));

    // Cap at 100 for performance, sampling evenly for spatial coverage
    if (points.length > 100) {
        const step = Math.ceil(points.length / 100);
        points = points.filter((_, i) => i % step === 0);
        console.log(`[SmartGrid] Sampled to ${points.length} postal points`);
    }

    // Final fallback
    if (points.length === 0 && bbox) {
        console.log(`[SmartGrid] No postal matches. Using bbox grid.`);
        return generateBboxGrid(bbox, 'zip', cityName);
    }

    return points;
}



// ═══════════════════════════════════════════════════════
// NEIGHBORHOODS — Overpass API (OpenStreetMap)
// ═══════════════════════════════════════════════════════

async function getNeighborhoodPoints(
    osmId: number,
    osmType: string,
    cityName: string,
    bbox: string[] | null
): Promise<GridPoint[]> {
    // Only attempt Overpass if we have a relation or way
    if (osmType !== 'relation' && osmType !== 'way') {
        console.log(`[SmartGrid] OSM type is "${osmType}" — can't create area. Using bbox grid.`);
        return bbox ? generateBboxGrid(bbox, 'neighborhood', cityName) : [];
    }

    const areaSetup = osmType === 'relation'
        ? `relation(${osmId}); map_to_area->.searchArea;`
        : `way(${osmId}); map_to_area->.searchArea;`;

    // Cast a wide net for neighborhood-like places
    const dataQuery = `
        (
          node["place"~"suburb|neighbourhood|neighborhood|quarter|village|hamlet"](area.searchArea);
          way["place"~"suburb|neighbourhood|neighborhood|quarter|village|hamlet"](area.searchArea);
          relation["place"~"suburb|neighbourhood|neighborhood|quarter|village|hamlet"](area.searchArea);
          relation["admin_level"~"9|10|11"]["name"](area.searchArea);
        );
        out center;
    `;

    const fullQuery = `[out:json][timeout:30];${areaSetup}${dataQuery}`;

    try {
        console.log(`[SmartGrid] Querying Overpass for neighborhoods...`);
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(fullQuery)}`,
            signal: AbortSignal.timeout(35000),
        });

        if (!response.ok) {
            console.warn(`[SmartGrid] Overpass HTTP ${response.status}`);
            return bbox ? generateBboxGrid(bbox, 'neighborhood', cityName) : [];
        }

        const data = await response.json();
        const elements = data.elements || [];
        console.log(`[SmartGrid] Overpass returned ${elements.length} neighborhoods`);

        if (elements.length === 0) {
            return bbox ? generateBboxGrid(bbox, 'neighborhood', cityName) : [];
        }

        // Parse and deduplicate
        const seen = new Set<string>();
        const points: GridPoint[] = [];

        for (const el of elements) {
            const lat = el.lat || el.center?.lat;
            const lng = el.lon || el.center?.lon;
            const name = el.tags?.name || 'Unknown';

            if (!lat || !lng || !name) continue;

            const key = `${name}-${parseFloat(lat).toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            points.push({
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                name,
                id: `nb-${el.id}`,
            });
        }

        // Cap at 200 for sanity
        if (points.length > 200) {
            const step = Math.ceil(points.length / 200);
            return points.filter((_, i) => i % step === 0);
        }

        return points;

    } catch (error: any) {
        console.warn(`[SmartGrid] Overpass failed: ${error.message}. Using bbox fallback.`);
        return bbox ? generateBboxGrid(bbox, 'neighborhood', cityName) : [];
    }
}


// ═══════════════════════════════════════════
// FALLBACK: Uniform grid over bounding box
// ═══════════════════════════════════════════

function generateBboxGrid(
    bbox: string[],
    type: string,
    city: string
): GridPoint[] {
    const south = parseFloat(bbox[0]);
    const north = parseFloat(bbox[1]);
    const west = parseFloat(bbox[2]);
    const east = parseFloat(bbox[3]);

    const latSpan = Math.abs(north - south);
    const lngSpan = Math.abs(east - west);
    const area = latSpan * lngSpan;

    let gridSize: number;
    if (area > 1) gridSize = 7;
    else if (area > 0.1) gridSize = 5;
    else gridSize = 4;

    const points: GridPoint[] = [];
    const latStep = latSpan / (gridSize + 1);
    const lngStep = lngSpan / (gridSize + 1);

    for (let i = 1; i <= gridSize; i++) {
        for (let j = 1; j <= gridSize; j++) {
            points.push({
                lat: parseFloat((south + latStep * i).toFixed(6)),
                lng: parseFloat((west + lngStep * j).toFixed(6)),
                name: `${city} Zone ${(i - 1) * gridSize + j}`,
                id: `grid-${i}-${j}`,
            });
        }
    }

    console.log(`[SmartGrid] Generated ${points.length} bbox grid points`);
    return points;
}


// ═══════════════════════════════════════════
// FALLBACK: Radial grid around center
// ═══════════════════════════════════════════

function generateRadialGrid(
    centerLat: number,
    centerLng: number,
    city: string
): GridPoint[] {
    const points: GridPoint[] = [{
        lat: centerLat, lng: centerLng,
        name: `${city} Center`, id: 'radial-center',
    }];

    const rings = [
        { distance: 2, count: 4 },
        { distance: 4, count: 8 },
        { distance: 5, count: 8 },
    ];

    for (const ring of rings) {
        const angleStep = 360 / ring.count;
        for (let i = 0; i < ring.count; i++) {
            const angle = (angleStep * i) * (Math.PI / 180);
            const latOff = (ring.distance / 111) * Math.cos(angle);
            const lngOff = (ring.distance / (111 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
            points.push({
                lat: parseFloat((centerLat + latOff).toFixed(6)),
                lng: parseFloat((centerLng + lngOff).toFixed(6)),
                name: `${city} Zone ${points.length}`,
                id: `radial-${ring.distance}-${i}`,
            });
        }
    }

    return points;
}


// ═══════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════

function guessCountryCode(countryName: string): string {
    const map: Record<string, string> = {
        'united states': 'US', 'usa': 'US', 'us': 'US', 'america': 'US',
        'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
        'united arab emirates': 'AE', 'uae': 'AE',
        'canada': 'CA', 'australia': 'AU', 'germany': 'DE', 'france': 'FR',
        'india': 'IN', 'japan': 'JP', 'brazil': 'BR', 'italy': 'IT',
        'spain': 'ES', 'mexico': 'MX', 'china': 'CN', 'russia': 'RU',
        'south korea': 'KR', 'netherlands': 'NL', 'saudi arabia': 'SA',
        'switzerland': 'CH', 'turkey': 'TR', 'poland': 'PL', 'sweden': 'SE',
        'austria': 'AT', 'belgium': 'BE', 'norway': 'NO', 'denmark': 'DK',
        'finland': 'FI', 'ireland': 'IE', 'portugal': 'PT', 'czech republic': 'CZ',
        'new zealand': 'NZ', 'singapore': 'SG', 'malaysia': 'MY',
        'pakistan': 'PK', 'philippines': 'PH', 'thailand': 'TH',
        'south africa': 'ZA', 'nigeria': 'NG', 'egypt': 'EG', 'kenya': 'KE',
        'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL', 'peru': 'PE',
    };
    return map[countryName.toLowerCase().trim()] || '';
}
