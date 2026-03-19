"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginGate from "@/components/LoginGate";
import AccountLayout from "@/components/AccountLayout";

interface LibraryFile {
  id: string;
  filename: string;
  size_bytes: number;
  stored_path?: string;
  mime_type?: string;
  duration_seconds?: number | null;
  created_at?: string;
}

interface ApiListResponse {
  videos: LibraryFile[];
  usedBytes: number;
  storageLimit: number;
}

type ViewMode = "grid" | "list";

const MAX_CLIENT_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB client-side hint (backend enforces real limit)

export default function LibraryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [usedBytes, setUsedBytes] = useState<number>(0);
  const [storageLimit, setStorageLimit] = useState<number>(1 * 1024 * 1024 * 1024);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({}); // fileId -> percent
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetchLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function fetchLibrary() {
    try {
      const res = await fetch("/api/library", { method: "GET", credentials: "include" });
      if (!res.ok) throw new Error("Failed to load library");
      const data: ApiListResponse = await res.json();
      setFiles(data.videos ?? []);
      setUsedBytes(Number(data.usedBytes ?? 0));
      setStorageLimit(Number(data.storageLimit ?? storageLimit));
    } catch (err) {
      console.error("fetchLibrary error", err);
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  }

  // handle input selection
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    uploadFiles(Array.from(list));
    // reset input so selecting same file again triggers change
    e.currentTarget.value = "";
  }

  // drag drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const list = Array.from(e.dataTransfer.files || []);
    uploadFiles(list);
  }

  // top Upload button action
  function openFilePicker() {
    inputRef.current?.click();
  }

  // delete
  async function handleDelete(fileId: string) {
    if (!confirm("Delete this file from your library? This will free up storage.")) return;
    try {
      const res = await fetch(`/api/library?id=${encodeURIComponent(fileId)}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body?.error || "Failed to delete");
        return;
      }
      // refresh
      fetchLibrary();
    } catch (err) {
      console.error("delete error", err);
      alert("Delete failed");
    }
  }

  // upload with progress using XMLHttpRequest so we can display progress
  function uploadFiles(list: File[]) {
    // filter client-side allowed types
    const videos = list.filter((f) => f.type.startsWith("video/"));
    if (videos.length === 0) {
      alert("Only video files are allowed.");
      return;
    }

    for (const file of videos) {
      if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
        const ok = confirm(`${file.name} is larger than ${formatBytes(MAX_CLIENT_UPLOAD_BYTES)} (client limit). Try upload anyway?`);
        if (!ok) continue;
      }
      doUpload(file);
    }
  }

  function doUpload(file: File) {
    const tempId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploading((s) => ({ ...s, [tempId]: 0 }));

    const form = new FormData();
    form.append("video", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/library", true);
    xhr.withCredentials = true; // ensure cookies are sent

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const percent = Math.round((evt.loaded / evt.total) * 100);
      setUploading((s) => ({ ...s, [tempId]: percent }));
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // success
        setUploading((s) => {
          const copy = { ...s };
          delete copy[tempId];
          return copy;
        });
        try {
          await fetchLibrary();
        } catch { }
      } else {
        // failure
        setUploading((s) => {
          const copy = { ...s };
          delete copy[tempId];
          return copy;
        });
        let msg = "Upload failed";
        try {
          const json = JSON.parse(xhr.responseText);
          msg = json?.error || msg;
        } catch { }
        alert(msg);
      }
    };

    xhr.onerror = () => {
      setUploading((s) => {
        const copy = { ...s };
        delete copy[tempId];
        return copy;
      });
      alert("Upload failed (network error)");
    };

    xhr.send(form);
  }

  const usedPercentage = (usedBytes / storageLimit) * 100;

  // UI states
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Library</h1>
          <p className="text-gray-600 mb-6">Please sign in to access your video library.</p>
          <LoginGate open={true} onClose={() => router.push("/")} />
        </div>
      </div>
    );
  }

  return (
    <AccountLayout>
      <div className="p-4 sm:p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Video Library</h1>
              <p className="text-gray-600 mt-1">Store and manage your video files</p>
            </div>

            <div className="flex items-center gap-3">
              <label
                onClick={openFilePicker}
                className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-purple-700 transition-colors cursor-pointer flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Video
              </label>
              <input ref={inputRef} type="file" accept="video/*" multiple onChange={handleFileInput} className="hidden" />
            </div>
          </div>

          {/* Storage Usage Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 rounded-lg p-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Storage Used</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatBytes(usedBytes)} <span className="text-gray-500 font-normal">/ {formatBytes(storageLimit)}</span>
                  </p>
                </div>
              </div>
              <span className={`text-sm font-medium ${usedPercentage > 80 ? "text-red-600" : "text-green-600"}`}>
                {(100 - usedPercentage).toFixed(1)}% free
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${usedPercentage > 80 ? "bg-red-500" : "bg-purple-600"}`}
                style={{ width: `${Math.min(usedPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* View Toggle & Upload Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`bg-white rounded-2xl shadow-lg p-6 mb-6 ${isDragging ? "border-2 border-dashed border-purple-500 bg-purple-50" : ""}`}
          >
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-600">{files.length} video{files.length !== 1 ? "s" : ""}</p>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-md transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-purple-600" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-purple-600" : "text-gray-500 hover:text-gray-700"}`}
                >
                  List
                </button>
              </div>
            </div>

            {/* Active uploads */}
            {Object.keys(uploading).length > 0 && (
              <div className="mb-4 space-y-2">
                {Object.entries(uploading).map(([id, pct]) => (
                  <div key={id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div className="h-2 rounded bg-purple-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 w-12 text-right">{pct}%</div>
                  </div>
                ))}
              </div>
            )}

            {/* Files display */}
            {files.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No videos in your library yet</p>
                <p className="text-sm text-gray-400 mt-1">Upload videos to get started</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map((f) => (
                  <div key={f.id} className="bg-gray-50 rounded-xl overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="aspect-video bg-gray-200 relative flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {f.duration_seconds != null && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                          {formatDuration(f.duration_seconds)}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-gray-900 truncate" title={f.filename}>{f.filename}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">{formatBytes(f.size_bytes)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Use in editor">
                            Use
                          </button>
                          <button onClick={() => handleDelete(f.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-4 py-3 group hover:bg-gray-50 px-2 rounded-lg transition-colors">
                    <div className="w-16 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{f.filename}</p>
                      <p className="text-xs text-gray-500">{formatBytes(f.size_bytes)} • {formatDate(f.created_at)}</p>
                    </div>
                    {f.duration_seconds != null && (
                      <span className="text-sm text-gray-500">{formatDuration(f.duration_seconds)}</span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Use in editor">
                        Use
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </AccountLayout>
  );

  // helper for duration
  function formatDuration(sec: number | null | undefined) {
    if (!sec && sec !== 0) return "";
    const s = Number(sec || 0);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  }
}
