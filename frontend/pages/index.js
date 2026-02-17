import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import { formatItemLabel } from "../utils/formatters";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [similarResults, setSimilarResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const disabled = useMemo(() => !file || loading || !session, [file, loading, session]);

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
    setError("");
    const { error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) {
      setError(authError.message);
      return;
    }
  };

  const signIn = async () => {
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
    }
  };

  const signOut = async () => {
    setError("");
    await supabase.auth.signOut();
    setAnalysis(null);
    setSimilarResults([]);
    setFile(null);
    setPreviewUrl("");
  };

  const onFileChange = (event) => {
    const selected = event.target.files?.[0];
    setError("");
    setAnalysis(null);
    setSimilarResults([]);

    if (!selected) {
      setFile(null);
      setPreviewUrl("");
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const runAnalysis = async () => {
    if (!file) {
      setError("Please select an image first.");
      return;
    }

    if (!session?.access_token) {
      setError("Please sign in first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const analyzeRes = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!analyzeRes.ok) {
        const errorBody = await analyzeRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to analyze outfit.");
      }

      const analyzeJson = await analyzeRes.json();
      setAnalysis(analyzeJson);

      const similarRes = await fetch(`${API_BASE}/api/similar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ items: analyzeJson.items || [] })
      });

      if (!similarRes.ok) {
        const errorBody = await similarRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to search similar items.");
      }

      const similarJson = await similarRes.json();
      setSimilarResults(similarJson.results || []);
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <h1>OutfitMe v1 MVP</h1>
      <p className="subtext">Sign in, upload an outfit image, run analysis, and view similar items.</p>

      <section className="card">
        <h2>Auth</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="text-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="text-input"
        />

        <div className="button-row">
          <button onClick={signUp}>Sign up</button>
          <button onClick={signIn}>Sign in</button>
          <button onClick={signOut}>Sign out</button>
        </div>

        <p className="subtext">Session: {session ? "Active" : "Not signed in"}</p>
      </section>

      <section className="card">
        <label htmlFor="image-upload">Outfit photo</label>
        <input id="image-upload" type="file" accept="image/*" onChange={onFileChange} />

        {previewUrl ? <img className="preview" src={previewUrl} alt="Selected outfit" /> : null}

        <button onClick={runAnalysis} disabled={disabled}>
          {loading ? "Analyzing..." : "Analyze outfit"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </section>

      {analysis ? (
        <section className="card">
          <h2>Detected outfit</h2>
          <p>
            <strong>Style:</strong> {analysis.style}
          </p>
          <p>
            <strong>Photo:</strong> {analysis.storage_path}
          </p>
          <ul>
            {analysis.items.map((item) => (
              <li key={item.name}>{formatItemLabel(item)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {similarResults.length > 0 ? (
        <section className="card">
          <h2>Similar items</h2>
          <ul>
            {similarResults.map((result) => (
              <li key={`${result.store}-${result.item}`}>
                <strong>{result.item}</strong> - {result.store} - {result.price} - {result.availability}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
