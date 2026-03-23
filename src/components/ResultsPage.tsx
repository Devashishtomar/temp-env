"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import LoginGate from "./LoginGate";

interface Clip {
  start: number;
  end: number;
  title: string;
  description: string;
  filename: string;
  path: string;
  type?: "audio" | "video";
  hashtags?: string[];
  reason?: string;
}

interface Subtitle {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

interface Results {
  transcription: string;
  summary: string;
  clips: Clip[];
  contentType?: "music" | "movie" | "educational";
  lyricsEngagement?: any;
  aiModel?: string;
  processingTime?: number;
  sourceType?: "youtube" | "video";
  sourceUrl?: string;
  sourceProjectId?: number;
  hashtags?: string[];
}

interface ResultsPageProps {
  results: Results;
  onBack: () => void;
}

type PostAuthAction =
  | { type: "edit"; clipIndex: number }
  | { type: "download"; clipIndex: number }
  | null;

const RESULTS_CACHE_KEY = "evr.resultsCache.v1";
const POST_AUTH_ACTION_KEY = "evr.postAuthAction.v1";
const RETURN_TO_KEY = "evr.returnTo.v1";
const SCROLL_Y_KEY = "evr.scrollY.v1";

export default function ResultsPage({ results, onBack }: ResultsPageProps) {
  const { status } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    feedback: '',
    email: '',
    suggestions: ''
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Track saved clips and their states - using composite key: clipIndex_viewMode
  const [savedClips, setSavedClips] = useState<Set<string>>(new Set());
  const [clipEditStates, setClipEditStates] = useState<{ [key: number]: boolean }>({});
  // Track view mode for each clip (portrait or landscape) - default is portrait
  const [clipViewModes, setClipViewModes] = useState<{ [key: number]: 'portrait' | 'landscape' }>({});
  // Track processed video paths for each clip and view mode
  const [processedVideoPaths, setProcessedVideoPaths] = useState<{ [key: number]: string }>({});
  const [processingVideo, setProcessingVideo] = useState<{ [key: number]: boolean }>({});

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    const message = document.createElement("div");
    message.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-[200] font-semibold text-white ${type === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`;
    message.textContent = msg;
    document.body.appendChild(message);
    setTimeout(() => {
      if (document.body.contains(message)) document.body.removeChild(message);
    }, 4000);
  };

  // Load saved state from sessionStorage - specific to this results session
  useEffect(() => {
    if (!results?.sourceUrl) {
      // Reset state if no results
      setSavedClips(new Set<string>());
      setClipEditStates({});
      return;
    }

    try {
      // Create a unique key for this results session
      const resultsKey = `savedClips_${results.sourceUrl}`;
      const editKey = `clipEditStates_${results.sourceUrl}`;

      console.log('Loading saved state for video:', results.sourceUrl);
      console.log('Looking for keys:', resultsKey, editKey);

      const savedClipsData = sessionStorage.getItem(resultsKey);
      const editStatesData = sessionStorage.getItem(editKey);

      if (savedClipsData) {
        const parsed = JSON.parse(savedClipsData);
        // Handle both old format (numbers) and new format (strings like "0_portrait")
        if (Array.isArray(parsed)) {
          // Convert old format numbers to new format strings with default portrait
          const converted = parsed.map((idx: number) => `${idx}_portrait`);
          setSavedClips(new Set(converted));
        } else {
          setSavedClips(new Set(parsed));
        }
      } else {
        // Reset if no saved data for this video
        setSavedClips(new Set());
      }

      if (editStatesData) {
        setClipEditStates(JSON.parse(editStatesData));
      } else {
        // Reset if no edit data for this video
        setClipEditStates({});
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
      // Reset on error
      setSavedClips(new Set<string>());
      setClipEditStates({});
    }
  }, [results?.sourceUrl]);

  // persist results+page so we can restore after OAuth redirect
  useEffect(() => {
    try {
      sessionStorage.setItem(RESULTS_CACHE_KEY, JSON.stringify(results));
      sessionStorage.setItem(
        RETURN_TO_KEY,
        window.location.pathname + window.location.search + window.location.hash
      );
    } catch { }
  }, [results]);

  // if we come back authenticated with a pending action, replay it
  useEffect(() => {
    if (status !== "authenticated") return;
    const actionRaw = sessionStorage.getItem(POST_AUTH_ACTION_KEY);
    if (!actionRaw) return;

    const action = JSON.parse(actionRaw) as PostAuthAction;
    sessionStorage.removeItem(POST_AUTH_ACTION_KEY); // one-shot
    const y = sessionStorage.getItem(SCROLL_Y_KEY);
    if (y) {
      sessionStorage.removeItem(SCROLL_Y_KEY);
      // restore scroll after paint
      setTimeout(() => window.scrollTo(0, parseInt(y, 10) || 0), 0);
    }

    if (action?.type === "edit") {
      setShowVideoEditor(action.clipIndex);
    } else if (action?.type === "download") {
      handleDownload(results.clips[action.clipIndex], action.clipIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]); // runs when we return from Google

  // require auth for gated actions; remember what the user wanted
  const ensureAuthed = (action: PostAuthAction): boolean => {
    if (status !== "authenticated") {
      try {
        sessionStorage.setItem(POST_AUTH_ACTION_KEY, JSON.stringify(action));
        sessionStorage.setItem(SCROLL_Y_KEY, String(window.scrollY || 0));
        // results + returnTo were already saved in the effect above
      } catch { }
      setLoginOpen(true);
      return false;
    }
    return true;
  };


  // Handle clip editing - mark clip as edited
  const handleClipEdit = (clipIndex: number) => {
    const newEditStates = { ...clipEditStates, [clipIndex]: true };
    setClipEditStates(newEditStates);
    const editKey = `clipEditStates_${results.sourceUrl}`;
    sessionStorage.setItem(editKey, JSON.stringify(newEditStates));
  };

  const handleVideoEditorClose = () => {
    if (showVideoEditor !== null) {
      const newEditStates = { ...clipEditStates, [showVideoEditor]: true };
      setClipEditStates(newEditStates);
      const editKey = `clipEditStates_${results.sourceUrl}`;
      sessionStorage.setItem(editKey, JSON.stringify(newEditStates));
    }
    setShowVideoEditor(null);
    setHasUnsavedChanges(false);
  };

  // Process video to selected aspect ratio
  const processVideoAspect = async (clipIndex: number): Promise<string | null> => {
    const clip = results.clips[clipIndex];
    const viewMode = clipViewModes[clipIndex] || 'portrait';

    // Check if already processed for this view mode
    if (processedVideoPaths[clipIndex]) {
      return processedVideoPaths[clipIndex];
    }

    setProcessingVideo({ ...processingVideo, [clipIndex]: true });

    try {
      // Determine output path
      const basePath = editedVideoPaths[clipIndex] || clip.path;
      const pathParts = basePath.split('.');
      const extension = pathParts.pop();
      const outputPath = `${pathParts.join('.')}_${viewMode}.${extension}`;

      const response = await fetch('/api/process-video-aspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipPath: basePath,
          aspectRatio: viewMode,
          outputPath: outputPath
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process video');
      }

      const result = await response.json();
      setProcessedVideoPaths({ ...processedVideoPaths, [clipIndex]: result.outputPath });
      return result.outputPath;
    } catch (error) {
      console.error('Error processing video:', error);
      showToast(`Failed to process video: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return null;
    } finally {
      setProcessingVideo({ ...processingVideo, [clipIndex]: false });
    }
  };

  // Save individual clip to user's account
  const handleSaveIndividualClip = async (clip: Clip, clipIndex: number) => {
    if (!ensureAuthed({ type: "download", clipIndex: clipIndex })) return;

    setSaving(true);
    try {
      // Process video if view mode is set (not default portrait)
      let finalPath = editedVideoPaths[clipIndex] || clip.path;
      let finalFilename = editedVideoPaths[clipIndex] ? `edited_${clip.filename}` : clip.filename;

      // If view mode is explicitly set to landscape, or if it's not portrait (default), process it
      const viewMode = clipViewModes[clipIndex];
      if (viewMode === 'landscape' || (viewMode && viewMode !== 'portrait')) {
        const processedPath = await processVideoAspect(clipIndex);
        if (processedPath) {
          finalPath = processedPath;
          finalFilename = `${viewMode}_${finalFilename}`;
        }
      } else if (viewMode === 'portrait' && viewMode !== undefined) {
        // Process portrait version if explicitly set (to ensure it's permanently saved)
        const processedPath = await processVideoAspect(clipIndex);
        if (processedPath) {
          finalPath = processedPath;
          finalFilename = `portrait_${finalFilename}`;
        }
      }

      const response = await fetch('/api/user/save-individual-clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clip: {
            ...clip,
            path: finalPath,
            filename: finalFilename
          },
          clipIndex: clipIndex,
          results: results,
          sourceUrl: results.sourceType === 'youtube' ? 'YouTube Video' : 'Uploaded Video',
          sourceType: results.sourceType || 'video',
          sourceProjectId: results.sourceProjectId || null
        }),
      });

      if (response.ok) {
        // Mark clip as saved with current view mode
        const viewMode = clipViewModes[clipIndex] || 'portrait';
        const savedKey = `${clipIndex}_${viewMode}`;
        const newSavedClips = new Set([...savedClips, savedKey]);
        setSavedClips(newSavedClips);
        // Clear edit state for this clip
        const newEditStates = { ...clipEditStates, [clipIndex]: false };
        setClipEditStates(newEditStates);

        // Save to sessionStorage with video-specific keys
        const resultsKey = `savedClips_${results.sourceUrl}`;
        const editKey = `clipEditStates_${results.sourceUrl}`;
        sessionStorage.setItem(resultsKey, JSON.stringify([...newSavedClips]));
        sessionStorage.setItem(editKey, JSON.stringify(newEditStates));

        showToast('Clip saved to your account successfully!', 'success');
      } else {
        const error = await response.json();
        showToast(`Failed to save clip: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error saving clip:', error);
      showToast('Failed to save clip. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };


  // Feedback form handlers
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';

    // Entry IDs from Google Form (updated email ID)
    const ENTRY_FEEDBACK = 'entry.839337160';
    const ENTRY_EMAIL = 'entry.889551860'; // Updated email entry ID
    const ENTRY_SUGGESTIONS = 'entry.1510560057';

    const params = new URLSearchParams({
      [ENTRY_FEEDBACK]: feedbackForm.feedback || '',
      [ENTRY_EMAIL]: feedbackForm.email || '',
      [ENTRY_SUGGESTIONS]: feedbackForm.suggestions || '',
    });

    const submitUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse?${params.toString()}`;

    console.log('Submitting to:', submitUrl);

    // Create completely hidden iframe to submit silently (exact method from working sushi project)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = submitUrl;
    document.body.appendChild(iframe);

    // Clean up after submission
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch (e) { }
    }, 3000);

    // Show success message
    setFeedbackSubmitted(true);

    // Reset form after 3 seconds
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackOpen(false);
      setFeedbackForm({
        feedback: '',
        email: '',
        suggestions: ''
      });
    }, 3000);
  };

  const handleFeedbackChange = (field: string, value: any) => {
    setFeedbackForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState<number | null>(null);
  const [showSubtitleEditor, setShowSubtitleEditor] = useState<number | null>(null);
  const [showVideoEditor, setShowVideoEditor] = useState<number | null>(null);
  const [videoEdits, setVideoEdits] = useState<{ [k: number]: any }>({});
  const videoRef = useRef<HTMLVideoElement>(null);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<{ [clipIndex: number]: Subtitle[] }>({});
  const subtitleIdCounter = useRef(0);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);

  // Drag and drop state for subtitle positioning
  const [subtitlePosition, setSubtitlePosition] = useState<{ [clipIndex: number]: { x: number; y: number } }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentTimes, setCurrentTimes] = useState<{ [key: number]: number }>({});
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

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

  const addSubtitle = (clipIndex: number) => {
    setHasUnsavedChanges(true);
    const newSubtitle: Subtitle = {
      id: subtitleIdCounter.current++,
      startTime: '00:00',
      endTime: '00:03',
      text: '',
    };
    setSubtitles((prev) => ({
      ...prev,
      [clipIndex]: [...(prev[clipIndex] || []), newSubtitle],
    }));
  };

  const removeSubtitle = (clipIndex: number, subtitleId: number) => {
    setHasUnsavedChanges(true);
    setSubtitles((prev) => ({
      ...prev,
      [clipIndex]: (prev[clipIndex] || []).filter((s) => s.id !== subtitleId),
    }));
  };

  const updateSubtitle = (clipIndex: number, subtitleId: number, field: keyof Subtitle, value: string) => {
    setHasUnsavedChanges(true);
    setSubtitles((prev) => ({
      ...prev,
      [clipIndex]: (prev[clipIndex] || []).map((s) =>
        s.id === subtitleId ? { ...s, [field]: value } : s
      ),
    }));
  };

  const getCurrentSubtitle = (clipIndex: number): Subtitle | null => {
    const clipSubtitles = subtitles[clipIndex] || [];
    for (const sub of clipSubtitles) {
      const start = parseTimeToSeconds(sub.startTime);
      const end = parseTimeToSeconds(sub.endTime);
      if (currentVideoTime >= start && currentVideoTime < end) {
        return sub;
      }
    }
    return null;
  };

  const getClientCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const ev = e as any;
    if (ev.touches && ev.touches.length > 0) {
      return { clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY };
    }
    if (ev.changedTouches && ev.changedTouches.length > 0) {
      return { clientX: ev.changedTouches[0].clientX, clientY: ev.changedTouches[0].clientY };
    }
    // Mouse event
    return { clientX: ev.clientX, clientY: ev.clientY };
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, clipIndex: number) => {
    e.preventDefault();
    setIsDragging(true);

    const { clientX, clientY } = getClientCoords(e);

    const currentPos = subtitlePosition[clipIndex] || { x: 50, y: 85 };

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: clientX - (rect.left + (currentPos.x / 100) * rect.width),
        y: clientY - (rect.top + (currentPos.y / 100) * rect.height),
      });
    }
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent, clipIndex: number) => {
    if (!isDragging || !containerRef.current) return;

    const { clientX, clientY } = getClientCoords(e);

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - dragOffset.x - rect.left) / rect.width) * 100;
    const y = ((clientY - dragOffset.y - rect.top) / rect.height) * 100;

    setSubtitlePosition((prev) => ({
      ...prev,
      [clipIndex]: {
        x: Math.max(5, Math.min(95, x)),
        y: Math.max(5, Math.min(95, y)),
      },
    }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setHasUnsavedChanges(true);
  };

  const handleVideoEdit = (clipIndex: number, edits: any) => {
    setHasUnsavedChanges(true);
    setVideoEdits((prev) => ({
      ...prev,
      [clipIndex]: edits,
    }));
  };

  const [editedVideoPaths, setEditedVideoPaths] = useState<{ [k: number]: string }>({});
  const [savingClipIndex, setSavingClipIndex] = useState<number | null>(null);

  const saveVideoEdits = async (clipIndex: number) => {
    // Prevent multiple simultaneous saves
    if (savingClipIndex !== null) {
      return;
    }

    setSavingClipIndex(clipIndex);
    try {
      const clip = results.clips[clipIndex];
      const outputPath = clip.path.replace(".mp4", "_edited.mp4");

      // Show loading message
      const loadingMessage = document.createElement("div");
      loadingMessage.className =
        "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      loadingMessage.textContent = "Saving video edits...";
      document.body.appendChild(loadingMessage);

      const clipSubtitles = subtitles[clipIndex] || [];
      const payload = {
        timing: videoEdits[clipIndex]?.timing || {},
        effects: videoEdits[clipIndex]?.effects || {},
        subtitles: clipSubtitles.map(s => ({
          start: parseTimeToSeconds(s.startTime),
          end: parseTimeToSeconds(s.endTime),
          text: s.text,
        })),
        subtitleStyle: {
          fontName: videoEdits[clipIndex]?.subtitleStyle?.fontFamily || videoEdits[clipIndex]?.subtitleStyle?.fontName || "Arial",
          fontSize: typeof videoEdits[clipIndex]?.subtitleStyle?.fontSize === "number"
            ? videoEdits[clipIndex].subtitleStyle.fontSize
            : (videoEdits[clipIndex]?.subtitleStyle?.fontSize ? Number(videoEdits[clipIndex].subtitleStyle.fontSize) : 24),
          color: videoEdits[clipIndex]?.subtitleStyle?.color || "#FFFFFF",
          bold: videoEdits[clipIndex]?.subtitleStyle?.fontWeight === "bold" ? true : false,
          italic: videoEdits[clipIndex]?.subtitleStyle?.fontStyle === "italic" ? true : false,
          alignment: typeof videoEdits[clipIndex]?.subtitleStyle?.alignment === "number"
            ? videoEdits[clipIndex].subtitleStyle.alignment
            : undefined,
          marginV: typeof videoEdits[clipIndex]?.subtitleStyle?.marginV === "number"
            ? videoEdits[clipIndex].subtitleStyle.marginV
            : undefined,
          overlayX: subtitlePosition?.[clipIndex]?.x ?? 50,
          overlayY: subtitlePosition?.[clipIndex]?.y ?? 85,
        },
      };

      const response = await fetch("/api/edit-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipPath: clip.path,
          edits: payload,
          outputPath,
        }),
      });

      // Remove loading message
      document.body.removeChild(loadingMessage);

      if (!response.ok) {
        const errorData = await response.json();
        // Don't expose any error details or codes to users
        throw new Error('An error occurred. Please try again.');
      }

      const result = await response.json();
      console.log('Video edit result:', result);
      console.log('Setting editedVideoPaths for clipIndex:', clipIndex, 'outputPath:', result.outputPath);

      setEditedVideoPaths((prev) => ({ ...prev, [clipIndex]: result.outputPath }));

      // Clear the old aspect ratio cache so the new edited video is forced to process
      setProcessedVideoPaths((prev) => {
        const newPaths = { ...prev };
        delete newPaths[clipIndex];
        return newPaths;
      });

      handleVideoEditorClose();

      // Show success message
      const message = document.createElement("div");
      message.className =
        "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-semibold";
      message.textContent = "✅ Video edited successfully!";
      document.body.appendChild(message);
      setTimeout(() => {
        if (document.body.contains(message)) {
          document.body.removeChild(message);
        }
      }, 4000);

    } catch (error) {
      console.error("Error editing video:", error);
      // Show generic error message - no technical details or error codes
      const message = document.createElement("div");
      message.className =
        "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-semibold";
      message.textContent = "❌ An error occurred. Please try again.";
      document.body.appendChild(message);
      setTimeout(() => {
        if (document.body.contains(message)) {
          document.body.removeChild(message);
        }
      }, 5000);
    } finally {
      // Re-enable button after save completes (success or error)
      setSavingClipIndex(null);
    }
  };

  const handleDownload = async (clip: Clip, clipIndex?: number) => {
    if (clipIndex === undefined) return;

    try {
      const loadingMessage = document.createElement("div");
      loadingMessage.className =
        "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      loadingMessage.textContent = `Preparing download for ${clip.title}...`;
      document.body.appendChild(loadingMessage);

      // Process video if view mode is set
      let finalPath = editedVideoPaths[clipIndex] || clip.path;
      let finalFilename = editedVideoPaths[clipIndex] ? `edited_${clip.filename}` : clip.filename;

      const viewMode = clipViewModes[clipIndex];
      if (viewMode === 'landscape' || (viewMode && viewMode !== 'portrait')) {
        const processedPath = await processVideoAspect(clipIndex);
        if (processedPath) {
          finalPath = processedPath;
          finalFilename = `${viewMode}_${finalFilename}`;
        }
      } else if (viewMode === 'portrait' && viewMode !== undefined) {
        // Process portrait version if explicitly set
        const processedPath = await processVideoAspect(clipIndex);
        if (processedPath) {
          finalPath = processedPath;
          finalFilename = `portrait_${finalFilename}`;
        }
      }

      const response = await fetch(
        `/api/download?file=${encodeURIComponent(finalPath)}&filename=${encodeURIComponent(
          finalFilename
        )}`,
        { method: "HEAD" }
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const link = document.createElement("a");
      link.href = `/api/download?file=${encodeURIComponent(finalPath)}&filename=${encodeURIComponent(
        finalFilename
      )}`;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      document.body.removeChild(loadingMessage);
      const successMessage = document.createElement("div");
      successMessage.className =
        "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      successMessage.textContent = `Downloading ${clip.title}...`;
      document.body.appendChild(successMessage);
      setTimeout(() => {
        if (document.body.contains(successMessage)) document.body.removeChild(successMessage);
      }, 3000);
    } catch (error) {
      console.error("Download error:", error);
      const loadingMessage = document.querySelector(".fixed.top-4.right-4.bg-blue-500");
      if (loadingMessage) document.body.removeChild(loadingMessage as Element);

      const errorMessage = document.createElement("div");
      errorMessage.className =
        "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      errorMessage.textContent = `Download failed: ${error instanceof Error ? error.message : "Unknown error"
        }`;
      document.body.appendChild(errorMessage);
      setTimeout(() => {
        if (document.body.contains(errorMessage)) document.body.removeChild(errorMessage);
      }, 5000);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getContentTypeInfo = () => {
    switch (results.contentType) {
      case "music":
        return {
          title: "Music Video Analysis",
          subtitle: "Viral music moments and catchy hooks",
          icon: "🎵",
          summaryTitle: "Music Analysis",
        };
      case "movie":
        return {
          title: "Movie/TV Show Highlights",
          subtitle: "Dramatic and viral-worthy scenes",
          icon: "🎬",
          summaryTitle: "Entertainment Highlights",
        };
      default:
        return {
          title: "Your Shorts Are Ready!",
          subtitle: "Educational content optimized for social media",
          icon: "📚",
          summaryTitle: "Video Summary",
        };
    }
  };

  const contentTypeInfo = getContentTypeInfo();

  function parseSubtitles(subs: string) {
    const lines = subs.split(/\r?\n/);
    const result: { start: number; end: number; text: string }[] = [];
    let i = 0;
    while (i < lines.length) {
      if (/^\d{2}:\d{2}:\d{2}/.test(lines[i])) {
        const [start, , end] = lines[i].split(/\s*-\s*/);
        const text = lines[i + 1] || "";
        const toSec = (t: string) => {
          const [h, m, s] = t.split(":").map(Number);
          return h * 3600 + m * 60 + s;
        };
        result.push({ start: toSec(start), end: toSec(end), text });
        i += 3;
      } else {
        i++;
      }
    }
    return result;
  }

  return (
    <div className="min-h-screen bg-[#f3f8fa] relative overflow-hidden pt-20">
      {/* Background shapes */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#b6e0f7]/40 blur-3xl rounded-full z-0" />
      <div className="absolute bottom-[-10%] right-1/2 translate-x-1/2 w-[500px] h-[250px] bg-[#f7b6e0]/30 blur-3xl rounded-full z-0" />

      <div className="relative z-10 w-full px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg bg-white/60 backdrop-blur-md border border-white/30 text-[#222] font-medium hover:bg-white/80 transition"
            >
              ← Back to Upload
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">{contentTypeInfo.icon}</span>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#222]">{contentTypeInfo.title}</h1>
          </div>
          <p className="text-lg text-[#666] mb-4">{contentTypeInfo.subtitle}</p>
          <div className="flex items-center justify-center gap-4 text-sm text-[#666]">
            <span>Powered by {results.aiModel || "AI"}</span>
            <span>•</span>
            <span>Processing time: {((results.processingTime || 0) / 1000).toFixed(1)}s</span>
            {results.contentType && (
              <>
                <span>•</span>
                <span className="capitalize bg-gradient-to-r from-[#b6e0f7] to-[#f7b6e0] px-2 py-1 rounded-full text-xs font-medium">
                  {results.contentType} content
                </span>
              </>
            )}
            {results.sourceType && (
              <>
                <span>•</span>
                <span className="capitalize">{results.sourceType} source</span>
              </>
            )}
          </div>
        </div>

        {/* Summary and Transcription Cards */}
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-white/60 shadow-2xl backdrop-blur-lg border border-white/30">
            <h2 className="text-xl font-semibold text-[#222] mb-3">{contentTypeInfo.summaryTitle}</h2>
            <p className="text-[#444] leading-relaxed">{results.summary}</p>
          </div>

          <div className="p-6 rounded-3xl bg-white/60 shadow-2xl backdrop-blur-lg border border-white/30">
            <h2 className="text-xl font-semibold text-[#222] mb-3">Full Transcription</h2>
            <div className="max-h-48 overflow-y-auto">
              <p className="text-[#444] leading-relaxed text-sm">{results.transcription}</p>
            </div>
          </div>
        </div>

        {/* Music analysis */}
        {results.contentType === "music" && results.lyricsEngagement && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#222] mb-6 text-center">🎵 Lyrics Engagement Analysis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {Object.entries(results.lyricsEngagement).map(([category, items]: [string, any]) => (
                <div
                  key={category}
                  className="p-4 rounded-2xl bg-gradient-to-br from-[#7b2ff2]/80 to-[#f357a8]/80 shadow-xl border border-white/30 text-white"
                >
                  <h3 className="font-semibold mb-3 capitalize text-lg text-white/90">
                    {category.replace(/([A-Z])/g, " $1").trim()}
                  </h3>
                  <div className="space-y-2">
                    {Array.isArray(items) &&
                      items.slice(0, 3).map((item: any, index: number) => (
                        <div key={index} className="p-2 rounded-lg bg-white/20">
                          <div className="text-xs text-white/80 mb-1">
                            {Math.floor(item.start)}s - {Math.floor(item.end)}s
                          </div>
                          <div className="text-sm font-medium mb-1">&quot;{item.text?.substring(0, 50)}...&quot;</div>
                          <div className="text-xs text-white/70">{item.reason}</div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hashtags */}
        {results.hashtags && results.hashtags.length > 0 && (
          <div className="mb-10 flex flex-col items-center">
            <h3 className="text-xl font-bold text-[#222] mb-3">Suggested Hashtags</h3>
            <div className="flex flex-wrap gap-2 justify-center mb-2">
              {results.hashtags.map((tag: string, idx: number) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full bg-gradient-to-r from-[#b6e0f7] to-[#f7b6e0] text-[#222] font-medium text-sm shadow-md cursor-pointer select-all"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <button
              className="px-4 py-2 rounded-lg bg-[#7b2ff2] text-white font-semibold shadow hover:bg-[#6228d7] transition"
              onClick={() => {
                if (results.hashtags) {
                  navigator.clipboard.writeText(results.hashtags.map((t: string) => `#${t}`).join(" "));
                }
              }}
            >
              Copy All Hashtags
            </button>
          </div>
        )}

        {/* Clips */}
        <div className="space-y-8 mb-8">
          {results.clips.map((clip, index) => (
            <div
              key={index}
              className="flex flex-col md:flex-row gap-6 p-6 rounded-3xl bg-white/60 shadow-2xl backdrop-blur-lg border border-white/30"
            >
              {/* Left: player - fixed container width */}
              <div className="w-full md:w-[420px] flex-shrink-0">
                {/* View mode toggle buttons */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      // Clear processed path when switching modes to force reprocessing
                      setProcessedVideoPaths(prev => {
                        const newPaths = { ...prev };
                        delete newPaths[index];
                        return newPaths;
                      });
                      // Change view mode - saved state will naturally reset if this combo isn't saved
                      setClipViewModes({ ...clipViewModes, [index]: 'portrait' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${(clipViewModes[index] || 'portrait') === 'portrait'
                      ? 'bg-[#7b2ff2] text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    disabled={processingVideo[index]}
                  >
                    📱 Portrait
                  </button>
                  <button
                    onClick={() => {
                      // Clear processed path when switching modes to force reprocessing
                      setProcessedVideoPaths(prev => {
                        const newPaths = { ...prev };
                        delete newPaths[index];
                        return newPaths;
                      });
                      // Change view mode - saved state will naturally reset if this combo isn't saved
                      setClipViewModes({ ...clipViewModes, [index]: 'landscape' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${clipViewModes[index] === 'landscape'
                      ? 'bg-[#7b2ff2] text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    disabled={processingVideo[index]}
                  >
                    🖥️ Landscape
                  </button>
                </div>
                {/* Video container - dynamically changes aspect ratio based on selection */}
                <div
                  className={`relative rounded-2xl overflow-hidden bg-black transition-all duration-300 ${(clipViewModes[index] || 'portrait') === 'portrait' ? 'aspect-[9/16]' : 'aspect-[16/9]'
                    }`}
                  style={{
                    aspectRatio: (clipViewModes[index] || 'portrait') === 'portrait' ? '9/16' : '16/9'
                  }}
                >
                  <video
                    key={`${index}-${clipViewModes[index] || 'portrait'}`}
                    src={`/api/stream?file=${encodeURIComponent(editedVideoPaths[index] || clip.path)}`}
                    className="absolute inset-0 w-full h-full"
                    style={{
                      objectFit: 'cover',
                      objectPosition: 'center'
                    }}
                    controls
                    onPlay={() => setPlayingIndex(index)}
                    onPause={() => setPlayingIndex(null)}
                  />
                  {processingVideo[index] && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-white text-sm">Processing...</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: details */}
              <div className="flex-grow space-y-4">
                <h3 className="text-xl font-semibold text-[#222]">{clip.title || `Clip ${index + 1}`}</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-[#666] bg-white/50 p-2 rounded-lg">
                      <span>Duration:</span>
                      <span className="font-medium">{formatTime(clip.end - clip.start)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-[#666] bg-white/50 p-2 rounded-lg">
                      <span>Start Time:</span>
                      <span className="font-medium">{formatTime(clip.start)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-[#666] bg-white/50 p-2 rounded-lg">
                      <span>End Time:</span>
                      <span className="font-medium">{formatTime(clip.end)}</span>
                    </div>
                  </div>

                  <div className="bg-white/50 p-3 rounded-lg">
                    <h4 className="text-sm font-medium text-[#666] mb-2">Description</h4>
                    <p className="text-sm text-[#444]">{clip.description || clip.reason || "No description available"}</p>
                  </div>
                </div>

                {clip.hashtags && clip.hashtags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-[#666] mb-2">Hashtags</h4>
                    <div className="flex flex-wrap gap-2">
                      {clip.hashtags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-full bg-gradient-to-r from-[#b6e0f7] to-[#f7b6e0] text-[#222] text-sm font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      if (!ensureAuthed({ type: "edit", clipIndex: index })) return;
                      handleClipEdit(index);
                      setShowVideoEditor(index);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-[#7b2ff2] text-white font-medium hover:bg-[#6228d7] transition"
                  >
                    Edit Video
                  </button>
                  <button
                    onClick={() => {
                      if (!ensureAuthed({ type: "download", clipIndex: index })) return;
                      handleDownload(clip, index);
                    }}
                    className="px-4 py-2.5 rounded-lg bg-[#222] text-white font-medium hover:bg-[#333] transition"
                  >
                    Download
                  </button>
                  {status === "authenticated" && (
                    <>
                      {(() => {
                        const viewMode = clipViewModes[index] || 'portrait';
                        const savedKey = `${index}_${viewMode}`;
                        return savedClips.has(savedKey) && !clipEditStates[index];
                      })() ? (
                        <button
                          disabled
                          className="px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium cursor-not-allowed"
                        >
                          ✅ Saved
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSaveIndividualClip(clip, index)}
                          disabled={saving}
                          className="px-4 py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving ? 'Saving...' : '💾 Save Original Clip to My Clips'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video editor modal */}
      {showVideoEditor !== null && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div
            className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto flex flex-row relative"
            style={{ minHeight: 600 }}
          >
            <button
              onClick={() => {
                if (hasUnsavedChanges) setShowCloseConfirm(true);
                else handleVideoEditorClose();
              }}
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
                  src={`/api/stream?file=${encodeURIComponent(results.clips[showVideoEditor].path)}`}
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

                <div className="space-y-4 max-h-[450px] overflow-y-auto">
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
                            onClick={() => { if (showVideoEditor !== null) removeSubtitle(showVideoEditor, subtitle.id); }}
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
                              onChange={(e) => { if (showVideoEditor !== null) updateSubtitle(showVideoEditor, subtitle.id, 'startTime', e.target.value); }}
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

              <div className="mt-8 flex flex-col w-full space-y-4">
                {/* Permanent Change Warning */}
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    <strong>Important:</strong> You can only edit a video once. Once you save these changes, subtitles and styling will be permanently embedded into the video and cannot be altered later.
                  </p>
                </div>

                <div className="flex flex-row items-center justify-end space-x-4 w-full">
                  <button
                    onClick={() => setShowSaveConfirm(true)}
                    disabled={savingClipIndex === showVideoEditor}
                    className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${savingClipIndex === showVideoEditor
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-[#7b2ff2] text-white hover:bg-[#6228d7]'
                      }`}
                  >
                    {savingClipIndex === showVideoEditor ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Feedback Button */}
      <button
        onClick={() => setFeedbackOpen(true)}
        className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-[90] flex items-center gap-2"
        title="Share Feedback"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="font-medium">Feedback</span>
      </button>

      {/* Feedback Modal */}
      {feedbackOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            {feedbackSubmitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Thank You!</h3>
                <p className="text-gray-600">Your feedback has been submitted successfully.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">Share Your Feedback</h3>
                  <button
                    onClick={() => setFeedbackOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                  {/* Feedback */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      What did you think of the results?
                    </label>
                    <textarea
                      value={feedbackForm.feedback}
                      onChange={(e) => handleFeedbackChange('feedback', e.target.value)}
                      placeholder="Tell us about your experience..."
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                      rows={3}
                    />
                  </div>

                  {/* Email (required) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={feedbackForm.email}
                      onChange={(e) => handleFeedbackChange('email', e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  {/* Suggestions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Suggestions for improvement
                    </label>
                    <textarea
                      value={feedbackForm.suggestions}
                      onChange={(e) => handleFeedbackChange('suggestions', e.target.value)}
                      placeholder="Any ideas to make this better?"
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                      rows={2}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setFeedbackOpen(false)}
                      className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      Submit Feedback
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Unsaved Changes</h3>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">You have unsaved edits. Are you sure you want to close? Your changes will be discarded.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowCloseConfirm(false);
                  handleVideoEditorClose();
                }}
                className="px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition font-medium text-sm"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Save</h3>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">Are you sure you want to save these edits? Once saved, subtitles are permanently burned into the video and cannot be changed.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSaveConfirm(false);
                  if (showVideoEditor !== null) saveVideoEdits(showVideoEditor);
                }}
                className="px-4 py-2 rounded-xl bg-[#7b2ff2] text-white hover:bg-[#6228d7] transition font-medium text-sm"
              >
                Yes, Save Edits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login popup */}
      <LoginGate open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

