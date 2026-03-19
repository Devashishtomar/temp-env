"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSnackbar } from "@/providers/SnackbarProvider";

export default function LoginGate({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const snackbar = useSnackbar();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  // error state removed

  useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      setEmail("");
      setPassword("");
      setName("");
      setIsSignUp(false);
    }
  }, [open]);

  // close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ⬇️ Ensure we come back to the saved return URL or current page
  const handleGoogle = () => {
    try {
      // Check if there's a saved return URL
      const returnTo = sessionStorage.getItem("evr.returnTo.v1");
      let callbackUrl = "/";

      if (returnTo) {
        callbackUrl = returnTo;
      } else {
        const href = typeof window !== "undefined" ? window.location.href : "/";
        callbackUrl = href;
      }

      sessionStorage.setItem("evr.shouldRedirect.v1", "true");

      return signIn("google", {
        callbackUrl: callbackUrl,
      });
    } catch (error) {
      console.error("Error setting up login callback:", error);
      return signIn("google");
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          name: name || email.split("@")[0],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        snackbar.error(data.error || "Failed to create account");
        setLoading(false);
        return;
      }

      // After successful signup, automatically sign in
      await handleEmailSignIn(e, true);
    } catch (err: any) {
      snackbar.error("Failed to create account. Please try again.");
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent, skipValidation = false) => {
    if (!skipValidation) {
      e.preventDefault();
    }


    setLoading(true);

    try {
      const returnTo = sessionStorage.getItem("evr.returnTo.v1");
      let callbackUrl = "/";

      if (returnTo) {
        callbackUrl = returnTo;
      } else {
        const href = typeof window !== "undefined" ? window.location.href : "/";
        callbackUrl = href;
      }

      sessionStorage.setItem("evr.shouldRedirect.v1", "true");

      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl: callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        snackbar.error("Invalid email or password");
        setLoading(false);
      } else {
        // Success - NextAuth will handle redirect
        window.location.href = callbackUrl;
      }
    } catch (err: any) {
      snackbar.error("Failed to sign in. Please try again.");
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
      style={{ position: 'fixed', width: '100vw', height: '100vh' }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-white shadow-2xl p-8 border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-agrandir-grand font-bold text-[#222]">
            {isSignUp ? "Create Account" : "Log in to continue"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 transition"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6 font-agrandir">
          {isSignUp
            ? "Sign up to start creating viral shorts."
            : "Sign in to edit or download your generated shorts."}
        </p>

        {/* Email/Password Form */}
        <form
          onSubmit={isSignUp ? handleEmailSignUp : handleEmailSignIn}
          className="space-y-4 mb-6"
        >
          {isSignUp && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#222] mb-2 font-agrandir">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-[#222] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-agrandir placeholder-gray-400"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#222] mb-2 font-agrandir">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-[#222] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-agrandir placeholder-gray-400"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#222] mb-2 font-agrandir">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignUp ? 6 : undefined}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-[#222] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-agrandir placeholder-gray-400"
              placeholder={isSignUp ? "At least 6 characters" : "Your password"}
            />
          </div>


          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-xl bg-[#7b2ff2] text-white font-agrandir font-semibold hover:bg-[#6228d7] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-600 font-agrandir">Or continue with</span>
          </div>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogle}
          className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-300 text-[#222] font-agrandir font-semibold hover:bg-gray-50 transition mb-4 flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Toggle Sign Up/Sign In */}
        <div className="text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
            }}
            className="text-sm text-[#7b2ff2] hover:text-[#6228d7] font-agrandir font-medium transition"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
