"use client";
import TopNav from "./TopNav";
import { LoginProvider } from "./LoginManager";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <LoginProvider>
      <TopNav />
      {children}
    </LoginProvider>
  );
}


