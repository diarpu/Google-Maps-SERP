'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface AddressResolverProps {
    lat: number;
    lng: number;
}

// Simple in-memory cache to prevent duplicate fetches across the session
const addressCache = new Map<string, string>();

export function AddressResolver({ lat, lng }: AddressResolverProps) {
    const [address, setAddress] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    useEffect(() => {
        // If already cached, just use it
        if (addressCache.has(cacheKey)) {
            setAddress(addressCache.get(cacheKey)!);
            return;
        }

        const currentRef = containerRef.current;
        if (!currentRef) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (entry.isIntersecting) {
                    // Stop observing once visible
                    observer.unobserve(currentRef);
                    fetchAddress();
                }
            },
            {
                rootMargin: '100px', // start fetching slightly before it comes into view
                threshold: 0.1
            }
        );

        observer.observe(currentRef);

        return () => {
            if (currentRef) observer.unobserve(currentRef);
        };
    }, [lat, lng, cacheKey]);

    const fetchAddress = async () => {
        setLoading(true);
        try {
            // Using OpenStreetMap Nominatim API (free, open-source reverse geocoding)
            // Note: Respect their rate limits - 1 req/sec maximum for free tier.
            // Our intersection observer naturally staggers requests as user scrolls.
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
            const res = await fetch(url, {
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    // Identifying our app per Nominatim Usage Policy
                    'User-Agent': 'GMB-SERP-Tracker/1.0'
                }
            });

            if (!res.ok) throw new Error('Geocoding failed');

            const data = await res.json();

            // Use the full formatted address provided by OpenStreetMap
            let resolvedAddress = 'Unknown Location';

            if (data.display_name) {
                resolvedAddress = data.display_name;
            } else if (data.address) {
                const { road, house_number, neighbourhood, suburb, city } = data.address;
                const parts = [];
                if (house_number && road) {
                    parts.push(`${house_number} ${road}`);
                } else if (road) {
                    parts.push(road);
                }

                if (neighbourhood) parts.push(neighbourhood);
                else if (suburb) parts.push(suburb);
                else if (city && parts.length === 0) parts.push(city);

                if (parts.length > 0) {
                    resolvedAddress = parts.join(', ');
                }
            }

            setAddress(resolvedAddress);
            addressCache.set(cacheKey, resolvedAddress);

        } catch (err) {
            console.error('Failed to resolve address:', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div ref={containerRef} className="flex items-start gap-1.5 text-xs">
            <MapPin size={12} className={`shrink-0 mt-0.5 ${address ? 'text-blue-500' : 'text-gray-400'}`} />
            <span className={`leading-tight ${address ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                {address ? address : loading ? 'Resolving address...' : error ? 'Location unknown' : 'Waiting...'}
            </span>
        </div>
    );
}
