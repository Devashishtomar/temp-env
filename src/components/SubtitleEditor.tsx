"use client";

import React, { useState, useEffect } from "react";

type Subtitle = {
    start: string | number;
    end: string | number;
    text: string;
};


function toSeconds(t: string | number): number {
    if (t === null || t === undefined) return 0;
    if (typeof t === "number") {
        if (!isFinite(t)) return 0;
        return t;
    }
    const str = String(t).trim();
    if (!str) return 0;
    if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
    const parts = str.split(":").map(Number).reverse();
    let seconds = 0;
    if (parts[0]) seconds += parts[0];
    if (parts[1]) seconds += parts[1] * 60;
    if (parts[2]) seconds += parts[2] * 3600;
    return seconds;
}

function formatTimeForPlain(s: string | number) {
    // turn various accepted inputs (seconds or mm:ss or hh:mm:ss) into HH:MM:SS (no fractional seconds)
    const secs = toSeconds(s);
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const secsPart = Math.floor(secs % 60);
    if (hrs > 0) {
        return `${pad(hrs)}:${pad(mins)}:${pad(secsPart)}`;
    } else {
        return `${pad(mins)}:${pad(secsPart)}`;
    }
}

function pad(n: number, len = 2) {
    return String(n).padStart(len, "0");
}

export default function SubtitleEditor(props: {
    initialPlain?: string;
    onCancel: () => void;
    onSave: (plain: string) => void;
    onSaveStructured?: (subs: Subtitle[]) => void;
}) {
    const { initialPlain = "", onCancel, onSave, onSaveStructured } = props;

    const parsePlain = (subs: string): Subtitle[] => {
        const lines = subs.split(/\r?\n/);
        const out: Subtitle[] = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();
            if (/^\d{2}:\d{2}:\d{2}/.test(line)) {
                const parts = line.split(/\s*-\s*/);
                const start = parts[0] || "";
                const end = parts[1] || "";
                const text = (lines[i + 1] || "").trim();
                out.push({ start, end, text });
                i += 3;
            } else {
                const m = line.match(
                    /^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/
                );
                if (m) {
                    const start = m[1];
                    const end = m[2];
                    const text = (lines[i + 1] || "").trim();
                    out.push({ start, end, text });
                    i += 3;
                } else {
                    i++;
                }
            }
        }
        return out;
    };

    const structuredToPlain = (arr: Subtitle[]) => {
        return arr
            .map((s) => `${formatTimeForPlain(s.start)} - ${formatTimeForPlain(s.end)}\n${s.text}\n`)
            .join("\n");
    };

    const [subs, setSubs] = useState<Subtitle[]>(() =>
        parsePlain(initialPlain)
    );

    useEffect(() => {
        setSubs(parsePlain(initialPlain));
    }, [initialPlain]);

    const addRow = () => {
        setSubs((p) => [
            ...p,
            { start: "00:00:00", end: "00:00:05", text: "New subtitle" },
        ]);
    };

    const removeRow = (idx: number) => {
        setSubs((p) => p.filter((_, i) => i !== idx));
    };

    const updateRow = (idx: number, field: keyof Subtitle, value: string) => {
        setSubs((p) => p.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
    };

    const validate = (): { ok: boolean; reason?: string } => {
        for (let i = 0; i < subs.length; i++) {
            const s = subs[i];
            if (!s.text || s.text.trim().length === 0)
                return { ok: false, reason: `Row ${i + 1}: empty text` };
            const st = toSeconds(s.start);
            const en = toSeconds(s.end);
            if (!(en > st))
                return {
                    ok: false,
                    reason: `Row ${i + 1}: end time must be greater than start`,
                };
        }
        return { ok: true };
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">Subtitle Editor</h3>
                    <div className="flex gap-2">
                        <button
                            className="px-3 py-1 rounded bg-gray-100"
                            onClick={() => {
                                const v = validate();
                                if (!v.ok) {
                                    alert(v.reason);
                                    return;
                                }
                                try {
                                    if (typeof onSaveStructured === "function") {
                                        onSaveStructured(subs.map(s => ({
                                            start: toSeconds(s.start),
                                            end: toSeconds(s.end),
                                            text: (s.text || "").trim()
                                        })));
                                    }
                                } catch (err) {
                                    console.warn("onSaveStructured error:", err);
                                }
                                onSave(structuredToPlain(subs));
                            }}
                        >
                            Save
                        </button>
                        <button
                            className="px-3 py-1 rounded bg-red-50"
                            onClick={onCancel}
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-auto">
                    {subs.map((s, idx) => (
                        <div key={idx} className="border rounded p-3">
                            <div className="flex gap-2 items-center mb-2">
                                <label className="text-xs text-gray-600">Start</label>
                                <input
                                    className="border rounded px-2 py-1 w-32"
                                    value={s.start}
                                    onChange={(e) =>
                                        updateRow(idx, "start", e.target.value)
                                    }
                                />

                                <label className="text-xs text-gray-600">End</label>
                                <input
                                    className="border rounded px-2 py-1 w-32"
                                    value={s.end}
                                    onChange={(e) =>
                                        updateRow(idx, "end", e.target.value)
                                    }
                                />

                                <div className="ml-auto flex gap-2">
                                    <button
                                        className="text-sm px-2 py-1 bg-gray-100 rounded"
                                        onClick={() => addRow()}
                                    >
                                        + Add
                                    </button>
                                    <button
                                        className="text-sm px-2 py-1 bg-red-50 rounded"
                                        onClick={() => removeRow(idx)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <textarea
                                className="w-full border rounded p-2 min-h-[56px]"
                                value={s.text}
                                onChange={(e) =>
                                    updateRow(idx, "text", e.target.value)
                                }
                            />
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex justify-between">
                    <div className="text-sm text-gray-500">
                        Times accept seconds (3.5) or mm:ss or hh:mm:ss
                    </div>
                    <div>
                        <button
                            className="px-3 py-1 rounded bg-blue-50"
                            onClick={addRow}
                        >
                            + Add subtitle
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
