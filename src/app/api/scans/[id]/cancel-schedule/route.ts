import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const scan = await prisma.scan.findUnique({ where: { id } });

        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Set frequency to ONCE and clear nextRun
        const updated = await prisma.scan.update({
            where: { id },
            data: {
                frequency: 'ONCE',
                nextRun: null,
            },
        });

        return NextResponse.json({ success: true, scan: updated });
    } catch (error: any) {
        console.error('Cancel schedule error:', error);
        return NextResponse.json({ error: 'Failed to cancel schedule', details: error.message }, { status: 500 });
    }
}
