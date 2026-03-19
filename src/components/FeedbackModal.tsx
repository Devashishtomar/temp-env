"use client";

import { useState } from "react";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [feedbackForm, setFeedbackForm] = useState({
    feedback: '',
    email: '',
    suggestions: ''
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';
    const ENTRY_FEEDBACK = 'entry.839337160';
    const ENTRY_EMAIL = 'entry.889551860';
    const ENTRY_SUGGESTIONS = 'entry.1510560057';
    
    const params = new URLSearchParams({
      [ENTRY_FEEDBACK]: feedbackForm.feedback || '',
      [ENTRY_EMAIL]: feedbackForm.email || '',
      [ENTRY_SUGGESTIONS]: feedbackForm.suggestions || '',
    });
    
    const submitUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse?${params.toString()}`;
    
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
    
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch (e) {}
    }, 3000);
    
    setFeedbackSubmitted(true);
    
    setTimeout(() => {
      setFeedbackSubmitted(false);
      onClose();
      setFeedbackForm({
        feedback: '',
        email: '',
        suggestions: ''
      });
    }, 3000);
  };

  const handleFeedbackChange = (field: string, value: string) => {
    setFeedbackForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
              <h3 className="text-xl font-semibold text-gray-900">Share Feedback</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Your Feedback <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={feedbackForm.feedback}
                  onChange={(e) => handleFeedbackChange('feedback', e.target.value)}
                  placeholder="Share your thoughts about Enveral..."
                  required
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500 break-words"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
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

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Suggestions for Improvement
                </label>
                <textarea
                  value={feedbackForm.suggestions}
                  onChange={(e) => handleFeedbackChange('suggestions', e.target.value)}
                  placeholder="Any specific suggestions?"
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500 break-words"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
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
  );
}
