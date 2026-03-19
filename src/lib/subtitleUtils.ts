// src/lib/subtitleUtils.ts
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export type SubtitleEntry = {
    // frontend sends { start: number, end: number, text: string } (seconds)
    start: number;
    end: number;
    text: string;
    // future per-line overrides could be added here
};

export function formatAssTime(seconds: number): string {
    // ASS format: H:MM:SS.cc (centiseconds)
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.round((seconds - Math.floor(seconds)) * 100);
    const cs = String(centis).padStart(2, "0");
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${cs}`;
}

function sanitizeAssText(text: string): string {
    if (typeof text !== "string") return "";
    // Normalize newlines
    let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    t = t.replace(/\u0000/g, "");
    // Remove control chars except newline
    t = t.replace(/[\x00-\x1F\x7F]/g, (c) => (c === "\n" ? "\n" : ""));
    // Replace curly braces which are ASS override markers (prevent injection)
    t = t.replace(/\{/g, "(").replace(/\}/g, ")");
    // Trim each line then join with \N for ASS newlines
    t = t.split("\n").map((line) => line.trim()).join("\\N");
    // Escape leading commas in lines (ASS fields are comma separated)
    // Not strictly required inside Text field, but safe to replace any leading comma
    if (t.startsWith(",")) t = `\\,${t.slice(1)}`;
    return t;
}

// Accept hex like "#RRGGBB" or "&H00BBGGRR"
function normalizeToAssColor(input?: string): string {
    if (!input) return "&H00FFFFFF";
    const s = String(input).trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
        // convert #RRGGBB to &H00BBGGRR
        const hex = s.replace("#", "");
        const r = hex.substring(0, 2);
        const g = hex.substring(2, 4);
        const b = hex.substring(4, 6);
        return `&H00${b}${g}${r}`.toUpperCase();
    }
    // if it's already &H... return as-is (simple validation)
    if (/^&H[0-9A-Fa-f]+$/.test(s)) return s.toUpperCase();
    return "&H00FFFFFF";
}

/**
 * Build ASS content.
 *
 * subtitles: array of SubtitleEntry (start/end in seconds)
 * opts:
 *  - playResX/playResY: used for \pos conversions and Style PlayRes
 *  - fontName/fontSize/primaryColor/outline/shadow/alignment/marginV
 *  - bold/italic (booleans) for default style (per-line overrides not implemented)
 *  - overlayXPercent/overlayYPercent: if provided (both), we prepend a \pos(x,y) for each dialogue
 */
export function buildAssContent(
    subtitles: SubtitleEntry[],
    opts?: {
        fontName?: string;
        fontSize?: number;
        primaryColor?: string; // "#RRGGBB" or "&H00BBGGRR"
        outline?: number;
        shadow?: number;
        alignment?: number; // 1..9
        marginV?: number;
        playResX?: number;
        playResY?: number;
        bold?: boolean;
        italic?: boolean;
        // optional global overlay position (percent 0-100). Only used when both provided.
        overlayXPercent?: number | null;
        overlayYPercent?: number | null;
    }
): string {
    const {
        fontName = "Arial",
        fontSize = 36,
        primaryColor = "#FFFFFF",
        outline = 2,
        shadow = 0,
        alignment = 2,
        marginV = 40,
        playResX = 1280,
        playResY = 720,
        bold = false,
        italic = false,
        overlayXPercent = null,
        overlayYPercent = null,
    } = opts || {};

    const assColor = normalizeToAssColor(primaryColor);

    // Bold/Italic values in Style line are 1/0
    const boldFlag = bold ? 1 : 0;
    const italicFlag = italic ? 1 : 0;

    const headerLines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        `PlayResX: ${Math.max(1, Math.floor(playResX))}`,
        `PlayResY: ${Math.max(1, Math.floor(playResY))}`,
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        // SecondaryColour/back/outlines left default; Bold/Italic set from opts
        `Style: Default,${fontName},${Math.max(6, Math.floor(fontSize))},${assColor},${assColor},&H00000000,&H00000000,${boldFlag},${italicFlag},0,0,100,100,0,0,1,${outline},${shadow},${alignment},10,10,${marginV},1`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ];

    const lines: string[] = [];
    let layer = 0;

    // Precompute overlay pos in pixels if both percents provided
    let globalPosTag = "";
    if (
        typeof overlayXPercent === "number" &&
        typeof overlayYPercent === "number" &&
        !isNaN(overlayXPercent) &&
        !isNaN(overlayYPercent)
    ) {
        const px = Math.round((overlayXPercent / 100) * playResX);
        const py = Math.round((overlayYPercent / 100) * playResY);
        globalPosTag = `{\\pos(${px},${py})}`; // will be prepended to each subtitle text
    }

    for (const s of subtitles) {
        const start = formatAssTime(s.start);
        const end = formatAssTime(s.end);
        const text = sanitizeAssText(s.text || "");
        // Prepend global pos tag if available
        const textWithPos = globalPosTag ? `${globalPosTag}${text}` : text;
        // Compose dialogue. Note: we put empty Name/Effects etc as in your previous format
        const dialogue = `Dialogue: ${layer},${start},${end},Default,,0,0,0,,${textWithPos}`;
        lines.push(dialogue);
        layer++;
    }

    return headerLines.join("\n") + "\n" + lines.join("\n") + "\n";
}

/**
 * Write ASS content to a temporary file and return its absolute path.
 * tempDir should be an existing directory (e.g. your project's tmp or OS tmp dir).
 */
export async function writeAssToTempFile(content: string, tempDir: string): Promise<string> {
    const id = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const filename = `subtitles-${id}.ass`;
    const filePath = path.join(tempDir, filename);
    await fs.mkdir(tempDir, { recursive: true });
    // write as UTF-8 (ASS supports UTF-8)
    await fs.writeFile(filePath, content, { encoding: "utf8" });
    return filePath;
}

/** Delete file if exists */
export async function safeUnlink(p: string) {
    try {
        await fs.unlink(p);
    } catch (err) {
        // ignore
    }
}
