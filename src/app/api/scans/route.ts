import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { enqueueScan } from '@/lib/scanQueue';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const scans = await prisma.scan.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ scans });
    } catch (error) {
        console.error('Scans GET error:', error);
        return NextResponse.json({ scans: [] });
    }
}

export async function POST(req: Request) {
    try {
        const {
            keyword,
            radius,
            gridSize,
            frequency,
            businessName,
            shape,
            customPoints,
            lat,
            lng,
            placeId
        } = await req.json();

        // Use provided coordinates or default to Chicago (Mock)
        const centerLat = typeof lat === 'number' ? lat : 41.8781;
        const centerLng = typeof lng === 'number' ? lng : -87.6298;

        const scan = await prisma.scan.create({
            data: {
                keyword,
                centerLat,
                centerLng,
                radius: parseFloat(radius) || 5,
                gridSize: parseInt(gridSize) || 3,
                shape: shape || 'SQUARE',
                customPoints: customPoints ? JSON.stringify(customPoints) : null,
                frequency: frequency || 'ONCE',
                businessName: businessName || undefined,
                placeId: placeId || undefined,
                status: 'PENDING',
            },
        });

        // Start scan via queue (respects concurrency limit)
        logger.info(`New scan created: "${keyword}"`, 'API', { scanId: scan.id });
        const queueResult = enqueueScan(scan.id);
        logger.info(`Scan ${scan.id} enqueue result: ${queueResult}`, 'API');

        return NextResponse.json(scan);
    } catch (error) {
        console.error('Scan creation CRITICAL error:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        return NextResponse.json({ error: 'Failed to create scan', details: String(error) }, { status: 500 });
    }
}
