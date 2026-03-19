// src/app/api/library/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import formidable from "formidable";
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { pool, getUserByEmail } from "@/lib/db";
import { spawnSync } from "child_process";
import { pipeline } from "stream";
import { promisify } from "util";
import { Readable as NodeReadable } from "stream";

const pipelineAsync = promisify(pipeline);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const LIB_FOLDER = process.env.LIB_FOLDER || process.env.LIBRARY_FOLDER_NAME || "librarysaves";
const STORAGE_ROOT = path.resolve(process.cwd());
const STORAGE_LIMIT_BYTES = Number(process.env.STORAGE_LIMIT_BYTES || 1 * 1024 * 1024 * 1024);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 200 * 1024 * 1024);
const TMP_DIR = path.join(STORAGE_ROOT, LIB_FOLDER, "tmp");

function userLibraryDir(userId: number) {
    return path.join(STORAGE_ROOT, LIB_FOLDER, String(userId));
}
function sanitizeFilename(name: string) {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * Resolve numeric user id from session or public.users by email.
 * Returns null if unauthenticated/unresolvable.
 */
async function getUserNumericFromRequest(): Promise<null | { id: number; email?: string | null }> {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return null;

    const sid = session.user.id;
    const email = session.user.email ?? null;

    if (sid != null) {
        const n = Number(sid);
        if (!Number.isNaN(n)) return { id: n, email };
    }

    if (email) {
        const u = await getUserByEmail(email.toLowerCase());
        if (u && u.id != null) return { id: Number(u.id), email: u.email };
    }

    return null;
}

/* Robust multipart parser: uses formidable if req.raw present, otherwise Request.formData,
   streaming web ReadableStreams to disk via Readable.fromWeb when available.
*/
async function parseMultipart(req: Request): Promise<{ fields: any; files: any }> {
    await fs.ensureDir(TMP_DIR);

    const nodeReq = (req as any).raw;
    if (nodeReq) {
        const form = formidable({
            multiples: false,
            keepExtensions: true,
            uploadDir: TMP_DIR,
            maxFileSize: Math.max(MAX_UPLOAD_BYTES * 2, 1024 * 1024 * 1024),
        });

        return new Promise((resolve, reject) => {
            form.parse(nodeReq as any, (err: any, fields: formidable.Fields, files: formidable.Files) => {
                if (err) return reject(err);
                resolve({ fields, files });
            });
        });
    }

    const formData = await req.formData();
    const fields: Record<string, any> = {};
    const files: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
            const webFile = value as File;
            const safeName = sanitizeFilename(webFile.name || "upload");
            const tmpName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
            const tmpPath = path.join(TMP_DIR, tmpName);

            const maybeStream = (webFile as any).stream?.();
            if (maybeStream) {
                try {
                    // Node-style stream
                    if (typeof (maybeStream as any).pipe === "function") {
                        await pipelineAsync((maybeStream as any) as NodeReadable, fs.createWriteStream(tmpPath));
                    } else if (typeof (NodeReadable as any).fromWeb === "function") {
                        const nodeReadable = (NodeReadable as any).fromWeb(maybeStream);
                        await pipelineAsync(nodeReadable, fs.createWriteStream(tmpPath));
                    } else {
                        // fallback
                        const buf = Buffer.from(await webFile.arrayBuffer());
                        await fs.writeFile(tmpPath, buf);
                    }
                } catch (err: any) {
                    // fallback to buffering on failure
                    const buf = Buffer.from(await webFile.arrayBuffer());
                    await fs.writeFile(tmpPath, buf);
                }
            } else {
                const buf = Buffer.from(await webFile.arrayBuffer());
                await fs.writeFile(tmpPath, buf);
            }

            const stat = await fs.stat(tmpPath);
            files[key] = {
                filepath: tmpPath,
                path: tmpPath,
                size: stat.size,
                originalFilename: webFile.name,
                name: webFile.name,
                mimetype: webFile.type || "application/octet-stream",
            };
        } else {
            const s = value == null ? "" : String(value);
            if (fields[key] === undefined) fields[key] = s;
            else if (Array.isArray(fields[key])) fields[key].push(s);
            else fields[key] = [fields[key], s];
        }
    }

    return { fields, files };
}

function probeDuration(filePath: string): { ok: boolean; duration?: number | null } {
    try {
        const out = spawnSync("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            filePath,
        ], { encoding: "utf8" });

        if (out.status !== 0) return { ok: false };
        const dur = parseFloat((out.stdout || "").trim());
        return { ok: true, duration: isNaN(dur) ? null : Math.round(dur) };
    } catch {
        return { ok: false };
    }
}

/* ---------------- GET ---------------- */
export async function GET() {
    const user = await getUserNumericFromRequest();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const client = await pool.connect();
    try {
        const filesRes = await client.query(
            `SELECT id, filename, stored_path, size_bytes, mime_type, duration_seconds, created_at
       FROM public.library_files WHERE user_id = $1 ORDER BY created_at DESC`,
            [user.id]
        );

        const usedRes = await client.query(`SELECT used_bytes FROM public.user_storage WHERE user_id = $1`, [user.id]);
        const used = usedRes.rowCount ? Number(usedRes.rows[0].used_bytes) : 0;

        return NextResponse.json({ videos: filesRes.rows, usedBytes: used, storageLimit: STORAGE_LIMIT_BYTES });
    } catch (err: any) {
        console.error("Library GET error:", String(err?.message ?? err));
        return NextResponse.json({ error: "Failed to list library" }, { status: 500 });
    } finally {
        client.release();
    }
}

/* ---------------- POST ---------------- */
export async function POST(req: Request) {
    const user = await getUserNumericFromRequest();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
        return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    let parsed: any;
    try {
        parsed = await parseMultipart(req);
    } catch (err: any) {
        console.error("PARSE ERROR:", String(err?.message ?? err));
        return NextResponse.json({ error: "Failed to parse form: " + String(err?.message ?? err) }, { status: 400 });
    }

    const files = parsed.files || {};
    if (!files.video) return NextResponse.json({ error: "No 'video' file field provided" }, { status: 400 });

    const file = Array.isArray(files.video) ? files.video[0] : files.video;
    const tmpPath = file.filepath || file.path;
    const size = Number(file.size || 0);
    const origName = file.originalFilename || file.name || `video-${Date.now()}.mp4`;
    const mime = file.mimetype || file.type || "";

    if (size > MAX_UPLOAD_BYTES) {
        try { await fs.remove(tmpPath); } catch { }
        return NextResponse.json({ error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
    }

    if (!mime || !mime.startsWith("video/")) {
        try { await fs.remove(tmpPath); } catch { }
        return NextResponse.json({ error: "Only video/* MIME types are allowed" }, { status: 400 });
    }

    const probe = probeDuration(tmpPath);
    if (!probe.ok) {
        try { await fs.remove(tmpPath); } catch { }
        console.warn("ffprobe failed");
        return NextResponse.json({ error: "Uploaded file failed validation (ffprobe)" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ensure user_storage exists
        await client.query(
            `INSERT INTO public.user_storage (user_id, used_bytes, updated_at) VALUES ($1, 0, now()) ON CONFLICT (user_id) DO NOTHING`,
            [user.id]
        );

        // lock and check usage
        const usRes = await client.query("SELECT used_bytes FROM public.user_storage WHERE user_id = $1 FOR UPDATE", [user.id]);
        const used = usRes.rowCount ? Number(usRes.rows[0].used_bytes) : 0;

        if (used + size > STORAGE_LIMIT_BYTES) {
            await client.query("ROLLBACK");
            try { await fs.remove(tmpPath); } catch { }
            return NextResponse.json({ error: "User storage quota exceeded." }, { status: 409 });
        }

        // move file to user folder
        const destDir = userLibraryDir(user.id);
        await fs.ensureDir(destDir);
        const ext = path.extname(origName) || ".mp4";
        const destName = `${Date.now()}-${uuidv4()}${ext}`;
        const destPath = path.join(destDir, sanitizeFilename(destName));
        await fs.move(tmpPath, destPath, { overwrite: true });

        // insert metadata
        const fileId = uuidv4();
        const insertRes = await client.query(
            `INSERT INTO public.library_files
        (id, user_id, filename, stored_path, size_bytes, mime_type, duration_seconds, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       RETURNING id, filename, stored_path, size_bytes, mime_type, duration_seconds, created_at`,
            [fileId, user.id, origName, destPath, size, mime, probe.duration]
        );

        // update usage
        await client.query("UPDATE public.user_storage SET used_bytes = used_bytes + $1, updated_at = now() WHERE user_id = $2", [size, user.id]);

        await client.query("COMMIT");
        return NextResponse.json({ ok: true, file: insertRes.rows[0] });
    } catch (err: any) {
        await client.query("ROLLBACK");
        console.error("Upload transaction error:", String(err?.message ?? err));
        try { await fs.remove(parsed?.files?.video?.filepath || parsed?.files?.video?.path); } catch { }
        return NextResponse.json({ error: "Upload failed: " + String(err?.message ?? err) }, { status: 500 });
    } finally {
        client.release();
    }
}

/* ---------------- DELETE ---------------- */
export async function DELETE(req: Request) {
    const user = await getUserNumericFromRequest();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id param" }, { status: 400 });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const sel = await client.query("SELECT stored_path, size_bytes FROM public.library_files WHERE id = $1 AND user_id = $2", [id, user.id]);
        if (sel.rowCount === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const { stored_path, size_bytes } = sel.rows[0];

        try { await fs.remove(stored_path); } catch (e) { console.warn("unlink failed", e); }

        await client.query("DELETE FROM public.library_files WHERE id = $1", [id]);
        await client.query("UPDATE public.user_storage SET used_bytes = GREATEST(0, used_bytes - $1), updated_at = now() WHERE user_id = $2", [size_bytes, user.id]);

        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        await client.query("ROLLBACK");
        console.error("Delete failed", String(err?.message ?? err));
        return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    } finally {
        client.release();
    }
}
