"use client";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useContext, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LoginContext } from "./LoginManager";
import LoginGate from "./LoginGate";
import FeedbackModal from "./FeedbackModal";

export default function TopNav() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showNav] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get login context if available, otherwise use local state
  const loginContext = useContext(LoginContext);
  const openLogin = loginContext?.openLogin || (() => setLoginOpen(true));


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle profile icon click
  const handleProfileClick = () => {
    if (status === "authenticated") {
      setProfileDropdownOpen(!profileDropdownOpen);
    } else {
      // Save current page state before showing login
      try {
        sessionStorage.setItem("evr.returnTo.v1", window.location.pathname + window.location.search + window.location.hash);
        sessionStorage.setItem("evr.scrollY.v1", String(window.scrollY || 0));
      } catch { }
      openLogin();
    }
  };

  // Handle logout
  const handleLogout = () => {
    setProfileDropdownOpen(false);
    const isResultsPage = window.location.pathname === '/results';
    if (isResultsPage) {
      try {
        sessionStorage.removeItem("evr.returnTo.v1");
        sessionStorage.removeItem("evr.scrollY.v1");
        sessionStorage.removeItem("evr.resultsCache.v1");
      } catch { }
      signOut({ callbackUrl: '/' });
    } else {
      try {
        sessionStorage.setItem("evr.returnTo.v1", window.location.pathname + window.location.search + window.location.hash);
        sessionStorage.setItem("evr.scrollY.v1", String(window.scrollY || 0));
      } catch { }
      signOut({ callbackUrl: window.location.pathname });
    }
  };

  // Handle account click
  const handleAccountClick = () => {
    setProfileDropdownOpen(false);
    try {
      sessionStorage.removeItem("evr.returnTo.v1");
      sessionStorage.removeItem("evr.shouldRedirect.v1");
    } catch { }
    router.push('/account');
  };

  // Handle feedback click
  const handleFeedbackClick = () => {
    setProfileDropdownOpen(false);
    setFeedbackOpen(true);
  };

  // Handle login button click for mobile
  const handleLoginClick = () => {
    if (status === "authenticated") {
      handleLogout();
    } else {
      try {
        sessionStorage.setItem("evr.returnTo.v1", window.location.pathname + window.location.search + window.location.hash);
        sessionStorage.setItem("evr.scrollY.v1", String(window.scrollY || 0));
      } catch { }
      openLogin();
    }
  };

  return (
    <>
      <header
        className={`fixed w-full z-50 transition-transform duration-300 ${showNav ? "translate-y-0" : "-translate-y-full"
          } backdrop-blur bg-[#0b0f1a]/60 border-b border-white/10 shadow-md`}
      >
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left Logo */}
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              try {
                sessionStorage.removeItem("evr.returnTo.v1");
                sessionStorage.removeItem("evr.shouldRedirect.v1");
              } catch { }
              router.push('/');
            }}
          >
            <Image
              src="/enveral-logo.jpg"
              alt="Enveral"
              width={32}
              height={32}
              className="rounded-full border border-purple-400/50"
            />
            <span className="text-lg font-bold truncate max-w-[150px] sm:max-w-[220px] bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
              Enveral
            </span>
          </div>

          {/* Right Buttons - Desktop */}
          <div className="hidden md:flex items-center gap-3">
            {pathname === '/' && (
              <button
                onClick={() => router.push('/features')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition shadow-lg shadow-purple-500/25"
              >
                Start Creating Shorts
              </button>
            )}
            {pathname !== '/' && pathname !== '/features' && (
              <button
                onClick={() => router.push('/features')}
                className="px-4 py-2 rounded-xl bg-transparent text-white font-semibold hover:bg-white/10 transition border border-white/20"
              >
                {pathname === '/account' ? 'Create a Short' : 'Create Another Short'}
              </button>
            )}

            {/* Profile Icon with Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleProfileClick}
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 transition flex items-center justify-center"
                title={status === "authenticated" ? session?.user?.email || "Profile" : "Login / Sign up"}
              >
                {status === "authenticated" ? (
                  <span className="text-white font-semibold text-sm">
                    {session?.user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </button>

              {/* Dropdown Menu */}
              {profileDropdownOpen && status === "authenticated" && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  {/* User Email */}
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-xs text-gray-400">Signed in as</p>
                    <p className="text-sm text-white font-medium truncate">{session?.user?.email}</p>
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <button
                      onClick={handleAccountClick}
                      className="w-full text-left px-4 py-3 text-white hover:bg-white/10 transition flex items-center gap-3"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Account
                    </button>

                    <button
                      onClick={handleFeedbackClick}
                      className="w-full text-left px-4 py-3 text-white hover:bg-white/10 transition flex items-center gap-3"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      Feedback
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-red-400 hover:bg-white/10 transition flex items-center gap-3"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              aria-label="Open menu"
              onClick={() => setMenuOpen((s) => !s)}
              className="p-2 rounded-lg hover:bg-white/5 transition"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Mobile dropdown (appears under header) */}
          {menuOpen && (
            <div className="absolute right-4 top-full mt-2 w-[200px] sm:w-[240px] bg-[#0b0f1a]/95 border border-white/10 rounded-lg p-2 shadow-lg flex flex-col gap-2">
              {pathname === '/' && (
                <button
                  onClick={() => {
                    router.push("/features");
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition"
                >
                  Start Creating Shorts
                </button>
              )}
              {pathname !== '/' && pathname !== '/features' && (
                <button
                  onClick={() => {
                    router.push("/features");
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition font-semibold"
                >
                  {pathname === '/account' ? 'Create a Short' : 'Create Another Short'}
                </button>
              )}

              {status === "authenticated" ? (
                <>
                  <button
                    onClick={() => {
                      try {
                        sessionStorage.removeItem("evr.returnTo.v1");
                        sessionStorage.removeItem("evr.shouldRedirect.v1");
                      } catch { }
                      router.push('/account');
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition"
                  >
                    Account
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setFeedbackOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition"
                  >
                    Feedback
                  </button>
                  <button
                    onClick={handleLoginClick}
                    className="w-full text-left px-3 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLoginClick}
                  className="w-full text-left px-3 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition"
                >
                  Login
                </button>
              )}
            </div>
          )}
        </div>

        {/* Fallback LoginGate if context not available */}
        {!loginContext && (
          <LoginGate open={loginOpen} onClose={() => setLoginOpen(false)} />
        )}
      </header>

      {/* Feedback Modal - rendered outside header for proper positioning */}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
