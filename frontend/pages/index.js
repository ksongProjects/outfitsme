import { useEffect, useMemo, useState } from "react";

import LandingAuth from "../components/LandingAuth";
import AnalyzeTab from "../components/tabs/AnalyzeTab";
import OutfitsTab from "../components/tabs/OutfitsTab";
import ItemsTab from "../components/tabs/ItemsTab";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

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
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [error, setError] = useState("");
  const [wardrobeMessage, setWardrobeMessage] = useState("");
  const [itemsMessage, setItemsMessage] = useState("");
  const [stats, setStats] = useState({ outfits_count: 0, analyses_count: 0, items_count: 0 });
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [wardrobeLoading, setWardrobeLoading] = useState(false);
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);

  const disabled = useMemo(() => !file || loading || !session, [file, loading, session]);

  const toUserFriendlyAnalyzeError = (message) => {
    const raw = String(message || "").toLowerCase();
    if (raw.includes("unable to process input image")) {
      return "We couldn't process this image. It may be corrupted or unsupported. Please try another JPG, PNG, or WEBP file.";
    }
    if (raw.includes("image file is empty")) {
      return "The selected file is empty. Please choose a valid image.";
    }
    if (raw.includes("missing bearer token") || raw.includes("invalid or expired token")) {
      return "Your session expired. Please sign in again.";
    }
    if (raw.includes("quota") || raw.includes("rate-limit") || raw.includes("429")) {
      return "The AI service is busy right now. Please try again shortly.";
    }
    return message || "Unexpected error.";
  };

  const validateImageFile = async (candidate) => {
    if (!candidate) {
      return "Please select an image first.";
    }
    if (!candidate.type || !candidate.type.startsWith("image/")) {
      return "Please select a valid image file.";
    }
    if (candidate.size <= 0) {
      return "The selected file is empty. Please choose a valid image.";
    }

    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(candidate);
        bitmap.close();
        return "";
      }
    } catch (_err) {
      return "This image appears corrupted or unreadable. Please choose another file.";
    }

    return await new Promise((resolve) => {
      const probeUrl = URL.createObjectURL(candidate);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(probeUrl);
        resolve("");
      };
      img.onerror = () => {
        URL.revokeObjectURL(probeUrl);
        resolve("This image appears corrupted or unreadable. Please choose another file.");
      };
      img.src = probeUrl;
    });
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
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (dashboardTab === "wardrobe" && session?.access_token) {
      loadWardrobe();
    }
  }, [dashboardTab, session?.access_token]);

  useEffect(() => {
    if (dashboardTab === "items" && session?.access_token) {
      loadItems();
    }
  }, [dashboardTab, session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      loadStats();
    }
  }, [session?.access_token]);

  const signUp = async () => {
    setError("");
    setWardrobeMessage("");
    setInfo("");

    const { error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) {
      setError(authError.message);
      toast.error(authError.message);
      return;
    }

    setInfo("Signup successful. Check your email if confirmation is enabled, then sign in.");
    toast.success("Signup successful. Check your email if confirmation is enabled.");
  };

  const signIn = async () => {
    setError("");
    setWardrobeMessage("");
    setInfo("");

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      toast.error(authError.message);
      return;
    }

    setInfo("Signed in successfully.");
    toast.success("Signed in successfully.");
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
    setError("");
    setWardrobeMessage("");
    setInfo("");
    await supabase.auth.signOut();
    setAnalysis(null);
    setSimilarResults([]);
    setWardrobe([]);
    setItems([]);
    setSelectedItemIds([]);
    setFile(null);
    setPreviewUrl("");
    setDashboardTab("analyze");
    setOriginalPhotoUrl("");
    toast.info("Signed out.");
  };

  const onFileChange = async (event) => {
    const selected = event.target.files?.[0];
    await processSelectedFile(selected);
  };

  const processSelectedFile = async (selected) => {
    setError("");
    setWardrobeMessage("");
    setInfo("");
    setAnalysis(null);
    setSimilarResults([]);

    if (!selected) {
      setFile(null);
      setPreviewUrl("");
      return;
    }

    const validationError = await validateImageFile(selected);
    if (validationError) {
      setFile(null);
      setPreviewUrl("");
      setError(validationError);
      toast.error(validationError);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const onFileDrop = async (selected) => {
    await processSelectedFile(selected);
  };

  const clearSelectedFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl("");
    setAnalysis(null);
    setSimilarResults([]);
    setError("");
    setInfo("");
  };

  const runAnalysis = async () => {
    if (!file) {
      setError("Please select an image first.");
      toast.error("Please select an image first.");
      return;
    }

    if (!session?.access_token) {
      setError("Please sign in first.");
      toast.error("Please sign in first.");
      return;
    }

    setLoading(true);
    setError("");
    setWardrobeMessage("");
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
        throw new Error(errorBody.error || "Failed to analyze photo.");
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
      setInfo("Analysis complete and saved to your outfits.");
      toast.success("Photo analyzed and saved.");
      loadStats();
    } catch (err) {
      const friendly = toUserFriendlyAnalyzeError(err.message);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const loadWardrobe = async () => {
    if (!session?.access_token) {
      return;
    }

    setWardrobeLoading(true);
    setWardrobeMessage("");

    try {
      const wardrobeRes = await fetch(`${API_BASE}/api/wardrobe`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!wardrobeRes.ok) {
        const errorBody = await wardrobeRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load wardrobe right now.");
      }

      const wardrobeJson = await wardrobeRes.json();
      const entries = wardrobeJson.wardrobe || [];
      setWardrobe(entries);
      setWardrobeMessage(entries.length === 0 ? "No wardrobe entries yet. Analyze your first outfit photo." : "");
      if (entries.length === 0) {
        toast.info("No outfits yet. Analyze your first photo.");
      } else {
        toast.success("Outfits loaded.");
      }
    } catch (_err) {
      setWardrobe([]);
      setWardrobeMessage("Couldn't load your wardrobe right now. You can still analyze a new outfit.");
      toast.error("Couldn't load outfits right now.");
    } finally {
      setWardrobeLoading(false);
    }
  };

  const deleteWardrobeEntry = async (photoId) => {
    if (!session?.access_token) {
      return;
    }

    setWardrobeMessage("");
    const confirmed = window.confirm("Delete this outfit from your wardrobe?");
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete wardrobe item.");
      }

      setWardrobe((prev) => prev.filter((entry) => entry.photo_id !== photoId));
      setWardrobeMessage("Outfit removed.");
      toast.success("Outfit deleted.");
      loadStats();
    } catch (_err) {
      setWardrobeMessage("Could not delete this outfit right now. Please try again.");
      toast.error("Could not delete outfit right now.");
    }
  };

  const openOriginalPhoto = async (photoId) => {
    if (!session?.access_token) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/original`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to load original photo.");
      }

      const payload = await response.json();
      setOriginalPhotoUrl(payload.image_url || "");
      if (!payload.image_url) {
        toast.error("Original photo is unavailable.");
      }
    } catch (_err) {
      setWardrobeMessage("Could not load original photo right now.");
      toast.error("Could not load original photo.");
    }
  };

  const closeOriginalPhoto = () => setOriginalPhotoUrl("");

  const loadItems = async () => {
    if (!session?.access_token) {
      return;
    }

    setItemsLoading(true);
    setItemsMessage("");

    try {
      const itemsRes = await fetch(`${API_BASE}/api/items`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!itemsRes.ok) {
        const errorBody = await itemsRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load items right now.");
      }

      const itemsJson = await itemsRes.json();
      const rows = itemsJson.items || [];
      setItems(rows);
      setItemsMessage(rows.length === 0 ? "No items yet. Analyze an outfit to populate your item catalog." : "");
      if (rows.length === 0) {
        toast.info("No items yet.");
      }
    } catch (_err) {
      setItems([]);
      setItemsMessage("Couldn't load item catalog right now.");
      toast.error("Couldn't load item catalog.");
    } finally {
      setItemsLoading(false);
    }
  };

  const loadStats = async () => {
    if (!session?.access_token) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/stats`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setStats(payload.stats || { outfits_count: 0, analyses_count: 0, items_count: 0 });
    } catch (_err) {
      // Stats are optional for UX; ignore failures.
    }
  };

  const toggleSelectItem = (itemId) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));

  if (!session) {
    return (
      <LandingAuth
        authTab={authTab}
        setAuthTab={setAuthTab}
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        submitAuth={submitAuth}
      />
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
            Analyze photo
          </button>
          <button
            className={`tab-btn ${dashboardTab === "wardrobe" ? "active" : ""}`}
            onClick={() => setDashboardTab("wardrobe")}
          >
            Outfits
          </button>
          <button
            className={`tab-btn ${dashboardTab === "items" ? "active" : ""}`}
            onClick={() => setDashboardTab("items")}
          >
            Items
          </button>
        </div>

        <div className="stats-grid">
          <article className="stats-card">
            <p className="stats-label">Outfits Analyzed</p>
            <p className="stats-value">{stats.analyses_count}</p>
          </article>
          <article className="stats-card">
            <p className="stats-label">Outfits Saved</p>
            <p className="stats-value">{stats.outfits_count}</p>
          </article>
          <article className="stats-card">
            <p className="stats-label">Items Cataloged</p>
            <p className="stats-value">{stats.items_count}</p>
          </article>
          <article className="stats-card">
            <p className="stats-label">Items Selected</p>
            <p className="stats-value">{selectedItemIds.length}</p>
          </article>
        </div>

        {dashboardTab === "analyze" ? (
          <AnalyzeTab
            previewUrl={previewUrl}
            onFileChange={onFileChange}
            onFileDrop={onFileDrop}
            fileName={file?.name || ""}
            clearSelectedFile={clearSelectedFile}
            runAnalysis={runAnalysis}
            disabled={disabled}
            loading={loading}
            analysis={analysis}
            similarResults={similarResults}
          />
        ) : null}

        {dashboardTab === "wardrobe" ? (
          <OutfitsTab
            wardrobe={wardrobe}
            wardrobeLoading={wardrobeLoading}
            wardrobeMessage={wardrobeMessage}
            loadWardrobe={loadWardrobe}
            deleteWardrobeEntry={deleteWardrobeEntry}
            openOriginalPhoto={openOriginalPhoto}
            originalPhotoUrl={originalPhotoUrl}
            closeOriginalPhoto={closeOriginalPhoto}
          />
        ) : null}

        {dashboardTab === "items" ? (
          <ItemsTab
            items={items}
            itemsLoading={itemsLoading}
            itemsMessage={itemsMessage}
            loadItems={loadItems}
            selectedItemIds={selectedItemIds}
            toggleSelectItem={toggleSelectItem}
            selectedItems={selectedItems}
          />
        ) : null}

      </section>
    </main>
  );
}
