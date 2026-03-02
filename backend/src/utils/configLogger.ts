// src/utils/configLogger.ts
// Startup Diagnostics — confirms connectivity for all external services

import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';
import { BlobServiceClient } from '@azure/storage-blob';
import { execSync } from 'child_process';
import fs from 'fs';
import Redis from 'ioredis';

// ─── Colour helpers (works on most terminals including Windows Terminal) ───
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function ok(label: string, detail?: string) {
    console.log(`  ${green('✅')} ${label}${detail ? dim(` — ${detail}`) : ''}`);
}
function fail(label: string, detail?: string) {
    console.log(`  ${red('❌')} ${label}${detail ? dim(` — ${detail}`) : ''}`);
}
function warn(label: string, detail?: string) {
    console.log(`  ${yellow('⚠️')}  ${label}${detail ? dim(` — ${detail}`) : ''}`);
}

// ─── 1. Azure SQL ──────────────────────────────────────────────────────────
async function checkAzureSQL(): Promise<boolean> {
    const server = process.env.AZURE_SQL_SERVER;
    const database = process.env.AZURE_SQL_DATABASE;
    const user = process.env.AZURE_SQL_USER;
    const password = process.env.AZURE_SQL_PASSWORD;

    if (!server || !database || !user || !password) {
        fail('Azure SQL', 'One or more env vars missing (AZURE_SQL_SERVER, DATABASE, USER, PASSWORD)');
        return false;
    }

    try {
        const pool = await new sql.ConnectionPool({
            server,
            database,
            user,
            password,
            options: { encrypt: true, trustServerCertificate: false },
            connectionTimeout: 10000,
            requestTimeout: 10000,
        }).connect();

        // Quick query to confirm the connection is alive
        const result = await pool.request().query('SELECT 1 AS alive');
        const alive = result.recordset?.[0]?.alive === 1;
        await pool.close();

        if (alive) {
            ok('Azure SQL', `${user}@${server}/${database}`);
            return true;
        }
        fail('Azure SQL', 'Connected but test query returned unexpected result');
        return false;
    } catch (err: any) {
        fail('Azure SQL', err.message ?? String(err));
        return false;
    }
}

// ─── 2. Azure Blob Storage ─────────────────────────────────────────────────
async function checkAzureBlob(): Promise<boolean> {
    const connStr = (process.env.AZURE_BLOB_CONNECTION_STRING || '').trim();
    const container = process.env.AZURE_BLOB_CONTAINER || 'media-assets';

    if (!connStr) {
        fail('Azure Blob Storage', 'AZURE_BLOB_CONNECTION_STRING is not set');
        return false;
    }

    try {
        const client = BlobServiceClient.fromConnectionString(connStr);
        const containerClient = client.getContainerClient(container);
        const exists = await containerClient.exists();

        if (exists) {
            ok('Azure Blob Storage', `Container "${container}" exists`);
        } else {
            warn('Azure Blob Storage', `Connected, but container "${container}" does not exist yet`);
        }
        return true;
    } catch (err: any) {
        fail('Azure Blob Storage', err.message ?? String(err));
        return false;
    }
}

// ─── 3. Redis ──────────────────────────────────────────────────────────────
async function checkRedis(): Promise<boolean> {
    let rawUrl = (process.env.REDIS_URL || '').trim();

    if (!rawUrl) {
        fail('Redis', 'REDIS_URL is not set');
        return false;
    }

    // Guard: the .env currently has "REDIS_URL=rediss://..." inside the value
    if (rawUrl.startsWith('REDIS_URL=')) {
        rawUrl = rawUrl.replace(/^REDIS_URL=/, '');
        warn('Redis', 'REDIS_URL value contains a duplicate "REDIS_URL=" prefix — auto-stripped');
    }

    return new Promise<boolean>((resolve) => {
        const redis = new Redis(rawUrl, {
            connectTimeout: 10000,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,        // do not retry on startup check
            lazyConnect: true,
            tls: rawUrl.startsWith('rediss://') ? {} : undefined,
        });

        // Suppress ioredis default "Unhandled error event" console dump
        redis.on('error', () => { });

        const timer = setTimeout(() => {
            redis.disconnect();
            fail('Redis', 'Connection timed out after 10 s');
            resolve(false);
        }, 10000);

        redis.connect()
            .then(() => redis.ping())
            .then((pong) => {
                clearTimeout(timer);
                if (pong === 'PONG') {
                    ok('Redis', rawUrl.replace(/\/\/.*@/, '//***@'));   // mask credentials
                } else {
                    warn('Redis', `Connected but PING returned "${pong}"`);
                }
                redis.disconnect();
                resolve(true);
            })
            .catch((err: any) => {
                clearTimeout(timer);
                fail('Redis', err.message ?? String(err));
                redis.disconnect();
                resolve(false);
            });
    });
}

// ─── 4. FFmpeg ─────────────────────────────────────────────────────────────
function checkFFmpeg(): boolean {
    const configuredPath = process.env.FFMPEG_PATH || '';

    // Try the configured path first, then fall back to PATH lookup
    const candidates = configuredPath
        ? [configuredPath, 'ffmpeg']
        : ['ffmpeg'];

    for (const bin of candidates) {
        try {
            const version = execSync(`"${bin}" -version`, {
                timeout: 5000,
                stdio: ['pipe', 'pipe', 'pipe'],
            })
                .toString()
                .split('\n')[0]
                .replace(/\r/g, '')   // strip Windows \r so it doesn't overwrite the line
                .trim();

            ok('FFmpeg', `${version}  (path: ${bin})`);
            return true;
        } catch {
            // try next candidate
        }
    }

    if (configuredPath) {
        // Check if the file at least exists (even if not executable)
        if (fs.existsSync(configuredPath)) {
            warn('FFmpeg', `File exists at ${configuredPath} but could not execute — check permissions`);
        } else {
            fail('FFmpeg', `Binary not found at configured path: ${configuredPath}`);
        }
    } else {
        fail('FFmpeg', 'FFMPEG_PATH not set and "ffmpeg" is not on the system PATH');
    }
    return false;
}

// ─── 5. Temp directory ─────────────────────────────────────────────────────
function checkTempDir(): boolean {
    const tempDir = process.env.TEMP_DIR || '/tmp/media-processing';
    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            ok('Temp Directory', `Created ${tempDir}`);
        } else {
            ok('Temp Directory', tempDir);
        }
        return true;
    } catch (err: any) {
        fail('Temp Directory', `Cannot create ${tempDir} — ${err.message}`);
        return false;
    }
}

// ─── 6. Optional integrations (presence-only check, no live ping) ──────────
function checkOptionalEnvVars(): void {
    const checks: [string, string | undefined][] = [
        ['SUPADEMO_API_KEY', process.env.SUPADEMO_API_KEY],
        ['SUPADEMO_WORKSPACE_ID', process.env.SUPADEMO_WORKSPACE_ID],
        ['SUPADEMO_WEBHOOK_SECRET', process.env.SUPADEMO_WEBHOOK_SECRET],
        ['HUBSPOT_API_KEY', process.env.HUBSPOT_API_KEY],
        ['SLACK_WEBHOOK_URL', process.env.SLACK_WEBHOOK_URL],
        ['COPILOT_GRAPH_TOKEN', process.env.COPILOT_GRAPH_TOKEN],
        ['COPILOT_STUDIO_ENDPOINT', process.env.COPILOT_STUDIO_ENDPOINT],
        ['COPILOT_STUDIO_API_KEY', process.env.COPILOT_STUDIO_API_KEY],
        ['COPILOT_TENANT_ID', process.env.COPILOT_TENANT_ID],
    ];

    for (const [name, value] of checks) {
        const isPlaceholder = !value || value.startsWith('your_');
        if (isPlaceholder) {
            warn(name, 'not configured (placeholder or missing)');
        } else {
            ok(name, '[SET]');
        }
    }
}

// ─── Master orchestrator ───────────────────────────────────────────────────
export async function runStartupDiagnostics(): Promise<void> {
    console.log('');
    console.log(bold(cyan('  ╔══════════════════════════════════════════════════════════╗')));
    console.log(bold(cyan('  ║      🚀 Agile Intel v3.0 — Startup Diagnostics         ║')));
    console.log(bold(cyan('  ╚══════════════════════════════════════════════════════════╝')));
    console.log('');

    // ── Core Services (async, with real connectivity checks) ──
    console.log(bold('  ── Core Services ──────────────────────────────────────────'));
    const [sqlOk, blobOk, redisOk] = await Promise.all([
        checkAzureSQL(),
        checkAzureBlob(),
        checkRedis(),
    ]);

    // ── Local Tools (sync) ──
    console.log('');
    console.log(bold('  ── Local Tools ────────────────────────────────────────────'));
    const ffmpegOk = checkFFmpeg();
    const tempOk = checkTempDir();

    // ── Optional Integrations ──
    console.log('');
    console.log(bold('  ── Optional Integrations ──────────────────────────────────'));
    checkOptionalEnvVars();

    // ── Summary ──
    const total = 5;
    const passed = [sqlOk, blobOk, redisOk, ffmpegOk, tempOk].filter(Boolean).length;
    const summary = passed === total
        ? green(`All ${total} core checks passed`)
        : yellow(`${passed}/${total} core checks passed`);

    console.log('');
    console.log(bold(`  ── Summary: ${summary} ──`));
    console.log('');
}
