"use client";
import { useState, useEffect } from "react";

interface LibraryVideo {
  id: string;
  filename: string;
  stored_path?: string;
  thumbnail?: string | null;
  duration_seconds?: number | null;
  size_bytes?: number | null;
  created_at?: string | null;
}

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (video: LibraryVideo) => void;
}

export default function LibraryModal({ isOpen, onClose, onSelect }: LibraryModalProps) {
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [selectedVideo, setSelectedVideo] = useState<LibraryVideo | null>(null);
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch("/api/library", { method: "GET", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const items = (data?.videos || []).map((v: any) => ({
          id: String(v.id),
          filename: v.filename ?? v.name ?? "video",
          stored_path: v.stored_path,
          thumbnail: v.thumbnail_path ?? null,
          duration_seconds: v.duration_seconds ?? null,
          size_bytes: v.size_bytes ?? null,
          created_at: v.created_at ?? null,
        }));
        setVideos(items);
      })
      .catch((err: any) => {
        console.error("Library fetch error:", err);
        if (!mounted) return;
        setError(String(err?.message ?? err));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const humanSize = (b?: number) => {
    if (b == null) return "";
    const kb = b / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${Math.round(mb)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const humanDuration = (s?: number) => {
    if (s == null) return "";
    const sec = Math.round(s);
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  };

  const handleSelect = (video: LibraryVideo) => {
    console.log("LibraryModal: clicked video", video.id, video.filename);
    setSelectedVideo(selectedVideo?.id === video.id ? null : video);
  };

  const handleOpen = () => {
    console.log("LibraryModal: handleOpen, selectedVideo =", selectedVideo);
    if (selectedVideo) {
      try {
        onSelect(selectedVideo);
        console.log("LibraryModal: onSelect called with", selectedVideo.id);
      } catch (e) {
        console.error("LibraryModal: onSelect threw", e);
      }
      onClose();
    } else {
      console.warn("LibraryModal: Open pressed but no video selected");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">My Library</h2>
              <p className="text-xs text-gray-400">Select a video from your library</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode("card")}
                className={`p-2 rounded-md transition-colors ${viewMode === "card" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Card
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                List
              </button>
            </div>

            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-56">
              <div className="text-gray-400">Loading library…</div>
            </div>
          ) : error ? (
            <div className="text-red-400 p-4">{error}</div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="text-sm">No videos in your library</p>
              <p className="text-xs mt-1">Add videos from your account library page</p>
            </div>
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => handleSelect(video)}
                  className={`group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 ${selectedVideo?.id === video.id ? "border-purple-500 ring-2 ring-purple-500/30" : "border-gray-700 hover:border-gray-600"}`}
                >
                  <div className="aspect-video bg-gray-800 relative flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                      {humanDuration(video.duration_seconds ?? undefined)}
                    </div>
                    {selectedVideo?.id === video.id && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-gray-800">
                    <p className="text-white text-sm font-medium truncate">{video.filename}</p>
                    <p className="text-gray-400 text-xs mt-1">{humanSize(video.size_bytes ?? undefined)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {videos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => handleSelect(video)}
                  className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 ${selectedVideo?.id === video.id ? "bg-purple-500/20 border border-purple-500" : "bg-gray-800 border border-transparent hover:bg-gray-750"}`}
                >
                  <div className="w-24 h-14 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 relative">
                    <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {humanDuration(video.duration_seconds ?? undefined)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{video.filename}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{humanSize(video.size_bytes ?? undefined)} • {video.created_at ? new Date(video.created_at).toLocaleDateString() : ""}</p>
                  </div>
                  {selectedVideo?.id === video.id && (
                    <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          <p className="text-sm text-gray-400">{selectedVideo ? `Selected: ${selectedVideo.filename}` : "Select a video to continue"}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm font-medium">Cancel</button>
            <button
              onClick={handleOpen}
              disabled={!selectedVideo}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${selectedVideo ? "bg-gradient-to-r from-purple-600 to-pink-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
