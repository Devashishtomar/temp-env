"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Sparkles, User, ArrowRight } from "lucide-react";
import { useEffect, Suspense } from "react";
import { useSnackbar } from "@/providers/SnackbarProvider"; // Import your custom hook!


function AuthErrorHandler() {
  const searchParams = useSearchParams();
  const { error } = useSnackbar(); // Destructure the error function from your provider

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "EmailAccountExists") {
      // Trigger your beautiful Snackbar instead of an alert
      error("An account with this email already exists. Please log in with your password.");

      // Clean up the URL so the error doesn't stay there if they refresh
      window.history.replaceState(null, "", "/");
    }
  }, [searchParams, error]); // Added error to dependency array

  return null; // This component doesn't render any HTML itself
}

export default function HomePage() {
  const router = useRouter();

  const handleTryNow = () => {
    router.push("/features");
  };

  return (
    <main className="min-h-screen bg-[#0b0f1a] text-white overflow-hidden">
      <Suspense fallback={null}>
        <AuthErrorHandler />
      </Suspense>

      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-purple-600/10 to-transparent rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20">
        <div className="text-center max-w-5xl mx-auto relative z-10">
          <div className="inline-block mb-6">
            <span className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-300 text-sm font-medium tracking-wide">
              AI-Powered Video Intelligence
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-8 leading-[1.1] tracking-tight">
            <span className="bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
              The Future of Video
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 bg-clip-text text-transparent">
              Creation & Editing
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Transform your long videos into viral short-form content with AI-powered clip detection and intelligent editing
          </p>

          <button
            onClick={handleTryNow}
            className="group relative px-10 py-5 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold text-lg rounded-2xl transition-all duration-500 shadow-[0_0_40px_rgba(147,51,234,0.3)] hover:shadow-[0_0_60px_rgba(147,51,234,0.5)] hover:scale-105 overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              Try Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-700 to-purple-800 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        {/* Scroll indicator 
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-purple-400/30 rounded-full flex justify-center pt-2">
            <div className="w-1 h-3 bg-purple-400/50 rounded-full" />
          </div>
        </div>*/}
      </section>

      {/* How It Works Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-purple-400 text-sm font-semibold tracking-widest uppercase mb-4 block">
              Simple Process
            </span>
            <h2 className="text-4xl md:text-5xl font-bold">
              <span className="bg-gradient-to-r from-white to-purple-300 bg-clip-text text-transparent">
                How It Works
              </span>
            </h2>
          </div>

          {/* Steps Container */}
          <div className="relative flex flex-col md:flex-row items-center justify-center gap-6 md:gap-0">
            {/* Step 1 */}
            <div className="relative group">
              <div className="w-80 bg-gradient-to-br from-[#1a1f2e]/80 to-[#252a3d]/80 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/10 hover:border-purple-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(147,51,234,0.15)] hover:-translate-y-2">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                  1
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <User className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Create Account</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Sign up in seconds to unlock AI-powered video editing capabilities.
                </p>
              </div>
            </div>

            {/* Arrow 1 */}
            <div className="hidden md:flex items-center px-4">
              <div className="w-16 h-[2px] bg-gradient-to-r from-purple-500/50 to-purple-400/50" />
              <ArrowRight className="w-6 h-6 text-purple-400/50 -ml-1" />
            </div>
            <div className="md:hidden flex items-center py-2">
              <div className="w-[2px] h-8 bg-gradient-to-b from-purple-500/50 to-purple-400/50" />
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <div className="w-80 bg-gradient-to-br from-[#1a1f2e]/80 to-[#252a3d]/80 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/10 hover:border-purple-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(147,51,234,0.15)] hover:-translate-y-2">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                  2
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Drop Your Video</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Upload your video or paste a YouTube link. Our AI analyzes every frame.
                </p>
              </div>
            </div>

            {/* Arrow 2 */}
            <div className="hidden md:flex items-center px-4">
              <div className="w-16 h-[2px] bg-gradient-to-r from-purple-500/50 to-purple-400/50" />
              <ArrowRight className="w-6 h-6 text-purple-400/50 -ml-1" />
            </div>
            <div className="md:hidden flex items-center py-2">
              <div className="w-[2px] h-8 bg-gradient-to-b from-purple-500/50 to-purple-400/50" />
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <div className="w-80 bg-gradient-to-br from-[#1a1f2e]/80 to-[#252a3d]/80 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/10 hover:border-purple-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(147,51,234,0.15)] hover:-translate-y-2">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                  3
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Get Your Output</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Receive perfectly edited short clips ready for TikTok, Reels, and Shorts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Enveral Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <span className="text-purple-400 text-sm font-semibold tracking-widest uppercase mb-4 block">
            Why Choose Us
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-16">
            <span className="bg-gradient-to-r from-white to-purple-300 bg-clip-text text-transparent">
              Why Enveral?
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">⚡</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Lightning Fast</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Process hours of content in minutes with our optimized AI pipeline.</p>
                </div>
              </div>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">🎯</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Smart Detection</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">AI identifies the most engaging moments automatically.</p>
                </div>
              </div>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">📱</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Platform Ready</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Export in perfect formats for TikTok, Instagram, and YouTube Shorts.</p>
                </div>
              </div>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">🔒</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Secure & Private</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Your videos are processed securely and never shared.</p>
                </div>
              </div>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">🧠</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Advanced AI Models</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Powered by cutting-edge machine learning models for superior content analysis and clip generation.</p>
                </div>
              </div>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[#1a1f2e]/80 to-[#1a1f2e]/40 border border-purple-500/10 hover:border-purple-500/30 transition-all text-left hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                  <span className="text-2xl">✏️</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-2 text-lg">Full Creative Control</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Fine-tune every aspect of your clips with intuitive editing tools tailored to your vision.</p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleTryNow}
            className="group relative px-10 py-5 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold text-lg rounded-2xl transition-all duration-500 shadow-[0_0_40px_rgba(147,51,234,0.3)] hover:shadow-[0_0_60px_rgba(147,51,234,0.5)] hover:scale-105 overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              Get Started Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-700 to-purple-800 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </section>
    </main>
  );
}
