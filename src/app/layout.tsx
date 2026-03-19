import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import AuthProvider from "../providers/AuthProvider";
import TopNav from "../components/TopNav";
import { LoginProvider } from "../components/LoginManager";
import SnackbarProvider from "../providers/SnackbarProvider";



const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Enveral - Transform Videos Into Viral Shorts",
  description:
    "AI-powered tool to create engaging Shorts, Reels & TikToks from any video. Minimal effort, maximum impact.",

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/enveral-logo.jpg" type="image/jpeg" />
      </head>
      <body
        className={`${inter.variable} antialiased bg-[#f3f8fa] min-h-screen`}
      >

        <AuthProvider>
          <SnackbarProvider>
            <LoginProvider>
              {/* Top navigation bar with login/logout button */}
              <TopNav />

              {/* Wrap the rest of your app */}
              <main className="w-full flex flex-col min-h-screen">
                {children}
              </main>
            </LoginProvider>
          </SnackbarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
