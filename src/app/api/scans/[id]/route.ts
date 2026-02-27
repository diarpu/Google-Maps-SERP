import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(request.url);
        const requestedRunId = url.searchParams.get('runId');

        const scan = await (prisma as any).scan.findUnique({
            where: { id },
        });

        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Get all distinct runs for the timeline using raw SQL
        // (avoids Prisma client cache issues with new columns)
        const rawRuns: any[] = await prisma.$queryRawUnsafe(
            `SELECT runId, MIN(runAt) as runAt, COUNT(*) as resultCount 
             FROM Result 
             WHERE scanId = ? 
             GROUP BY runId 
             ORDER BY MIN(runAt) ASC`,
            id
        );

        const runs = rawRuns.map(r => ({
            runId: r.runId || `${id}-legacy`,
            runAt: r.runAt ? new Date(r.runAt).toISOString() : scan.createdAt.toISOString(),
            resultCount: Number(r.resultCount),
        }));

        // Determine which run to show
        const activeRunId = requestedRunId || scan.currentRunId || (runs.length > 0 ? runs[runs.length - 1].runId : null);

        // Fetch results for the active run using raw query
        const results: any[] = activeRunId
            ? await prisma.$queryRawUnsafe(
                `SELECT * FROM Result WHERE scanId = ? AND runId = ?`,
                id, activeRunId
            )
            : await prisma.$queryRawUnsafe(
                `SELECT * FROM Result WHERE scanId = ?`,
                id
            );

        return NextResponse.json({
            scan: { ...scan, results },
            runs,
            activeRunId,
        });
    } catch (error: any) {
        console.error('Scan GET error:', error?.message, error?.stack);
        return NextResponse.json({ error: 'Failed to fetch scan', details: error?.message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.result.deleteMany({ where: { scanId: id } });
        await prisma.scan.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Scan DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete scan' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Whitelist only fields that should be updatable via PATCH
        const allowedFields = ['keyword', 'businessName', 'radius', 'frequency', 'gridSize', 'shape'];
        const safeData: Record<string, any> = {};
        for (const key of allowedFields) {
            if (body[key] !== undefined) {
                safeData[key] = body[key];
            }
        }

        if (Object.keys(safeData).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const scan = await prisma.scan.update({
            where: { id },
            data: safeData,
        });

        return NextResponse.json(scan);
    } catch (error) {
        console.error('Scan PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update scan' }, { status: 500 });
    }
}
