"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { signIn, signOut, useSession } from "@/lib/auth-client";

function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useAuthState() {
  const {
    data: session,
    error: sessionError,
    isPending: isLoading,
    isRefetching: isSessionRefetching,
    refetch: refetchSession,
  } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadApiToken = async () => {
      if (!session?.user?.id) {
        setAccessToken("");
        setTokenExpiresAt(null);
        return;
      }

      try {
        const response = await fetch("/api/auth/token", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to fetch Better Auth API token.");
        }

        const payload = (await response.json()) as { token?: string };
        const token = (payload.token || "").trim();
        if (!token) {
          throw new Error("Better Auth API token response was empty.");
        }

        if (!cancelled) {
          setAccessToken(token);
          setTokenExpiresAt(decodeJwtExp(token));
        }
      } catch {
        if (!cancelled) {
          setAccessToken("");
          setTokenExpiresAt(null);
        }
      }
    };

    void loadApiToken();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !tokenExpiresAt) {
      return;
    }

    const refreshAt = Math.max(tokenExpiresAt - Date.now() - 60_000, 5_000);
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/token", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { token?: string };
        const token = (payload.token || "").trim();
        if (!token) {
          return;
        }
        setAccessToken(token);
        setTokenExpiresAt(decodeJwtExp(token));
      } catch {
        // Best effort only; the next refresh or page load can recover.
      }
    }, refreshAt);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [session?.user?.id, tokenExpiresAt]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const result = await signIn.social(
        {
          provider: "google",
          callbackURL: "/dashboard",
          errorCallbackURL: "/",
          newUserCallbackURL: "/dashboard",
          requestSignUp: true,
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
    accessToken,
    isLoading,
    isSessionRefetching,
    sessionError,
    isSigningIn,
    handleGoogleSignIn,
    refetchSession,
    signOut: handleSignOut,
  };
}
