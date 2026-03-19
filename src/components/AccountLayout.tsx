"use client";

import { useState } from "react";
import AccountSidebar from "./AccountSidebar";

interface AccountLayoutProps {
  children: React.ReactNode;
}

export default function AccountLayout({ children }: AccountLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(220);

  return (
    <div className="min-h-screen bg-gray-50 pt-[64px] overflow-x-hidden">
      <AccountSidebar onWidthChange={setSidebarWidth} />
      <main
        className="transition-all duration-200 min-h-[calc(100vh-64px)] overflow-x-hidden"
        style={{
          marginLeft: sidebarWidth,
          width: `calc(100% - ${sidebarWidth}px)`,
          maxWidth: `calc(100vw - ${sidebarWidth}px)`
        }}
      >
        {children}
      </main>
    </div>
  );
}
