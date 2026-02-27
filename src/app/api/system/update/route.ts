import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Root directory of the project
const PROJECT_ROOT = process.cwd();

export async function GET() {
    // Return the current local version
    try {
        const pkgPath = path.join(PROJECT_ROOT, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return NextResponse.json({ version: pkg.version });
    } catch {
        return NextResponse.json({ version: 'unknown' });
    }
}

export async function POST() {
    try {
        const logs: string[] = [];

        const run = async (cmd: string, label: string) => {
            logs.push(`[${label}] Running: ${cmd}`);
            const { stdout, stderr } = await execAsync(cmd, {
                cwd: PROJECT_ROOT,
                timeout: 120_000, // 2 minute timeout per step
            });
            if (stdout.trim()) logs.push(`[${label}] ${stdout.trim()}`);
            if (stderr.trim()) logs.push(`[${label}] STDERR: ${stderr.trim()}`);
        };

        // Step 1: Pull latest code from GitHub
        await run('git pull --ff-only origin main', 'git');

        // Step 2: Install any new dependencies
        await run('pnpm install --frozen-lockfile 2>&1 || npm install 2>&1', 'deps');

        // Step 3: Apply any new database migrations
        await run('npx prisma db push --accept-data-loss 2>&1 || echo "Prisma push skipped"', 'db');

        // Step 4: Read the new version from package.json
        const pkgPath = path.join(PROJECT_ROOT, 'package.json');
        const newPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

        return NextResponse.json({
            success: true,
            newVersion: newPkg.version,
            logs,
            message: 'Update successful! Please restart the app to apply changes.',
        });
    } catch (error: any) {
        console.error('Update failed:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            logs: [error.stderr || error.stdout || error.message],
        }, { status: 500 });
    }
}
