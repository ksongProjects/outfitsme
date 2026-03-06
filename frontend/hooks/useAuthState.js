import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";

const REMEMBER_EMAIL_KEY = "outfitsme_remember_email";
const REMEMBER_EMAIL_ENABLED_KEY = "outfitsme_remember_email_enabled";
const LEGACY_REMEMBER_EMAIL_KEY = "outfitme_remember_email";
const LEGACY_REMEMBER_EMAIL_ENABLED_KEY = "outfitme_remember_email_enabled";

const getRememberEmailEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const current = window.localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY);
  if (current !== null) {
    return current === "1";
  }
  return window.localStorage.getItem(LEGACY_REMEMBER_EMAIL_ENABLED_KEY) === "1";
};

const getRememberedEmail = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return (
    window.localStorage.getItem(REMEMBER_EMAIL_KEY)
    || window.localStorage.getItem(LEGACY_REMEMBER_EMAIL_KEY)
    || ""
  );
};

export function useAuthState() {
  const [authTab, setAuthTab] = useState("signin");
  const [rememberMe, setRememberMe] = useState(() => getRememberEmailEnabled());
  const [email, setEmail] = useState(() => (getRememberEmailEnabled() ? getRememberedEmail() : ""));
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);

  const persistRememberMeSettings = (nextEmail, enabled) => {
    if (typeof window === "undefined") {
      return;
    }
    if (enabled) {
      window.localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "1");
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, (nextEmail || "").trim());
      return;
    }
    window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    window.localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "0");
  };

  useEffect(() => {
    // Keep preferences synced even before submit.
    persistRememberMeSettings(email, rememberMe);
  }, [email, rememberMe]);

  const clearAuthInputs = (keepEmail = false) => {
    setPassword("");
    if (!keepEmail) {
      setEmail("");
    }
  };

  useEffect(() => {
    let mounted = true;

    // One-time migration for prior branding key names.
    if (typeof window !== "undefined") {
      const legacyEnabled = window.localStorage.getItem(LEGACY_REMEMBER_EMAIL_ENABLED_KEY);
      const legacyEmail = window.localStorage.getItem(LEGACY_REMEMBER_EMAIL_KEY);
      if (legacyEnabled !== null && window.localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY) === null) {
        window.localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, legacyEnabled);
      }
      if (legacyEmail !== null && window.localStorage.getItem(REMEMBER_EMAIL_KEY) === null) {
        window.localStorage.setItem(REMEMBER_EMAIL_KEY, legacyEmail);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session || null);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      if (nextSession) {
        clearAuthInputs(getRememberEmailEnabled());
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async ({ acceptedTerms = false, termsVersion = "2026-03-05" } = {}) => {
    if (!acceptedTerms) {
      toast.error("You must accept the Terms of Service to create an account.");
      return false;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          accepted_terms: true,
          accepted_terms_version: termsVersion,
          accepted_terms_at: new Date().toISOString()
        }
      }
    });
    if (authError) {
      toast.error(authError.message);
      return false;
    }
    persistRememberMeSettings(email, rememberMe);
    clearAuthInputs(rememberMe);
    toast.success("Signup successful. Check your email if confirmation is enabled.");
    return true;
  };

  const signIn = async () => {
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      toast.error(authError.message);
      return false;
    }
    persistRememberMeSettings(email, rememberMe);
    clearAuthInputs(rememberMe);
    toast.success("Signed in successfully.");
    return true;
  };

  const submitAuth = async (event, options = {}) => {
    event.preventDefault();
    if (authTab === "signin") {
      await signIn();
      return;
    }
    await signUp(options);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAuthInputs(rememberMe);
    persistRememberMeSettings(email, rememberMe);
  };

  return {
    authTab,
    setAuthTab,
    email,
    setEmail,
    rememberMe,
    setRememberMe,
    password,
    setPassword,
    session,
    submitAuth,
    signOut
  };
}

