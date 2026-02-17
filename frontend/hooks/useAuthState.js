import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";

export function useAuthState() {
  const [authTab, setAuthTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);

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
    toast.success("Signup successful. Check your email if confirmation is enabled.");
    return true;
  };

  const signIn = async () => {
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      toast.error(authError.message);
      return false;
    }
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
    toast.info("Signed out.");
  };

  return {
    authTab,
    setAuthTab,
    email,
    setEmail,
    password,
    setPassword,
    session,
    submitAuth,
    signOut
  };
}
