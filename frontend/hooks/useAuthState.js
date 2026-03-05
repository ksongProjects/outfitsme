import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";

const REMEMBER_EMAIL_KEY = "outfitsme_remember_email";
const REMEMBER_EMAIL_ENABLED_KEY = "outfitsme_remember_email_enabled";

const getRememberEmailEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY) === "1";
};

const getRememberedEmail = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
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

  const clearAuthInputs = (keepEmail = false) => {
    setPassword("");
    if (!keepEmail) {
      setEmail("");
    }
  };

  useEffect(() => {
    let mounted = true;

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

  const signUp = async () => {
    const { error: authError } = await supabase.auth.signUp({ email, password });
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

  const submitAuth = async (event) => {
    event.preventDefault();
    if (authTab === "signin") {
      await signIn();
      return;
    }
    await signUp();
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

