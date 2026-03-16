"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
});

export const { signIn, signOut, useSession } = authClient as typeof authClient & {
  signIn: {
    social: (
      input: {
        provider: "google";
        callbackURL?: string;
        errorCallbackURL?: string;
        newUserCallbackURL?: string;
        requestSignUp?: boolean;
      },
      config?: {
        onSuccess?: () => void;
        onError?: (ctx: { error?: { message?: string } }) => void;
      }
    ) => Promise<unknown>;
  };
  signOut: () => Promise<unknown>;
};
