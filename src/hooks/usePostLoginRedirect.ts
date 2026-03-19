"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Hook to handle post-login redirection
 * Only redirects if we just logged in (session changed from unauthenticated to authenticated)
 */
export function usePostLoginRedirect() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    // Only runs in the browser
    if (typeof window === "undefined") return;
    
    // Only redirect immediately after login (when status becomes authenticated)
    // We check for a flag that indicates we should handle redirect
    // This flag is set by checking if we're on the callback URL or if session just became authenticated
    try {
      const shouldRedirect = sessionStorage.getItem("evr.shouldRedirect.v1");
      const returnTo = sessionStorage.getItem("evr.returnTo.v1");
      
      // Only redirect if:
      // 1. We have a returnTo URL
      // 2. We have the shouldRedirect flag (set after OAuth callback)
      // 3. User is authenticated
      if (shouldRedirect === "true" && returnTo && status === "authenticated") {
        // Clear flags immediately
        sessionStorage.removeItem("evr.returnTo.v1");
        sessionStorage.removeItem("evr.shouldRedirect.v1");
        
        // Check if we're already on the return URL
        const currentPath = window.location.pathname;
        const returnPath = returnTo.split('?')[0].split('#')[0];
        
        // Only redirect if we're not already on the target page
        if (currentPath !== returnPath) {
          console.log("Post-login redirect to:", returnTo);
          router.push(returnTo);
        }
      }
    } catch (error) {
      console.error("Error handling post-login redirect:", error);
    }
  }, [status, router]);
}


