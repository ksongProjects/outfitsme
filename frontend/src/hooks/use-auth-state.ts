"use client";

import { useState } from "react";
import { toast } from "sonner";

import { signIn, signOut, useSession } from "@/lib/auth-client";

export function useAuthState() {
  const { data: session, isPending: isLoading } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async (acceptedTerms = false, termsVersion?: string) => {
    void termsVersion;

    if (!acceptedTerms) {
      toast.error("You must accept the Terms of Service to create an account.");
      return false;
    }

    try {
      setIsSigningIn(true);
      const result = await signIn.social(
        {
          provider: "google",
          callbackURL: "/dashboard",
        },
        {
          onSuccess: () => {
            toast.success("Signed in successfully with Google.");
          },
          onError: (ctx) => {
            toast.error(ctx.error?.message || "Sign in failed. Please try again.");
            setIsSigningIn(false);
          },
        }
      );
      return Boolean(result);
    } catch {
      toast.error("Sign in failed. Please try again.");
      setIsSigningIn(false);
      return false;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully.");
    } catch {
      toast.error("Sign out failed. Please try again.");
    }
  };

  return {
    session,
    accessToken: session?.session?.token || "",
    isLoading,
    isSigningIn,
    handleGoogleSignIn,
    signOut: handleSignOut,
  };
}
