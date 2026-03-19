"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginGate from "@/components/LoginGate";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";
import AccountLayout from "@/components/AccountLayout";


interface UserStats {
  totalClips: number;
  totalProjects: number;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>({ totalClips: 0, totalProjects: 0 });
  const [loading, setLoading] = useState(true);
  const [featureRequestOpen, setFeatureRequestOpen] = useState(false);
  const [featureRequestForm, setFeatureRequestForm] = useState({
    title: '',
    description: '',
    useCase: '',
    email: ''
  });
  const [featureRequestSubmitted, setFeatureRequestSubmitted] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    feedback: '',
    email: '',
    suggestions: ''
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Handle post-login redirection
  usePostLoginRedirect();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      fetchUserStats();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status, session]);

  const fetchUserStats = async () => {
    try {
      const response = await fetch('/api/user/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMyClipsClick = () => {
    // Clear any redirect flags when navigating normally
    try {
      sessionStorage.removeItem("evr.returnTo.v1");
      sessionStorage.removeItem("evr.shouldRedirect.v1");
    } catch { }
    window.location.href = '/my-clips';
  };

  // Feature request form handlers
  const handleFeatureRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const FORM_ID = '1FAIpQLSelh155WnGO4Z6bQzywOql2XahSIHhb75AWnzDNqU10YvO3oA';

    // Entry IDs from Google Form
    const ENTRY_TITLE = 'entry.605055615';
    const ENTRY_DESCRIPTION = 'entry.21679918';
    const ENTRY_USECASE = 'entry.1520853023';
    const ENTRY_EMAIL = 'entry.28380032';

    const params = new URLSearchParams({
      [ENTRY_TITLE]: featureRequestForm.title || '',
      [ENTRY_DESCRIPTION]: featureRequestForm.description || '',
      [ENTRY_USECASE]: featureRequestForm.useCase || '',
      [ENTRY_EMAIL]: featureRequestForm.email || '',
    });

    const submitUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse?${params.toString()}`;

    console.log('Submitting feature request to:', submitUrl);

    // Create completely hidden iframe to submit silently (same method as feedback)
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
    setFeatureRequestSubmitted(true);

    // Reset form after 3 seconds
    setTimeout(() => {
      setFeatureRequestSubmitted(false);
      setFeatureRequestOpen(false);
      setFeatureRequestForm({
        title: '',
        description: '',
        useCase: '',
        email: ''
      });
    }, 3000);
  };

  const handleFeatureRequestChange = (field: string, value: any) => {
    setFeatureRequestForm(prev => ({
      ...prev,
      [field]: value
    }));
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

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Account</h1>
          <p className="text-gray-600 mb-6">Please sign in to view your account information.</p>
          <LoginGate open={true} onClose={() => router.push('/')} />
        </div>
      </div>
    );
  }

  return (
    <AccountLayout>
      <div className="p-4 sm:p-8 overflow-x-hidden">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Account</h1>
                <p className="text-gray-600 mt-2">Manage your clips and projects</p>
              </div>
              <div className="text-left sm:text-right flex-shrink-0">
                <p className="text-sm text-gray-500">Signed in as</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base break-all sm:break-normal max-w-[200px] sm:max-w-none">{session?.user?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-purple-50 rounded-xl p-6">
                <div className="flex items-center">
                  <div className="bg-purple-100 rounded-lg p-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Clips</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalClips}</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-6">
                <div className="flex items-center">
                  <div className="bg-blue-100 rounded-lg p-3">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Projects</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalProjects}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleMyClipsClick}
                className="flex-1 bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
              >
                Clips
              </button>
              <button
                onClick={() => {
                  // Clear any redirect flags when navigating normally
                  try {
                    sessionStorage.removeItem("evr.returnTo.v1");
                    sessionStorage.removeItem("evr.shouldRedirect.v1");
                  } catch { }
                  window.location.href = '/my-projects';
                }}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Projects
              </button>
              <button
                onClick={() => {
                  // Clear any redirect flags when navigating normally
                  try {
                    sessionStorage.removeItem("evr.returnTo.v1");
                    sessionStorage.removeItem("evr.shouldRedirect.v1");
                  } catch { }
                  window.location.href = '/';
                }}
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Create New Clips
              </button>
            </div>
          </div>
        </div>
      </div>
    </AccountLayout>
  );
}

