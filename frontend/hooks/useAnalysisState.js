import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useAnalysisState({ accessToken, onAnalysisSaved }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [similarResults, setSimilarResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [modelOptions, setModelOptions] = useState([]);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");

  const disabled = useMemo(() => !file || loading || !accessToken, [file, loading, accessToken]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

  const processSelectedFile = async (selected) => {
    setError("");
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

  const onFileChange = async (event) => {
    const selected = event.target.files?.[0];
    await processSelectedFile(selected);
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

    if (!accessToken) {
      setError("Please sign in first.");
      toast.error("Please sign in first.");
      return;
    }
    const selectedModelEntry = modelOptions.find((model) => model.id === selectedModel);
    if (!selectedModelEntry || !selectedModelEntry.supports_image || !selectedModelEntry.available) {
      toast.error("Selected model is unavailable for image analysis. Update model keys in Settings.");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("analysis_model", selectedModel);

      const analyzeRes = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
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
          Authorization: `Bearer ${accessToken}`
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
      if (onAnalysisSaved) {
        onAnalysisSaved();
      }
    } catch (err) {
      const friendly = toUserFriendlyAnalyzeError(err.message);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const models = payload.models || [];
      setModelOptions(models);
      const preferred = payload.preferred_model || "gemini-2.5-flash";
      const preferredEntry = models.find((model) => model.id === preferred && model.supports_image && model.available);
      if (preferredEntry) {
        setSelectedModel(preferredEntry.id);
        return;
      }
      const fallback = models.find((model) => model.supports_image && model.available);
      if (fallback) {
        setSelectedModel(fallback.id);
      }
    } catch (_err) {
      // Optional UI helper only.
    }
  };

  const resetAnalysisState = () => {
    setAnalysis(null);
    setSimilarResults([]);
    setFile(null);
    setPreviewUrl("");
    setModelOptions([]);
    setSelectedModel("gemini-2.5-flash");
    setError("");
    setInfo("");
  };

  return {
    previewUrl,
    onFileChange,
    onFileDrop,
    fileName: file?.name || "",
    clearSelectedFile,
    runAnalysis,
    disabled,
    loading,
    analysis,
    similarResults,
    selectedModel,
    setSelectedModel,
    modelOptions,
    loadModels,
    resetAnalysisState,
    error,
    info
  };
}
