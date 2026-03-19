"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ResultsPage from "@/components/ResultsPage";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";

export default function ResultsPageRoute() {
  const router = useRouter();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Handle post-login redirection
  usePostLoginRedirect();

  useEffect(() => {
    // Try to restore results from session storage
    console.log("Results page loading, checking sessionStorage...");
    try {
      const cachedResults = sessionStorage.getItem("evr.resultsCache.v1");
      console.log("Cached results found:", !!cachedResults);
      if (cachedResults) {
        const parsedResults = JSON.parse(cachedResults);
        console.log("Parsed results, setting state...", parsedResults);
        setResults(parsedResults);
      } else {
        // No cached results, redirect to homepage
        console.log("No cached results found, redirecting to home");
        router.push("/");
      }
    } catch (error) {
      console.error("Error restoring results:", error);
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleBack = () => {
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a2e] to-[#16213e] flex items-center justify-center pt-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-white">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a2e] to-[#16213e] flex items-center justify-center pt-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">No Results Found</h1>
          <p className="text-gray-300 mb-6">The results have expired or were not found.</p>
          <button
            onClick={() => router.push("/")}
            className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return <ResultsPage results={results} onBack={handleBack} />;
}
