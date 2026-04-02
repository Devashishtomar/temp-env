"use client";
import { useRef, useState, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';
import { useSession } from "next-auth/react";
import { useLogin } from "./LoginManager";
import LibraryModal from "./LibraryModal";
import { useSnackbar } from "@/providers/SnackbarProvider";

interface UploadAreaProps {
  onProcessing: (data: any) => void;
  platform: string;
  aiModel: string;
}

export default function UploadArea({ onProcessing, platform, aiModel }: UploadAreaProps) {
  const snackbar = useSnackbar();
  const [selectedPlatform, setSelectedPlatform] = useState(platform);
  const [selectedAIModel, setSelectedAIModel] = useState(aiModel);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingCompleteRef = useRef(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // error state removed in favor of snackbar
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Ready to upload");
  const [remainingTime, setRemainingTime] = useState(0);
  const [minClipLength, setMinClipLength] = useState<number | ''>('');
  const [maxClipLength, setMaxClipLength] = useState<number | ''>('');
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [keywords, setKeywords] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryVideoName, setLibraryVideoName] = useState<string | null>(null);
  const [libraryVideoId, setLibraryVideoId] = useState<string | null>(null);
  const [clipCount, setClipCount] = useState<number | ''>('');
  const { status } = useSession();
  const { openLogin } = useLogin();

  useEffect(() => {
    if (!isProcessing) {
      setProgressPercent(0);
      setProgressStatus('Ready to upload');
      setRemainingTime(0);
    }
  }, [isProcessing]);


  // Check if a user clicked "Use" from the Library page
  useEffect(() => {
    const useId = sessionStorage.getItem("evr.useLibraryId");
    const useName = sessionStorage.getItem("evr.useLibraryName");

    if (useId && useName) {
      // Set the video in the upload area
      setLibraryVideoId(useId);
      setLibraryVideoName(useName);

      // Clean up the memory so it doesn't get stuck in a loop if they refresh
      sessionStorage.removeItem("evr.useLibraryId");
      sessionStorage.removeItem("evr.useLibraryName");
    }
  }, []);

  // --- NEW: Restore Form Draft after Login ---
  useEffect(() => {
    try {
      const draftStr = sessionStorage.getItem("evr.uploadDraft.v1");
      if (draftStr) {
        const draft = JSON.parse(draftStr);

        if (draft.platform) setSelectedPlatform(draft.platform);
        if (draft.aiModel) setSelectedAIModel(draft.aiModel);
        if (draft.youtubeUrl) setYoutubeUrl(draft.youtubeUrl);
        if (draft.minClipLength) setMinClipLength(draft.minClipLength);
        if (draft.maxClipLength) setMaxClipLength(draft.maxClipLength);
        if (draft.manualStart) setManualStart(draft.manualStart);
        if (draft.manualEnd) setManualEnd(draft.manualEnd);
        if (draft.keywords) setKeywords(draft.keywords);
        if (draft.clipCount) setClipCount(draft.clipCount);
        if (draft.libraryVideoId) setLibraryVideoId(draft.libraryVideoId);
        if (draft.libraryVideoName) setLibraryVideoName(draft.libraryVideoName);

        // If they had advanced settings saved, keep the menu open
        if (draft.minClipLength || draft.maxClipLength || draft.manualStart || draft.manualEnd || draft.keywords || draft.clipCount) {
          setShowAdvanced(true);
        }

        // Wipe the draft so it doesn't persist on normal page reloads
        sessionStorage.removeItem("evr.uploadDraft.v1");
      }
    } catch (e) {
      console.error("Error restoring upload draft:", e);
    }
  }, []);

  // Auto-clear: When file is selected, clear URL and library
  useEffect(() => {
    if (selectedFile) {
      setYoutubeUrl('');
      setLibraryVideoId(null);
      setLibraryVideoName(null);
    }
  }, [selectedFile]);

  // Auto-clear: When YouTube URL is entered, clear file and library
  useEffect(() => {
    if (youtubeUrl) {
      setSelectedFile(null);
      setLibraryVideoId(null);
      setLibraryVideoName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [youtubeUrl]);

  // Auto-clear: When library video is selected, clear file and URL
  useEffect(() => {
    if (libraryVideoId) {
      setSelectedFile(null);
      setYoutubeUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [libraryVideoId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('video/')) {
        snackbar.error("Please select a valid video file");
      } else if (file.size > MAX_FILE_SIZE) {
        snackbar.error("File is too large. Maximum size is 100MB.");
      } else {
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('video/')) {
        snackbar.error("Please select a valid video file");
        e.target.value = ''; // Reset input
      } else if (file.size > MAX_FILE_SIZE) {
        snackbar.error("File is too large. Maximum size is 100MB.");
        e.target.value = ''; // Reset input
      } else {
        setSelectedFile(file);
      }
    }
  };

  const handleSubmit = async () => {
    if (status === "unauthenticated") {
      try {
        sessionStorage.setItem("evr.returnTo.v1", typeof window !== "undefined" ? window.location.href : "/");
        sessionStorage.setItem("evr.shouldRedirect.v1", "true");

        const draft = {
          platform: selectedPlatform,
          aiModel: selectedAIModel,
          youtubeUrl,
          minClipLength,
          maxClipLength,
          manualStart,
          manualEnd,
          keywords,
          clipCount,
          libraryVideoId,
          libraryVideoName,
        };
        sessionStorage.setItem("evr.uploadDraft.v1", JSON.stringify(draft));

        if (selectedFile) {
          snackbar.success("Please log in to continue. (Note: You will need to re-select your local file after logging in).");
        }
      } catch (e) {
        console.error("Error setting session storage:", e);
      }
      openLogin();
      return;
    }
    if (!selectedFile && !youtubeUrl && !libraryVideoId) {
      snackbar.error("Please upload a video file, select a library video, or paste a YouTube URL");
      return;
    }

    // Validate YouTube URL format
    if (youtubeUrl) {
      try {
        // Basic format check
        const trimmedUrl = youtubeUrl.trim();
        const hasYoutubeDomain = trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be');

        if (!hasYoutubeDomain) {
          snackbar.error("Error 303: Invalid URL");
          return;
        }

        // Try to create a URL object to validate format
        try {
          new URL(trimmedUrl);
        } catch (urlError) {
          snackbar.error("Error 303: Invalid URL");
          return;
        }
      } catch (error) {
        snackbar.error("Error 303: Invalid URL");
        return;
      }
    }

    // Add helpful message for YouTube URLs
    if (youtubeUrl) {
      console.log("Processing YouTube URL:", youtubeUrl);
    }

    setIsProcessing(true);
    // Generate a sessionId immediately and use it for polling
    const tempSessionId = uuidv4();
    setSessionId(tempSessionId);


    const formData = new FormData();
    if (libraryVideoId) {
      formData.append('libraryId', libraryVideoId);
    } else if (selectedFile) {
      formData.append('video', selectedFile);
    }
    if (youtubeUrl) {
      formData.append('youtubeUrl', youtubeUrl);
    }
    formData.append('platform', selectedPlatform);
    formData.append('aiModel', selectedAIModel);
    if (minClipLength) formData.append('minClipLength', String(minClipLength));
    if (maxClipLength) formData.append('maxClipLength', String(maxClipLength));
    if (manualStart) formData.append('manualStart', manualStart);
    if (manualEnd) formData.append('manualEnd', manualEnd);
    if (clipCount) formData.append('clipCount', String(clipCount));
    if (keywords) formData.append('keywords', keywords);
    // Pass the sessionId to the backend
    formData.append('sessionId', tempSessionId);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        setSessionId(null);

        // Use personalized error message if available
        if (errorData?.error) {
          snackbar.error(errorData.error);
          setIsProcessing(false);
          return;
        }

        // Legacy fallback for old error format
        snackbar.error('❌ An unexpected error occurred. Please try again.');
        setIsProcessing(false);
        return;
      }

      const result = await response.json();
      // Save results and redirect
      processingCompleteRef.current = true;
      onProcessing(result);
    } catch (error) {
      console.error('Error processing video:', error);

      // Generic network error handling
      snackbar.error('❌ Network error. Please check your connection and try again.');
      setSessionId(null);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full">
      {/* Processing Modal */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 flex flex-col items-center w-full max-w-sm border border-purple-500/30">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
              <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>

            {/* Dynamic Title based on whether they uploaded a file or pasted a link */}
            <div className="text-xl font-bold text-white mb-3 text-center">
              {selectedFile ? "Uploading & Processing..." : "Processing Your Video"}
            </div>

            {/* Helpful warning message for local uploads */}
            {selectedFile && (
              <p className="text-sm text-gray-400 text-center font-medium leading-relaxed">
                Please wait while your file uploads securely to our servers. <br />
                <span className="text-purple-400 mt-1 block">This may take a few minutes on slower connections. Do not close this window.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Upload Your Video</h2>
          <p className="text-gray-400 text-sm">Transform your content into viral shorts</p>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer ${dragActive
            ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/25'
            : 'border-gray-600 hover:border-purple-500 hover:bg-white/5'
            }`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload video file"
        >
          {selectedFile ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-white font-medium text-sm block mb-2">{selectedFile.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                type="button"
                aria-label="Remove selected file"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Drag & drop your video here</p>
                <p className="text-gray-400 text-sm">or click to browse files (max 100MB)</p>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* YouTube URL Section */}
        <div className="relative">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste YouTube URL (only YouTube links allowed)"
            className="w-full p-4 bg-white/5 border border-gray-600 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-white placeholder-gray-400 backdrop-blur-sm"
          />
          {youtubeUrl && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
              <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <svg width="12" height="12" fill="white" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <button
                onClick={() => setYoutubeUrl('')}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                type="button"
              >
                Clear
              </button>
            </div>
          )}
        </div>


        {/* Library Button */}
        <button
          onClick={() => setShowLibrary(true)}
          className="w-full p-4 bg-white/5 border border-gray-600 rounded-xl hover:border-purple-500 hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-3 group"
          type="button"
        >
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="text-gray-300 font-medium">
            {libraryVideoId ? (
              <span className="text-purple-400">Selected: {libraryVideoName}</span>
            ) : (
              "Choose from Library"
            )}
          </span>
          {libraryVideoId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLibraryVideoName(null);
                setLibraryVideoId(null);
              }}
              className="ml-2 text-xs text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          )}
        </button>



        {/* Platform Selection */}
        <div>
          <p className="text-sm mb-3 text-gray-300 font-medium">Choose Platform</p>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'youtube'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-gray-600'
                }`}
              onClick={() => setSelectedPlatform('youtube')}
              type="button"
            >
              YouTube Shorts
            </button>
            <button
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'instagram'
                ? 'bg-gradient-to-r from-pink-500 to-yellow-500 text-white shadow-lg shadow-pink-500/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-gray-600'
                }`}
              onClick={() => setSelectedPlatform('instagram')}
              type="button"
            >
              Instagram
            </button>
            {/*             <button
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'tiktok'
                ? 'bg-black text-white shadow-lg shadow-black/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-gray-600'
                }`}
              onClick={() => setSelectedPlatform('tiktok')}
              type="button"
            >
              TikTok
            </button> */}
          </div>
        </div>

        {/* AI Model Selection */}
        <div>
          <p className="text-sm mb-3 text-gray-300 font-medium">AI Engine</p>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${selectedAIModel === 'openai'
                ? 'bg-green-600 text-white shadow-lg shadow-green-500/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-gray-600'
                }`}
              onClick={() => setSelectedAIModel('openai')}
              type="button"
            >
              GPT-4
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${selectedAIModel === 'groq'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-gray-600'
                }`}
              onClick={() => setSelectedAIModel('groq')}
              type="button"
            >
              Groq
            </button>
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 font-medium transition-colors text-sm"
            type="button"
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced Options
          </button>
        </div>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-gray-600/50 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Min Length (sec)</label>
                <input
                  type="number"
                  value={minClipLength}
                  onChange={(e) => setMinClipLength(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Auto (15s)"
                  min="5"
                  max="120"
                  className="w-full px-3 py-2 bg-white/5 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none text-sm text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Max Length (sec)</label>
                <input
                  type="number"
                  value={maxClipLength}
                  onChange={(e) => setMaxClipLength(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Auto (60s)"
                  min="10"
                  max="300"
                  className="w-full px-3 py-2 bg-white/5 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none text-sm text-white placeholder-gray-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Keywords (Optional)</label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Enter keywords to focus on..."
                  className="w-full px-3 py-2 bg-white/5 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none text-sm text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Number of Clips (Optional)</label>
                <input
                  type="number"
                  value={clipCount}
                  onChange={(e) => setClipCount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Auto"
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 bg-white/5 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none text-sm text-white placeholder-gray-400"
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isProcessing || (!selectedFile && !youtubeUrl && !libraryVideoId)}
          className={`w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white py-4 rounded-xl font-semibold text-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 ${isProcessing || (!selectedFile && !youtubeUrl && !libraryVideoId) ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-[1.02]'
            }`}
          type="button"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <span className="mr-2">🚀</span>
              Generate Viral Shorts
            </div>
          )}
        </button>
      </div>

      {/* Library Modal */}
      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelect={(video: any) => {
          const displayName = video?.filename ?? video?.name ?? "video";
          setLibraryVideoName(displayName);
          setLibraryVideoId(video?.id ?? null);
          console.log("Selected video from library:", video);
          setShowLibrary(false);
        }}
      />
    </div >
  );
} 
