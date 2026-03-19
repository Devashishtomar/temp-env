"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PlatformSelector from "../../components/PlatformSelector";
import UploadArea from "../../components/UploadArea";
import AIModelSelector from "../../components/AIModelSelector";
import Image from "next/image";

export default function FeaturesPage() {
  const router = useRouter();
  const [selectedPlatform, setSelectedPlatform] = useState("youtube");
  const [selectedAIModel, setSelectedAIModel] = useState("openai");

  const handleProcessing = (data: any) => {
    console.log("handleProcessing called with data:", data);
    try {
      const resultsString = JSON.stringify(data);
      sessionStorage.setItem("evr.resultsCache.v1", resultsString);
      console.log("Results saved to sessionStorage, verifying...");
      
      const saved = sessionStorage.getItem("evr.resultsCache.v1");
      if (!saved) {
        console.error("Failed to save results to sessionStorage!");
        return;
      }
      console.log("Results verified in sessionStorage, redirecting to /results");
    } catch (error) {
      console.error("Error saving results to sessionStorage:", error);
      return;
    }
    
    window.location.href = "/results";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a2e] to-[#16213e] relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-2 h-2 bg-purple-400 rounded-full animate-pulse opacity-60"></div>
        <div className="absolute top-40 right-20 w-1 h-1 bg-purple-400 rounded-full animate-ping opacity-40"></div>
        <div className="absolute bottom-32 left-1/4 w-3 h-3 bg-purple-400 rounded-full animate-bounce opacity-50"></div>
        <div className="absolute top-1/2 right-1/3 w-1 h-1 bg-purple-400 rounded-full animate-pulse opacity-70"></div>
        <div className="absolute bottom-20 right-10 w-2 h-2 bg-purple-300 rounded-full animate-ping opacity-30"></div>

        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent animate-pulse"></div>
        <div
          className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-0 left-2/3 w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>

        <div className="absolute top-1/4 left-1/6 w-32 h-32 bg-purple-500/10 rounded-full blur-xl animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/6 w-40 h-40 bg-purple-500/10 rounded-full blur-xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-purple-500/10 rounded-full blur-xl animate-pulse"
          style={{ animationDelay: "0.5s" }}
        ></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-8 py-20">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* RIGHT - Upload Card */}
          <div className="order-2 lg:order-2">
            <div className="bg-white/10 backdrop-blur-xl shadow-2xl rounded-3xl p-8 space-y-6 border border-white/20">
              <UploadArea
                onProcessing={handleProcessing}
                platform={selectedPlatform}
                aiModel={selectedAIModel}
              />
            </div>
          </div>

          {/* LEFT - Company Description */}
          <div className="order-1 lg:order-1 space-y-8 text-white">
            <div className="flex items-center space-x-6">
              <div className="relative">
                <Image
                  src="/enveral-logo.jpg"
                  alt="Enveral Logo"
                  width={110}
                  height={110}
                  className="rounded-full border-4 border-purple-400/50 shadow-none"
                  priority
                />
              </div>
              <div>
                <h2 className="text-4xl font-extrabold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                  Enveral AI
                </h2>
                <p className="text-purple-200 text-base mt-1">
                  Next-Gen Video Intelligence
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight">
                Turn Long Videos <br />
                <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                  into Viral Shorts
                </span>
              </h1>

              <p className="text-xl text-gray-300 leading-relaxed">
                AI-powered tool to generate Reels, Shorts, and TikToks with
                zero editing experience. Transform your content into viral
                sensations.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">⚡</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Lightning Fast</h3>
                    <p className="text-gray-400 text-sm">
                      AI processing in seconds
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🎯</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Smart Detection</h3>
                    <p className="text-gray-400 text-sm">Auto clip detection</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🧠</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">GPT-4 Powered</h3>
                    <p className="text-gray-400 text-sm">Advanced AI analysis</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🚀</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Viral Ready</h3>
                    <p className="text-gray-400 text-sm">
                      Optimized for virality
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-600 rounded-full border-2 border-white/20"></div>
                </div>
                <p className="text-gray-300 text-lg">
                  <span className="text-white font-extrabold text-2xl">
                    10,000+
                  </span>{" "}
                  <span className="text-white/80">videos processed</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
