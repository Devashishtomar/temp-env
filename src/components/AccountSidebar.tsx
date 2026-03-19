"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface AccountSidebarProps {
  onWidthChange?: (width: number) => void;
}

const MIN_WIDTH = 64;
const MAX_WIDTH = 280;
const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 220;

export default function AccountSidebar({ onWidthChange }: AccountSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load saved width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem("sidebar-width");
    const savedCollapsed = localStorage.getItem("sidebar-collapsed");
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed)) {
        setWidth(parsed);
        setIsCollapsed(parsed <= COLLAPSED_WIDTH);
      }
    }
    if (savedCollapsed) {
      setIsCollapsed(savedCollapsed === "true");
    }
  }, []);

  // Notify parent of width changes
  useEffect(() => {
    onWidthChange?.(isCollapsed ? COLLAPSED_WIDTH : width);
  }, [width, isCollapsed, onWidthChange]);

  // Handle resize
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), MAX_WIDTH);
      setWidth(newWidth);
      setIsCollapsed(newWidth <= COLLAPSED_WIDTH);
      localStorage.setItem("sidebar-width", String(newWidth));
      localStorage.setItem("sidebar-collapsed", String(newWidth <= COLLAPSED_WIDTH));
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    if (newCollapsed) {
      setWidth(COLLAPSED_WIDTH);
      localStorage.setItem("sidebar-width", String(COLLAPSED_WIDTH));
    } else {
      setWidth(DEFAULT_WIDTH);
      localStorage.setItem("sidebar-width", String(DEFAULT_WIDTH));
    }
    localStorage.setItem("sidebar-collapsed", String(newCollapsed));
  };

  const handleNavigation = (path: string) => {
    try {
      sessionStorage.removeItem("evr.returnTo.v1");
      sessionStorage.removeItem("evr.shouldRedirect.v1");
    } catch { }
    router.push(path);
  };

  const navItems = [
    {
      label: "Home",
      path: "/account",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: "Library",
      path: "/library",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Create",
      path: "/features",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
  ];

  const currentWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  return (
    <aside
      className="fixed left-0 top-[64px] h-[calc(100vh-64px)] bg-white border-r border-gray-200 flex flex-col z-30 transition-all duration-200"
      style={{ width: currentWidth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        {!isCollapsed && (
          <span className="font-semibold text-gray-900 truncate">Enveral</span>
        )}
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`w-5 h-5 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                  ? "bg-purple-100 text-purple-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                } ${isCollapsed ? "justify-center" : ""}`}
              title={isCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isCollapsed && (
                <span className="font-medium truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-ew-resize hover:bg-purple-400 transition-colors group"
          onMouseDown={() => setIsResizing(true)}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </aside>
  );
}
