/* eslint-disable @next/next/no-img-element */
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginGate from "@/components/LoginGate";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";
import { v4 as uuidv4 } from 'uuid';
import AccountLayout from "@/components/AccountLayout";

interface Project {
  id: number;
  title: string;
  source_url: string;
  source_type: string;
  thumbnail_path?: string;
  clip_count: number;
  created_at: string;
}

export default function MyProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  // Handle post-login redirection
  usePostLoginRedirect();
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [selectedPlatform, setSelectedPlatform] = useState('youtube');
  const [selectedAIModel, setSelectedAIModel] = useState('openai');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minClipLength, setMinClipLength] = useState(15);
  const [maxClipLength, setMaxClipLength] = useState(60);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ percent: 0, message: '' });
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
    } else if (status === "unauthenticated") {
      setLoading(false);
      setShowLogin(true);
    }
  }, [status]);

  // Simple timeout redirect (no polling needed)
  useEffect(() => {
    if (isGenerating) {
      // Set a timeout to redirect after processing (2 minutes should be enough)
      const timeoutId = setTimeout(() => {
        console.log('Processing timeout reached, redirecting to results...');
        setIsGenerating(false);
        setSessionId(null);
        setProgress({ percent: 0, message: '' });
        // Redirect to results page
        router.push('/results');
      }, 2 * 60 * 1000); // 2 minutes

      return () => clearTimeout(timeoutId);
    }
  }, [isGenerating, router]);

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

  const handleGenerateClips = async (project: Project) => {
    setIsGenerating(true);
    setError("");
    // Generate a sessionId immediately and use it for polling
    const tempSessionId = uuidv4();
    setSessionId(tempSessionId);

    try {
      // Create form data for the API (same as homepage)
      const formData = new FormData();

      // Add the original video file
      const response = await fetch(`/api/download?file=${encodeURIComponent(project.source_url)}&filename=${encodeURIComponent(project.title)}`);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], `${project.title}.mp4`, { type: 'video/mp4' });
        formData.append('video', file);
      }

      // Add all the same parameters as homepage
      formData.append('platform', selectedPlatform);
      formData.append('aiModel', selectedAIModel);
      formData.append('minClipLength', String(minClipLength));
      formData.append('maxClipLength', String(maxClipLength));
      if (manualStart) formData.append('manualStart', manualStart);
      if (manualEnd) formData.append('manualEnd', manualEnd);
      if (keywords) formData.append('keywords', keywords);

      // Add project context for tracking
      formData.append('sourceProjectId', project.id.toString());

      // Pass the sessionId to the backend (same as homepage)
      formData.append('sessionId', tempSessionId);

      // Process the video (same as homepage)
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        setSessionId(null);

        // Check if error is related to URL validation/parsing
        const errorMessage = errorData.error || '';
        if (errorMessage.toLowerCase().includes('url') ||
          errorMessage.toLowerCase().includes('token') ||
          errorMessage.toLowerCase().includes('parse') ||
          errorMessage.toLowerCase().includes('invalid') ||
          errorMessage.toLowerCase().includes('expected')) {
          setError('Invalid URL');
        } else {
          // Show generic error message - no error codes visible to users
          setError('An error occurred. Please try again.');
        }
        setIsGenerating(false);
        return;
      }

      // Get the results from the API response
      const result = await processResponse.json();

      // Save results to sessionStorage (same as home page)
      try {
        sessionStorage.setItem("evr.resultsCache.v1", JSON.stringify(result));
        console.log("Results saved to sessionStorage from my-projects, redirecting to /results");
      } catch (error) {
        console.error("Error saving results to sessionStorage:", error);
        setError("Failed to save results. Please try again.");
        setIsGenerating(false);
        setSessionId(null);
        return;
      }

      // Store the current project ID for the results page
      sessionStorage.setItem('currentProjectId', project.id.toString());

      // Redirect to results page
      console.log('Processing completed, redirecting to results...');
      setIsGenerating(false);
      setSessionId(null);
      setProgress({ percent: 0, message: '' });
      // Use window.location for reliable navigation (same as home page)
      window.location.href = '/results';
    } catch (error) {
      console.error('Error generating clips:', error);

      // Check if error is related to URL validation/parsing
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('url') ||
        errorMessage.toLowerCase().includes('token') ||
        errorMessage.toLowerCase().includes('parse') ||
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('expected')) {
        setError('Invalid URL');
      } else {
        // Don't expose technical error details to users
        setError('An error occurred. Please try again.');
      }
      setSessionId(null);
      setIsGenerating(false);
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
          <p className="mt-4 text-gray-600">Loading your projects...</p>
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
      <div className="w-full max-w-full px-4 py-8 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">My Projects</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">Manage your video projects and generate new clips</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="bg-purple-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors text-sm sm:text-base whitespace-nowrap flex-shrink-0"
          >
            Create New Project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
              <p className="text-gray-600 mb-6">Create your first project by processing a video or YouTube URL.</p>
              <button
                onClick={() => router.push('/')}
                className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
              >
                Create Project
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {projects.map((project) => (
              <div key={project.id} className="space-y-6">
                {/* Project Header - Clickable */}
                <div
                  className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 sm:p-6 shadow-lg border border-white/30 cursor-pointer hover:bg-white/70 transition-all duration-200 overflow-hidden"
                  onClick={() => toggleProject(project.id)}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{project.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs sm:text-sm text-gray-500">
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
                      <p className="text-sm sm:text-base text-gray-600 mt-2">
                        {project.source_type === 'youtube' ? 'YouTube Video' : 'Uploaded Video'} •
                        {new Date(project.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {project.thumbnail_path && (
                      <img
                        src={`/api/thumbnails/${project.thumbnail_path.replace(/\\/g, '/').replace(/.*uploads\//, '')}`}
                        alt={project.title}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Original Video and Generate Clips - Collapsible */}
                {expandedProjects.has(project.id) && (
                  <div className="space-y-6 overflow-hidden">
                    {/* Single Card with Video and Generation Options */}
                    <div className="p-4 sm:p-6 rounded-3xl bg-white/60 shadow-2xl backdrop-blur-lg border border-white/30 overflow-hidden">
                      <div className="flex flex-col lg:flex-row gap-6">
                        {/* Original Video Player */}
                        <div className="w-full max-w-[320px] mx-auto sm:mx-0">
                          <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-black/5">
                            {project.source_url.startsWith('http') ? (
                              // For YouTube URLs, show a placeholder with download option
                              <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100">
                                <div className="text-center p-4">
                                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                  </div>
                                  <p className="text-sm text-gray-600 mb-2">YouTube Video</p>
                                  <p className="text-xs text-gray-500">Original source preserved</p>
                                </div>
                              </div>
                            ) : (
                              // For local video files, show the video player
                              <video
                                src={`/api/stream?file=${encodeURIComponent(project.source_url)}`}
                                className="absolute inset-0 w-full h-full object-contain"
                                controls
                              />
                            )}
                          </div>
                        </div>

                        {/* Video Details and Generation Options */}
                        <div className="flex-grow space-y-6 min-w-0">
                          {/* Video Details - At the top */}
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Original Video</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                              <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                <span>Source:</span>
                                <span className="font-medium">{project.source_type === 'youtube' ? 'YouTube' : 'Uploaded'}</span>
                              </div>
                              <div className="flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                <span>Created:</span>
                                <span className="font-medium">{new Date(project.created_at).toLocaleDateString()}</span>
                              </div>
                              {/*                               <div className="sm:col-span-2 flex items-center justify-between text-sm text-gray-600 bg-white/50 p-2 rounded-lg">
                                <span className="flex-shrink-0 mr-2">Source URL:</span>
                                <span className="font-medium text-xs truncate min-w-0">{project.source_url}</span>
                              </div>
                              */}
                            </div>

                            {/* Download/View Original Video Buttons */}
                            <div className="flex gap-2">
                              {project.source_url.startsWith('http') ? (
                                // For YouTube URLs, show "View Original" button
                                <button
                                  onClick={() => window.open(project.source_url, '_blank')}
                                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
                                >
                                  🔗 View Original on YouTube
                                </button>
                              ) : (
                                // For local files, show download button
                                <button
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    const filename = `${project.title}.mp4`;
                                    link.href = `/api/download?file=${encodeURIComponent(project.source_url)}&filename=${encodeURIComponent(filename)}`;
                                    link.download = filename;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                                >
                                  📥 Download Original Video
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Generation Options - Below video details */}
                          <div className="pt-4 border-t border-gray-200">
                            <h4 className="text-lg font-semibold text-gray-900 mb-4">Generate New Clips</h4>

                            {/* Platform Selection */}
                            <div className="mb-4">
                              <p className="text-sm mb-3 text-gray-600 font-medium">Platform</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'youtube'
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/25'
                                    : 'bg-white/10 text-gray-600 hover:bg-white/20 border border-gray-300'
                                    }`}
                                  onClick={() => setSelectedPlatform('youtube')}
                                >
                                  YouTube Shorts
                                </button>
                                <button
                                  className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'instagram'
                                    ? 'bg-gradient-to-r from-pink-500 to-yellow-500 text-white shadow-lg shadow-pink-500/25'
                                    : 'bg-white/10 text-gray-600 hover:bg-white/20 border border-gray-300'
                                    }`}
                                  onClick={() => setSelectedPlatform('instagram')}
                                >
                                  Instagram
                                </button>
                                <button
                                  className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ${selectedPlatform === 'tiktok'
                                    ? 'bg-black text-white shadow-lg shadow-black/25'
                                    : 'bg-white/10 text-gray-600 hover:bg-white/20 border border-gray-300'
                                    }`}
                                  onClick={() => setSelectedPlatform('tiktok')}
                                >
                                  TikTok
                                </button>
                              </div>
                            </div>

                            {/* AI Model Selection */}
                            <div className="mb-4">
                              <p className="text-sm mb-3 text-gray-600 font-medium">AI Engine</p>
                              <div className="flex gap-2">
                                <button
                                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${selectedAIModel === 'openai'
                                    ? 'bg-green-600 text-white shadow-lg shadow-green-500/25'
                                    : 'bg-white/10 text-gray-600 hover:bg-white/20 border border-gray-300'
                                    }`}
                                  onClick={() => setSelectedAIModel('openai')}
                                >
                                  GPT-4
                                </button>
                                <button
                                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${selectedAIModel === 'groq'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                                    : 'bg-white/10 text-gray-600 hover:bg-white/20 border border-gray-300'
                                    }`}
                                  onClick={() => setSelectedAIModel('groq')}
                                >
                                  Groq
                                </button>
                              </div>
                            </div>

                            {/* Advanced Options Toggle */}
                            <div className="mb-4">
                              <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium transition-colors text-sm"
                              >
                                <svg className={`w-4 h-4 transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Advanced Options
                              </button>
                            </div>

                            {/* Advanced Options */}
                            {showAdvanced && (
                              <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-gray-300/50 backdrop-blur-sm mb-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Length (sec)</label>
                                    <input
                                      type="number"
                                      value={minClipLength}
                                      onChange={(e) => setMinClipLength(parseInt(e.target.value))}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      min="5"
                                      max="300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Length (sec)</label>
                                    <input
                                      type="number"
                                      value={maxClipLength}
                                      onChange={(e) => setMaxClipLength(parseInt(e.target.value))}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      min="5"
                                      max="300"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Manual Start (sec)</label>
                                    <input
                                      type="number"
                                      value={manualStart}
                                      onChange={(e) => setManualStart(e.target.value)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      placeholder="Optional"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Manual End (sec)</label>
                                    <input
                                      type="number"
                                      value={manualEnd}
                                      onChange={(e) => setManualEnd(e.target.value)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                      placeholder="Optional"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Keywords (comma-separated)</label>
                                  <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="Optional keywords to focus on"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleGenerateClips(project)}
                                disabled={isGenerating}
                                className="flex-1 bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isGenerating ? 'Generating...' : 'Generate Clips'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Processing Modal (same as homepage) */}
        {isGenerating && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md mx-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Generating Clips</h3>
                <p className="text-gray-600 mb-6">{progress.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="ml-4 text-white hover:text-gray-200"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Login popup */}
        <LoginGate open={showLogin} onClose={() => setShowLogin(false)} />
      </div>
    </AccountLayout>
  );
}