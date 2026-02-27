import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { enqueueScan, isScanActive } from '@/lib/scanQueue';
import { logger } from '@/lib/logger';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await logger.info(`Rerun requested for scan ${id}`, 'API', { scanId: id });

        // Verify scan exists
        const scan = await (prisma as any).scan.findUnique({
            where: { id },
        });

        if (!scan) {
            await logger.warn(`Rerun failed: Scan ${id} not found`, 'API');
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Guard: prevent rerunning a scan that's already running
        if (scan.status === 'RUNNING' || isScanActive(id)) {
            await logger.warn(`Rerun blocked: Scan ${id} is already running`, 'API');
            return NextResponse.json(
                { error: 'Scan is already running. Stop it first or wait for it to complete.' },
                { status: 409 }
            );
        }

        // Generate a new runId for this execution — preserves history!
        const newRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Clear alerts for this scan
        await (prisma as any).alert.deleteMany({
            where: { scanId: id }
        });

        // Reset scan status with the new runId
        const updatedScan = await (prisma as any).scan.update({
            where: { id },
            data: {
                status: 'PENDING',
                currentRunId: newRunId,
                nextRun: null,
            },
            include: {
                results: {
                    where: { runId: newRunId } // Return empty for this new run
                }
            }
        });

        await logger.info(`Scan ${id} reset with new runId ${newRunId}. Previous results preserved. Triggering scan...`, 'API');

        // Trigger via queue (respects concurrency limit)
        const queueResult = enqueueScan(id);
        await logger.info(`Scan ${id} rerun enqueued: ${queueResult}`, 'API');

        return NextResponse.json({ success: true, scan: updatedScan });
    } catch (error: any) {
        await logger.error(`Scan Rerun handler crashed for ${id}: ${error.message}`, 'API', { stack: error.stack });
        console.error('Scan Rerun error:', error);
        return NextResponse.json({ error: 'Failed to rerun scan', details: error.message }, { status: 500 });
    }
}
