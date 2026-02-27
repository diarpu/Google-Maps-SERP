'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface AddressResolverProps {
    lat: number;
    lng: number;
}

// Simple in-memory cache to prevent duplicate fetches across the session
const addressCache = new Map<string, string>();

// Global queue to strict rate-limit Nominatim requests (1 req per 1.5s to be safe)
type QueueItem = {
    lat: number;
    lng: number;
    resolve: (address: string) => void;
    reject: (err: any) => void;
};

const geocodeQueue: QueueItem[] = [];
let isProcessingQueue = false;

const processQueue = async () => {
    if (isProcessingQueue || geocodeQueue.length === 0) return;
    isProcessingQueue = true;

    while (geocodeQueue.length > 0) {
        const item = geocodeQueue.shift();
        if (!item) continue;

        try {
            // Using our own API route to bypass client-side CORS blocking from Nominatim
            const url = `/api/system/reverse-geocode?lat=${item.lat}&lng=${item.lng}`;
            const res = await fetch(url);

            if (!res.ok) throw new Error(`Geocoding failed: ${res.statusText}`);
            const data = await res.json();

            // The proxy API returns the direct JSON. Parse the same way.
            let resolvedAddress = 'Unknown Location';
            if (data.display_name) {
                resolvedAddress = data.display_name;
            } else if (data.address) {
                const { road, house_number, neighbourhood, suburb, city } = data.address;
                const parts = [];
                if (house_number && road) parts.push(`${house_number} ${road}`);
                else if (road) parts.push(road);
                if (neighbourhood) parts.push(neighbourhood);
                else if (suburb) parts.push(suburb);
                else if (city && parts.length === 0) parts.push(city);
                if (parts.length > 0) resolvedAddress = parts.join(', ');
            }

            item.resolve(resolvedAddress);
        } catch (err) {
            item.reject(err);
        }

        // Wait strict 1.5 seconds before next request (Nominatim policy: strict 1 req/sec max)
        await new Promise(r => setTimeout(r, 1500));
    }

    isProcessingQueue = false;
};

const enqueueGeocode = (lat: number, lng: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        geocodeQueue.push({ lat, lng, resolve, reject });
        processQueue();
    });
};

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
            const resolvedAddress = await enqueueGeocode(lat, lng);
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
