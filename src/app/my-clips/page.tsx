/* eslint-disable @next/next/no-img-element */
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import LoginGate from "@/components/LoginGate";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";
import AccountLayout from "@/components/AccountLayout";


function safeDate(raw?: string | null) {
  if (!raw) return "Unknown";

  let d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toLocaleDateString();

  try {
    const iso = raw.replace(' ', 'T') + 'Z';
    d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  } catch (e) {

  }

  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    const dOnly = new Date(dateOnlyMatch[1] + 'T00:00:00Z');
    if (!isNaN(dOnly.getTime())) return dOnly.toLocaleDateString();
  }

  return "Unknown";
}

interface Clip {
  id: number;
  filename: string;
  file_path: string;
  start_time: number;
  end_time: number;
  title: string;
  description: string;
  thumbnail_path?: string;
  created_at: string;
}

interface Project {
  id: number;
  title: string;
  source_url: string;
  source_type: string;
  thumbnail_path?: string;
  clip_count: number;
  created_at: string;
  clips: Clip[];
}

type PostAuthAction =
  | { type: "edit"; clipId: number }
  | { type: "download"; clipId: number }
  | null;

interface Subtitle {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export default function MyClipsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

  // Handle post-login redirection
  usePostLoginRedirect();

  // Video editor state
  const [showVideoEditor, setShowVideoEditor] = useState<number | null>(null);
  const [subtitles, setSubtitles] = useState<{ [clipId: number]: Subtitle[] }>({});
  const [videoEdits, setVideoEdits] = useState<{ [clipId: number]: any }>({});
  const [editedVideoPaths, setEditedVideoPaths] = useState<{ [clipId: number]: string }>({});
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [savingClipId, setSavingClipId] = useState<number | null>(null);
  const [savingEditsClipId, setSavingEditsClipId] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Drag and drop state for subtitle positioning
  const [subtitlePosition, setSubtitlePosition] = useState<{ [clipId: number]: { x: number; y: number } }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const subtitleIdCounter = useRef(0);
  // Helper function to detect view mode from filename or file path
  const detectViewModeFromFilename = (filename: string, filePath?: string): 'portrait' | 'landscape' => {
    const lowerFilename = filename.toLowerCase();
    const lowerPath = filePath?.toLowerCase() || '';

    // Check both filename and file path for landscape indicator
    if (lowerFilename.includes('landscape_') || lowerPath.includes('landscape_')) {
      return 'landscape';
    }
    // Default to portrait if no landscape indicator found
    return 'portrait';
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
    } else if (status === "unauthenticated") {
      setLoading(false);
      setShowLogin(true);
    }
  }, [status]);

  // Handle post-auth actions (same as ResultsPage)
  useEffect(() => {
    if (status !== "authenticated") return;
    const actionRaw = sessionStorage.getItem("evr.postAuthAction.v1");
    if (!actionRaw) return;

    const action = JSON.parse(actionRaw) as PostAuthAction;
    sessionStorage.removeItem("evr.postAuthAction.v1"); // one-shot
    const y = sessionStorage.getItem("evr.scrollY.v1");
    if (y) {
      sessionStorage.removeItem("evr.scrollY.v1");
      setTimeout(() => window.scrollTo(0, parseInt(y, 10) || 0), 0);
    }

    if (action?.type === "edit") {
      setShowVideoEditor(action.clipId);
    } else if (action?.type === "download") {
      handleDownloadClipById(action.clipId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/user/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Authentication helper (same as ResultsPage)
  const ensureAuthed = (action: PostAuthAction): boolean => {
    if (status !== "authenticated") {
      try {
        sessionStorage.setItem("evr.postAuthAction.v1", JSON.stringify(action));
        sessionStorage.setItem("evr.scrollY.v1", String(window.scrollY || 0));
        sessionStorage.setItem("evr.returnTo.v1", window.location.pathname + window.location.search + window.location.hash);
      } catch { }
      setShowLogin(true);
      return false;
    }
    return true;
  };

  // Helper to find clip by ID across all projects
  const findClipById = (clipId: number): Clip | null => {
    for (const project of projects) {
      const clip = project.clips.find(c => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  };

  // Subtitle management functions
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return Number(timeStr) || 0;
  };

  const addSubtitle = (clipId: number) => {
    const newSubtitle: Subtitle = {
      id: subtitleIdCounter.current++,
      startTime: '00:00',
      endTime: '00:03',
      text: '',
    };
    setSubtitles((prev) => ({
      ...prev,
      [clipId]: [...(prev[clipId] || []), newSubtitle],
    }));
  };

  const removeSubtitle = (clipId: number, subtitleId: number) => {
    setSubtitles((prev) => ({
      ...prev,
      [clipId]: (prev[clipId] || []).filter((s) => s.id !== subtitleId),
    }));
  };

  const updateSubtitle = (clipId: number, subtitleId: number, field: keyof Subtitle, value: string) => {
    setSubtitles((prev) => ({
      ...prev,
      [clipId]: (prev[clipId] || []).map((s) =>
        s.id === subtitleId ? { ...s, [field]: value } : s
      ),
    }));
  };

  const getCurrentSubtitle = (clipId: number | null): Subtitle | null => {
    if (clipId === null) return null;
    const clipSubtitles = subtitles[clipId] || [];
    for (const sub of clipSubtitles) {
      const start = parseTimeToSeconds(sub.startTime);
      const end = parseTimeToSeconds(sub.endTime);
      if (currentVideoTime >= start && currentVideoTime < end) {
        return sub;
      }
    }
    return null;
  };


  // Drag handlers for subtitle positioning
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, clipId: number) => {
    e.preventDefault();
    setIsDragging(true);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentPos = subtitlePosition[clipId] || { x: 50, y: 85 };

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: clientX - (rect.left + (currentPos.x / 100) * rect.width),
        y: clientY - (rect.top + (currentPos.y / 100) * rect.height),
      });
    }
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent, clipId: number) => {
    if (!isDragging || !containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - dragOffset.x - rect.left) / rect.width) * 100;
    const y = ((clientY - dragOffset.y - rect.top) / rect.height) * 100;

    setSubtitlePosition((prev) => ({
      ...prev,
      [clipId]: {
        x: Math.max(5, Math.min(95, x)),
        y: Math.max(5, Math.min(95, y)),
      },
    }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleVideoEdit = (clipId: number, edits: any) => {
    setVideoEdits((prev) => ({
      ...prev,
      [clipId]: edits,
    }));
  };

  const handleVideoEditorClose = () => {
    setShowVideoEditor(null);
  };


  // Video editing functions (adapted from ResultsPage)
  const saveVideoEdits = async (clipId: number) => {
    // Prevent multiple simultaneous saves
    if (savingClipId !== null) {
      return;
    }

    const clip = findClipById(clipId);
    if (!clip) return;

    setSavingClipId(clipId);
    try {
      const outputPath = clip.file_path.replace(/\.[^/.]+$/, "_edited.mp4");

      // Show loading message
      const loadingMessage = document.createElement("div");
      loadingMessage.className = "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      loadingMessage.textContent = "Saving video edits...";
      document.body.appendChild(loadingMessage);

      // Create payload with subtitles + global subtitle style and position
      const clipSubtitles = subtitles[clipId] || [];
      const payload = {
        timing: videoEdits[clipId]?.timing || {},
        effects: videoEdits[clipId]?.effects || {},
        subtitles: clipSubtitles.map(s => ({
          start: parseTimeToSeconds(s.startTime),
          end: parseTimeToSeconds(s.endTime),
          text: s.text,
        })),
        // Global subtitle style (read from videoEdits UI)
        subtitleStyle: {
          fontName: videoEdits[clipId]?.subtitleStyle?.fontFamily || videoEdits[clipId]?.subtitleStyle?.fontName || "Arial",
          fontSize: typeof videoEdits[clipId]?.subtitleStyle?.fontSize === "number"
            ? videoEdits[clipId].subtitleStyle.fontSize
            : (videoEdits[clipId]?.subtitleStyle?.fontSize ? Number(videoEdits[clipId].subtitleStyle.fontSize) : 24),
          color: videoEdits[clipId]?.subtitleStyle?.color || "#FFFFFF",
          bold: videoEdits[clipId]?.subtitleStyle?.fontWeight === "bold" ? true : false,
          italic: videoEdits[clipId]?.subtitleStyle?.fontStyle === "italic" ? true : false,
          alignment: typeof videoEdits[clipId]?.subtitleStyle?.alignment === "number"
            ? videoEdits[clipId].subtitleStyle.alignment
            : undefined,
          marginV: typeof videoEdits[clipId]?.subtitleStyle?.marginV === "number"
            ? videoEdits[clipId].subtitleStyle.marginV
            : undefined,
          overlayX: subtitlePosition?.[clipId]?.x ?? null,
          overlayY: subtitlePosition?.[clipId]?.y ?? null,
        },
      };


      const response = await fetch("/api/edit-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipPath: clip.file_path,
          edits: payload,
          outputPath,
        }),
      });

      // Remove loading message
      document.body.removeChild(loadingMessage);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to edit video");
      }

      const result = await response.json();
      setEditedVideoPaths(prev => ({ ...prev, [clipId]: result.outputPath }));
      handleVideoEditorClose();

      // Show success message
      const successMessage = document.createElement("div");
      successMessage.className = "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      successMessage.textContent = "Video edited successfully! Click 'Save Edits' to make changes permanent.";
      document.body.appendChild(successMessage);
      setTimeout(() => {
        if (document.body.contains(successMessage)) document.body.removeChild(successMessage);
      }, 4000);

    } catch (error) {
      console.error("Error saving video edits:", error);
      const errorMessage = document.createElement("div");
      errorMessage.className = "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      errorMessage.textContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      document.body.appendChild(errorMessage);
      setTimeout(() => {
        if (document.body.contains(errorMessage)) document.body.removeChild(errorMessage);
      }, 5000);
    } finally {
      // Re-enable button after save completes (success or error)
      setSavingClipId(null);
    }
  };

  const handleEditClip = (clip: Clip) => {
    if (!ensureAuthed({ type: "edit", clipId: clip.id })) return;

    // Initialize subtitles array for this clip if missing
    setSubtitles((prev) => {
      if (prev[clip.id]) return prev;
      const initial: { [k: number]: Subtitle[] } = { ...prev };
      initial[clip.id] = []; // start empty; optionally load from clip metadata if available
      return initial;
    });

    // Initialize subtitle position to default if missing
    setSubtitlePosition((prev) => {
      if (prev[clip.id]) return prev;
      return { ...prev, [clip.id]: { x: 50, y: 85 } };
    });

    // Ensure subtitleIdCounter is ahead of any existing ids (if there were saved subtitles)
    const existing = subtitles[clip.id] || [];
    if (existing.length > 0) {
      const maxId = existing.reduce((m, s) => Math.max(m, s.id), 0);
      subtitleIdCounter.current = Math.max(subtitleIdCounter.current, maxId + 1);
    }

    setShowVideoEditor(clip.id);
  };


  const handleDownloadClip = async (clip: Clip) => {
    if (!ensureAuthed({ type: "download", clipId: clip.id })) return;
    await handleDownloadClipById(clip.id);
  };

  // Save edited clip permanently to database
  const saveEditsPermanently = async (clipId: number) => {
    if (savingEditsClipId !== null) {
      return;
    }

    const clip = findClipById(clipId);
    if (!clip) return;

    const editedPath = editedVideoPaths[clipId];
    if (!editedPath) {
      const errorMessage = document.createElement("div");
      errorMessage.className = "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      errorMessage.textContent = "No edits to save. Please edit the clip first.";
      document.body.appendChild(errorMessage);
      setTimeout(() => {
        if (document.body.contains(errorMessage)) document.body.removeChild(errorMessage);
      }, 3000);
      return;
    }

    setSavingEditsClipId(clipId);
    try {
      // Show loading message
      const loadingMessage = document.createElement("div");
      loadingMessage.className = "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      loadingMessage.textContent = "Saving edits permanently...";
      document.body.appendChild(loadingMessage);

      const response = await fetch("/api/user/update-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: clipId,
          editedFilePath: editedPath,
        }),
      });

      // Remove loading message
      document.body.removeChild(loadingMessage);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save edits");
      }

      // Remove from editedVideoPaths since it's now the permanent file
      setEditedVideoPaths(prev => {
        const newPaths = { ...prev };
        delete newPaths[clipId];
        return newPaths;
      });

      // Refresh projects to show updated clip
      await fetchProjects();

      // Show success message
      const successMessage = document.createElement("div");
      successMessage.className = "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      successMessage.textContent = "Edits saved permanently!";
      document.body.appendChild(successMessage);
      setTimeout(() => {
        if (document.body.contains(successMessage)) document.body.removeChild(successMessage);
      }, 3000);

    } catch (error) {
      console.error("Error saving edits permanently:", error);
      const errorMessage = document.createElement("div");
      errorMessage.className = "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      errorMessage.textContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      document.body.appendChild(errorMessage);
      setTimeout(() => {
        if (document.body.contains(errorMessage)) document.body.removeChild(errorMessage);
      }, 5000);
    } finally {
      setSavingEditsClipId(null);
    }
  };

  const handleDownloadClipById = async (clipId: number) => {
    const clip = findClipById(clipId);
    if (!clip) return;

    try {
      // Show loading message
      const loadingMessage = document.createElement("div");
      loadingMessage.className = "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      loadingMessage.textContent = `Preparing download for ${clip.title}...`;
      document.body.appendChild(loadingMessage);

      // Use the saved clip file path directly (already in correct format)
      let finalPath = editedVideoPaths[clipId] || clip.file_path;
      let finalFilename = editedVideoPaths[clipId] ? `edited_${clip.filename}` : clip.filename;

      const response = await fetch(
        `/api/download?file=${encodeURIComponent(finalPath)}&filename=${encodeURIComponent(finalFilename)}`,
        { method: "HEAD" }
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      // Create download link
      const link = document.createElement("a");
      link.href = `/api/download?file=${encodeURIComponent(finalPath)}&filename=${encodeURIComponent(finalFilename)}`;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Remove loading message and show success
      document.body.removeChild(loadingMessage);
      const successMessage = document.createElement("div");
      successMessage.className = "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      successMessage.textContent = `Downloading ${clip.title}...`;
      document.body.appendChild(successMessage);
      setTimeout(() => {
        if (document.body.contains(successMessage)) document.body.removeChild(successMessage);
      }, 3000);
    } catch (error) {
      console.error("Download error:", error);
      const errorMessage = document.createElement("div");
      errorMessage.className = "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      errorMessage.textContent = `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      document.body.appendChild(errorMessage);
      setTimeout(() => {
        if (document.body.contains(errorMessage)) document.body.removeChild(errorMessage);
      }, 5000);
    }
  };

  const handleBackToResults = () => {
    // Check if we have cached results to restore
    const cachedResults = sessionStorage.getItem('evr.resultsCache.v1');
    if (cachedResults) {
      // Navigate to results page with cached data
      router.push('/results');
    } else {
      // No cached results, go to homepage to start fresh
      router.push('/');
    }
  };

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your clips...</p>
        </div>
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoginGate
          open={true}
          onClose={() => router.push('/')}
        />
      </div>
    );
  }

  return (
    <AccountLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Clips</h1>
            <p className="text-gray-600 mt-2">Manage and download your created clips</p>
          </div>
          <button
            onClick={handleBackToResults}
            className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            Back to Results
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No clips yet</h3>
              <p className="text-gray-600 mb-6">Create your first clips by processing a video or YouTube URL.</p>
              <button
                onClick={() => router.push('/')}
                className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
              >
                Create Clips
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {projects.filter(project => project.clips.length > 0).map((project) => (
              <div key={project.id} className="space-y-6">
                {/* Project Header - Clickable */}
                <div
                  className="bg-white/60 backdrop-blur-lg rounded-2xl p-6 shadow-lg border border-white/30 cursor-pointer hover:bg-white/70 transition-all duration-200"
                  onClick={() => toggleProject(project.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-bold text-gray-900">{project.title}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {expandedProjects.has(project.id) ? 'Click to collapse' : 'Click to expand'}
                          </span>
                          <svg
                            className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${expandedProjects.has(project.id) ? 'rotate-180' : ''
                              }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-gray-600 mt-2">
                        {project.source_type === 'youtube' ? 'YouTube Video' : 'Uploaded Video'} •
                        {safeDate(project.created_at)} •
                        {project.clip_count} clips
                      </p>
                    </div>
                    {project.thumbnail_path && (
                      <img
                        src={`/api/thumbnails/${project.thumbnail_path.replace(/\\/g, '/').replace(/.*uploads\//, '')}`}
                        alt={project.title}
                        className="w-20 h-20 rounded-xl object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Clips - Results Page Style - Collapsible */}
                {expandedProjects.has(project.id) && (
                  <div className="space-y-6">
                    {project.clips.map((clip) => {
                      // Detect view mode from filename and file path
                      const viewMode = detectViewModeFromFilename(clip.filename, clip.file_path);

                      return (
                        <div
                          key={clip.id}
                          className={`flex flex-col md:flex-row gap-6 p-6 rounded-3xl bg-white/60 shadow-2xl backdrop-blur-lg border border-white/30 ${viewMode === 'portrait'
                            ? 'md:max-w-none'
                            : 'md:max-w-6xl'
                            }`}
                        >
                          {/* Left: Video Player - responsive width based on detected view mode */}
                          <div className={`flex-shrink-0 ${viewMode === 'portrait'
                            ? 'w-full md:w-[320px]'
                            : 'w-full md:w-[560px]'
                            }`}>
                            {/* Video container - aspect ratio based on detected saved format */}
                            <div
                              className={`relative rounded-2xl overflow-hidden bg-black transition-all duration-300 ${viewMode === 'portrait' ? 'aspect-[9/16]' : 'aspect-[16/9]'
                                }`}
                              style={{
                                aspectRatio: viewMode === 'portrait' ? '9/16' : '16/9'
                              }}
                            >
                              <video
                                key={clip.id}
                                src={`/api/stream?file=${encodeURIComponent(
                                  editedVideoPaths[clip.id] || clip.file_path
                                )}`}
                                className="absolute inset-0 w-full h-full"
                                style={{
                                  objectFit: 'cover',
                                  objectPosition: 'center'
                                }}
                                controls
                              />
                            </div>
                          </div>

                          {/* Right: Details */}
                          <div className="flex-grow space-y-4">
                            <h3 className="text-xl font-semibold text-gray-900">{clip.title}</h3>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                  <span>Duration:</span>
                                  <span className="font-medium">{Math.round(clip.end_time - clip.start_time)}s</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                  <span>Start Time:</span>
                                  <span className="font-medium">{Math.round(clip.start_time)}s</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                  <span>End Time:</span>
                                  <span className="font-medium">{Math.round(clip.end_time)}s</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                  <span>File:</span>
                                  <span className="font-medium text-xs truncate">{clip.filename}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                  <span>Created:</span>
                                  <span className="font-medium">{safeDate(clip.created_at)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-white/50 p-4 rounded-xl">
                              <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                              <p className="text-sm text-gray-700">{clip.description}</p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-3">
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleEditClip(clip)}
                                  className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-600 transition-colors"
                                >
                                  Edit Clip
                                </button>
                                <button
                                  onClick={() => handleDownloadClip(clip)}
                                  className="flex-1 bg-green-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-600 transition-colors"
                                >
                                  Download
                                </button>
                              </div>
                              {editedVideoPaths[clip.id] && (
                                <button
                                  onClick={() => saveEditsPermanently(clip.id)}
                                  disabled={savingEditsClipId === clip.id}
                                  className={`w-full px-6 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${savingEditsClipId === clip.id
                                    ? 'bg-gray-400 text-white cursor-not-allowed'
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                    }`}
                                >
                                  {savingEditsClipId === clip.id ? (
                                    <>
                                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      Saving...
                                    </>
                                  ) : (
                                    'Save Edits'
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Video editor modal */}
        {showVideoEditor !== null && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <div
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto flex flex-row relative"
              style={{ minHeight: 600 }}
            >
              <button
                onClick={() => setShowVideoEditor(null)}
                className="absolute top-4 right-4 p-2 bg-gray-200 rounded-full hover:bg-gray-300 z-50"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex-1 flex flex-col items-center justify-center pr-8">
                <div
                  ref={containerRef}
                  className="relative w-full max-w-[420px] aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-xl mb-4 flex items-center justify-center"
                  style={{ touchAction: "none" }}
                  onMouseMove={(e) => { if (showVideoEditor !== null) handleDragMove(e, showVideoEditor); }}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                  onTouchMove={(e) => { if (showVideoEditor !== null) handleDragMove(e, showVideoEditor); }}
                  onTouchEnd={handleDragEnd}
                >
                  <video
                    ref={videoRef}
                    src={`/api/stream?file=${encodeURIComponent(findClipById(showVideoEditor)?.file_path || '')}`}
                    className="w-full h-full object-contain"
                    controls
                    onTimeUpdate={(e) => setCurrentVideoTime(e.currentTarget.currentTime)}
                  />

                  {/* Display current subtitle - draggable */}
                  {getCurrentSubtitle(showVideoEditor) && (
                    <div
                      className="absolute px-4 py-2 rounded-lg select-none"
                      style={{
                        left: `${subtitlePosition[showVideoEditor]?.x ?? 50}%`,
                        top: `${subtitlePosition[showVideoEditor]?.y ?? 85}%`,
                        transform: "translate(-50%, -50%)",
                        cursor: isDragging ? "grabbing" : "grab",
                        background: "rgba(0,0,0,0.7)",
                        color: videoEdits[showVideoEditor]?.subtitleStyle?.color || "#fff",
                        fontSize: videoEdits[showVideoEditor]?.subtitleStyle?.fontSize || 24,
                        fontFamily: videoEdits[showVideoEditor]?.subtitleStyle?.fontFamily || "Arial",
                        fontWeight: videoEdits[showVideoEditor]?.subtitleStyle?.fontWeight || "normal",
                        fontStyle: videoEdits[showVideoEditor]?.subtitleStyle?.fontStyle || "normal",
                        textShadow: "0 2px 8px #000",
                        whiteSpace: "pre-line",
                        textAlign: "center",
                        maxWidth: "90%",
                        animation:
                          videoEdits[showVideoEditor]?.subtitleStyle?.animation === "fade in"
                            ? "fadeIn 1s"
                            : videoEdits[showVideoEditor]?.subtitleStyle?.animation === "slide up"
                              ? "slideUp 1s"
                              : videoEdits[showVideoEditor]?.subtitleStyle?.animation === "pop in"
                                ? "popIn 0.7s"
                                : videoEdits[showVideoEditor]?.subtitleStyle?.animation === "bounce"
                                  ? "bounce 1s"
                                  : "none",
                        zIndex: 10,
                      }}
                      onMouseDown={(e) => { if (showVideoEditor !== null) handleDragStart(e, showVideoEditor); }}
                      onTouchStart={(e) => { if (showVideoEditor !== null) handleDragStart(e, showVideoEditor); }}
                    >
                      {getCurrentSubtitle(showVideoEditor)?.text}
                    </div>
                  )}
                </div>
                <p className="text-sm text-[#666]">Preview (9:16) - Drag subtitle to reposition</p>
              </div>

              <div className="w-full max-w-md flex flex-col space-y-6 overflow-y-auto max-h-[80vh]">
                {/* Subtitles Section */}
                <div className="bg-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[#222]">Subtitles</h3>
                    <button
                      onClick={() => { if (showVideoEditor !== null) addSubtitle(showVideoEditor); }}
                      className="px-4 py-2 bg-[#7b2ff2] text-white rounded-lg hover:bg-[#6228d7] transition text-sm font-medium"
                    >
                      + Add Subtitle
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto">
                    {(subtitles[showVideoEditor] || []).length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4">
                        No subtitles added. Click &quot;Add Subtitle&quot; to create one.
                      </p>
                    ) : (
                      (subtitles[showVideoEditor] || []).map((subtitle, index) => (
                        <div key={subtitle.id} className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">Subtitle {index + 1}</span>
                            <button
                              onClick={() => removeSubtitle(showVideoEditor, subtitle.id)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Start Time (mm:ss)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-[#7b2ff2] focus:ring-1 focus:ring-[#7b2ff2] text-[#222] bg-white text-sm"
                                value={subtitle.startTime}
                                onChange={(e) => updateSubtitle(showVideoEditor, subtitle.id, 'startTime', e.target.value)}
                                placeholder="00:00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">End Time (mm:ss)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-[#7b2ff2] focus:ring-1 focus:ring-[#7b2ff2] text-[#222] bg-white text-sm"
                                value={subtitle.endTime}
                                onChange={(e) => updateSubtitle(showVideoEditor, subtitle.id, 'endTime', e.target.value)}
                                placeholder="00:03"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Text</label>
                            <textarea
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-[#7b2ff2] focus:ring-1 focus:ring-[#7b2ff2] text-[#222] bg-white text-sm"
                              rows={2}
                              value={subtitle.text}
                              onChange={(e) => updateSubtitle(showVideoEditor, subtitle.id, 'text', e.target.value)}
                              placeholder="Enter subtitle text..."
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Font Style Section */}
                <div className="bg-gray-100 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-[#222] mb-4">Subtitle Style</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#222] mb-2">Font Size</label>
                        <input
                          type="number"
                          className="w-full px-4 py-2 rounded-lg border border-gray-400 text-[#222] bg-white"
                          value={videoEdits[showVideoEditor]?.subtitleStyle?.fontSize || 24}
                          onChange={(e) =>
                            handleVideoEdit(showVideoEditor, {
                              ...videoEdits[showVideoEditor],
                              subtitleStyle: {
                                ...videoEdits[showVideoEditor]?.subtitleStyle,
                                fontSize: parseInt(e.target.value),
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#222] mb-2">Font Color</label>
                        <input
                          type="color"
                          className="w-full h-10 rounded-lg border border-gray-400"
                          value={videoEdits[showVideoEditor]?.subtitleStyle?.color || "#ffffff"}
                          onChange={(e) =>
                            handleVideoEdit(showVideoEditor, {
                              ...videoEdits[showVideoEditor],
                              subtitleStyle: {
                                ...videoEdits[showVideoEditor]?.subtitleStyle,
                                color: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#222] mb-2">Font Family</label>
                      <select
                        className="w-full px-4 py-2 rounded-lg border border-gray-400 text-[#222] bg-white"
                        value={videoEdits[showVideoEditor]?.subtitleStyle?.fontFamily || "Arial"}
                        onChange={(e) =>
                          handleVideoEdit(showVideoEditor, {
                            ...videoEdits[showVideoEditor],
                            subtitleStyle: {
                              ...videoEdits[showVideoEditor]?.subtitleStyle,
                              fontFamily: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="Arial">Arial</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                      </select>
                    </div>
                    <div className="flex gap-4">
                      <button
                        className={`flex-1 px-4 py-2 rounded-lg border ${videoEdits[showVideoEditor]?.subtitleStyle?.fontWeight === "bold"
                          ? "bg-[#7b2ff2] text-white"
                          : "border-gray-400 text-[#222] bg-white"
                          }`}
                        onClick={() =>
                          handleVideoEdit(showVideoEditor, {
                            ...videoEdits[showVideoEditor],
                            subtitleStyle: {
                              ...videoEdits[showVideoEditor]?.subtitleStyle,
                              fontWeight:
                                videoEdits[showVideoEditor]?.subtitleStyle?.fontWeight === "bold"
                                  ? "normal"
                                  : "bold",
                            },
                          })
                        }
                      >
                        Bold
                      </button>
                      <button
                        className={`flex-1 px-4 py-2 rounded-lg border ${videoEdits[showVideoEditor]?.subtitleStyle?.fontStyle === "italic"
                          ? "bg-[#7b2ff2] text-white"
                          : "border-gray-400 text-[#222] bg-white"
                          }`}
                        onClick={() =>
                          handleVideoEdit(showVideoEditor, {
                            ...videoEdits[showVideoEditor],
                            subtitleStyle: {
                              ...videoEdits[showVideoEditor]?.subtitleStyle,
                              fontStyle:
                                videoEdits[showVideoEditor]?.subtitleStyle?.fontStyle === "italic"
                                  ? "normal"
                                  : "italic",
                            },
                          })
                        }
                      >
                        Italic
                      </button>
                    </div>
                  </div>
                </div>

                {/* Animations Section */}
                <div className="bg-gray-100 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-[#222] mb-4">Animations</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {["Fade In", "Slide Up", "Pop In", "Bounce"].map((animation) => (
                      <button
                        key={animation}
                        className={`px-4 py-2 rounded-lg border ${videoEdits[showVideoEditor]?.subtitleStyle?.animation === animation.toLowerCase()
                          ? "bg-[#7b2ff2] text-white"
                          : "border-gray-400 text-[#222] bg-white"
                          } transition`}
                        onClick={() =>
                          handleVideoEdit(showVideoEditor, {
                            ...videoEdits[showVideoEditor],
                            subtitleStyle: {
                              ...videoEdits[showVideoEditor]?.subtitleStyle,
                              animation:
                                videoEdits[showVideoEditor]?.subtitleStyle?.animation === animation.toLowerCase()
                                  ? "none"
                                  : animation.toLowerCase(),
                            },
                          })
                        }
                      >
                        {animation}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex flex-row items-center justify-end space-x-4 w-full">
                  <button
                    onClick={() => saveVideoEdits(showVideoEditor)}
                    disabled={savingClipId === showVideoEditor}
                    className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${savingClipId === showVideoEditor
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-[#7b2ff2] text-white hover:bg-[#6228d7]'
                      }`}
                  >
                    {savingClipId === showVideoEditor ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login popup */}
        <LoginGate open={showLogin} onClose={() => setShowLogin(false)} />
      </div>
    </AccountLayout>
  );
}

