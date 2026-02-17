import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import { formatItemLabel } from "../utils/formatters";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export default function HomePage() {
  const [authTab, setAuthTab] = useState("signin");
  const [dashboardTab, setDashboardTab] = useState("analyze");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [similarResults, setSimilarResults] = useState([]);
  const [wardrobe, setWardrobe] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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

  useEffect(() => {
    if (session?.access_token) {
      loadWardrobe().catch((err) => {
        setError(err.message || "Failed to load wardrobe.");
      });
    }
  }, [session?.access_token]);

  const signUp = async () => {
    setError("");
    setInfo("");

    const { error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) {
      setError(authError.message);
      return;
    }

    setInfo("Signup successful. Check your email if confirmation is enabled, then sign in.");
  };

  const signIn = async () => {
    setError("");
    setInfo("");

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      return;
    }

    setInfo("Signed in successfully.");
  };

  const signOut = async () => {
    setError("");
    setInfo("");
    await supabase.auth.signOut();
    setAnalysis(null);
    setSimilarResults([]);
    setWardrobe([]);
    setFile(null);
    setPreviewUrl("");
    setDashboardTab("analyze");
  };

  const onFileChange = (event) => {
    const selected = event.target.files?.[0];
    setError("");
    setInfo("");
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
    setInfo("");

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
      await loadWardrobe();
      setInfo("Analysis complete and saved to your wardrobe.");
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const loadWardrobe = async () => {
    if (!session?.access_token) {
      return;
    }

    const wardrobeRes = await fetch(`${API_BASE}/api/wardrobe`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (!wardrobeRes.ok) {
      const errorBody = await wardrobeRes.json().catch(() => ({}));
      throw new Error(errorBody.error || "Failed to load wardrobe.");
    }

    const wardrobeJson = await wardrobeRes.json();
    setWardrobe(wardrobeJson.wardrobe || []);
  };

  if (!session) {
    return (
      <main className="landing">
        <header className="topbar">
          <div className="brand">OutfitMe</div>
          <button className="ghost-btn" onClick={() => setAuthTab("signin")}>Sign in</button>
        </header>

        <section className="hero">
          <div>
            <p className="eyebrow">OutfitMe v1</p>
            <h1>Find your style from one photo.</h1>
            <p className="hero-copy">
              Upload outfit images, identify clothing items with AI, and build your wardrobe with shoppable alternatives.
            </p>
            <div className="hero-actions">
              <button className="primary-btn" onClick={() => setAuthTab("signup")}>Get started</button>
              <button className="ghost-btn" onClick={() => setAuthTab("signin")}>I already have an account</button>
            </div>
          </div>

          <div className="auth-panel card">
            <div className="tab-row">
              <button
                className={`tab-btn ${authTab === "signin" ? "active" : ""}`}
                onClick={() => setAuthTab("signin")}
              >
                Sign in
              </button>
              <button
                className={`tab-btn ${authTab === "signup" ? "active" : ""}`}
                onClick={() => setAuthTab("signup")}
              >
                Sign up
              </button>
            </div>

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

            {authTab === "signin" ? (
              <button className="primary-btn" onClick={signIn}>Sign in</button>
            ) : (
              <button className="primary-btn" onClick={signUp}>Create account</button>
            )}

            {info ? <p className="info">{info}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>

        <section className="feature-grid">
          <article className="feature-card">
            <h3>Analyze Outfit</h3>
            <p>Use Gemini to detect style and clothing items from photos.</p>
          </article>
          <article className="feature-card">
            <h3>Build Wardrobe</h3>
            <p>Save analyzed looks and browse them with signed private image access.</p>
          </article>
          <article className="feature-card">
            <h3>Find Similar</h3>
            <p>Get similar item suggestions and price availability for each detected item.</p>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">OutfitMe Dashboard</p>
          <h1>Welcome back</h1>
          <p className="subtext">{session.user?.email}</p>
        </div>
        <button className="ghost-btn" onClick={signOut}>Sign out</button>
      </header>

      <section className="card">
        <div className="tab-row">
          <button
            className={`tab-btn ${dashboardTab === "analyze" ? "active" : ""}`}
            onClick={() => setDashboardTab("analyze")}
          >
            Analyze outfit
          </button>
          <button
            className={`tab-btn ${dashboardTab === "wardrobe" ? "active" : ""}`}
            onClick={() => setDashboardTab("wardrobe")}
          >
            Wardrobe
          </button>
        </div>

        {dashboardTab === "analyze" ? (
          <div className="analysis-layout">
            <section>
              <label htmlFor="image-upload">Outfit photo</label>
              <input id="image-upload" type="file" accept="image/*" onChange={onFileChange} />
              {previewUrl ? <img className="preview" src={previewUrl} alt="Selected outfit" /> : null}
              <button className="primary-btn" onClick={runAnalysis} disabled={disabled}>
                {loading ? "Analyzing..." : "Analyze outfit"}
              </button>
            </section>

            <section>
              <h2>Results</h2>
              {!analysis ? <p className="subtext">Run analysis to view detected style and items.</p> : null}
              {analysis ? (
                <>
                  <p>
                    <strong>Style:</strong> {analysis.style}
                  </p>
                  <ul>
                    {analysis.items.map((item) => (
                      <li key={item.name}>{formatItemLabel(item)}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {similarResults.length > 0 ? (
                <>
                  <h3>Similar items</h3>
                  <ul>
                    {similarResults.map((result) => (
                      <li key={`${result.store}-${result.item}`}>
                        <strong>{result.item}</strong> - {result.store} - {result.price} - {result.availability}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>
        ) : (
          <section>
            <div className="toolbar-row">
              <h2>Your wardrobe</h2>
              <button className="ghost-btn" onClick={loadWardrobe}>Refresh</button>
            </div>

            {wardrobe.length === 0 ? <p className="subtext">No outfits yet. Analyze your first photo.</p> : null}

            <div className="wardrobe-grid">
              {wardrobe.map((entry) => (
                <article key={entry.photo_id} className="wardrobe-card">
                  {entry.image_url ? (
                    <img src={entry.image_url} alt="Wardrobe outfit" className="wardrobe-image" />
                  ) : (
                    <p className="subtext">Image not available.</p>
                  )}
                  <p>
                    <strong>Style:</strong> {entry.analysis?.style_label || "Unlabeled"}
                  </p>
                  <ul>
                    {(entry.analysis?.items || []).map((item) => (
                      <li key={`${entry.photo_id}-${item.name}`}>{formatItemLabel(item)}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}

        {info ? <p className="info">{info}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
