import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;

        // Make the request from the server to bypass CORS issues on the client
        const res = await fetch(url, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                // Required by Nominatim policy: must provide contact info
                'User-Agent': 'GMB-SERP-Tracker/1.0 (danish@vdesignu.com)'
            },
            // Don't cache deeply here, let the client cache it
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`Nominatim API Error: ${res.statusText}`);
            return NextResponse.json({ error: 'Geocoding upstream failed' }, { status: 502 });
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Failed to proxy geocode request:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
