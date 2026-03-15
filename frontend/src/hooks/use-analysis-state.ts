"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type {
  AnalysisLimits,
  AnalysisResult,
  CropArea,
  HistoryEntry,
  ItemRecord,
  JobStatus,
  ModelOption,
  WardrobeEntry,
} from "@/lib/types";

export function useAnalysisState({
  accessToken,
  onAnalysisSaved,
}: {
  accessToken: string;
  onAnalysisSaved?: () => void;
}) {
  const MAX_CONCURRENT_ANALYSIS_JOBS = 5;
  const MAX_ANALYZE_IMAGE_SIDE = 1024;
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [similarResults, setSimilarResults] = useState<
    Array<{
      item: string;
      store: string;
      price: string;
      availability: string;
      delivery_timeline: string;
    }>
  >([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [analysisLimits, setAnalysisLimits] = useState<AnalysisLimits | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [activeAnalysisCount, setActiveAnalysisCount] = useState(0);
  const queryClient = useQueryClient();

  const refreshHistoryCache = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${API_BASE}/api/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) return;
      const payload = await response.json();
      queryClient.setQueryData(["history", accessToken], (payload.history || []) as HistoryEntry[]);
    } catch {
      // Best effort only.
    }
  };

  const refreshWardrobeCache = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${API_BASE}/api/wardrobe`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) return;
      const payload = await response.json();
      queryClient.setQueryData(["wardrobe", accessToken], (payload.wardrobe || []) as WardrobeEntry[]);
    } catch {
      // Best effort only.
    }
  };

  const refreshItemsCache = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${API_BASE}/api/items`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) return;
      const payload = await response.json();
      queryClient.setQueryData(["items", accessToken], (payload.items || []) as ItemRecord[]);
    } catch {
      // Best effort only.
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async ({ fileToAnalyze, modelId }: { fileToAnalyze: File; modelId: string }) => {
      const pollAnalyzeJob = async (jobId: string) => {
        for (let attempt = 0; attempt < 180; attempt += 1) {
          const pollRes = await fetch(`${API_BASE}/api/analyze/jobs/${jobId}?wait_seconds=2`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!pollRes.ok) {
            const errorBody = await pollRes.json().catch(() => ({}));
            throw new Error(errorBody.error || "Failed to fetch analysis job status.");
          }

          const pollJson = await pollRes.json();
          const status = pollJson.status || "queued";
          const progress = pollJson?.result?.progress || null;
          setJobStatus({
            jobId,
            status,
            updatedAt: pollJson.updated_at || null,
            progress,
          });

          if (status === "completed") {
            return pollJson.result || {};
          }
          if (status === "failed") {
            throw new Error(pollJson.error_message || "Analysis job failed.");
          }
        }

        throw new Error("Analysis timed out while waiting for job completion.");
      };

      const formData = new FormData();
      formData.append("image", fileToAnalyze);
      formData.append("analysis_model", modelId);

      const analyzeRes = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!analyzeRes.ok) {
        const errorBody = await analyzeRes.json().catch(() => ({}));
        if (
          analyzeRes.status === 429 &&
          typeof errorBody.daily_limit === "number" &&
          typeof errorBody.used_today === "number"
        ) {
          throw new Error(`Daily trial limit reached (${errorBody.used_today}/${errorBody.daily_limit}).`);
        }
        throw new Error(errorBody.error || "Failed to analyze photo.");
      }

      const analyzePayload = await analyzeRes.json();
      await refreshHistoryCache();

      let analyzeJson = analyzePayload;
      if (!Array.isArray(analyzePayload?.items) && analyzePayload?.job_id) {
        setJobStatus({
          jobId: analyzePayload.job_id,
          status: analyzePayload.status || "queued",
          updatedAt: analyzePayload.created_at || null,
          progress: analyzePayload?.result?.progress || null,
        });
        analyzeJson = await pollAnalyzeJob(analyzePayload.job_id);
      } else if (!Array.isArray(analyzePayload?.items)) {
        throw new Error("Analyze request did not return a valid result payload.");
      }

      const similarRes = await fetch(`${API_BASE}/api/similar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ items: analyzeJson.items || [] }),
      });

      if (!similarRes.ok) {
        const errorBody = await similarRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to search similar items.");
      }

      const similarJson = await similarRes.json();
      return {
        analyzeJson: analyzeJson as AnalysisResult,
        similarJson,
      };
    },
    onSuccess: async ({ analyzeJson, similarJson }) => {
      setJobStatus((current) => (current ? { ...current, status: "completed" } : current));
      setAnalysis(analyzeJson);
      setSimilarResults(similarJson.results || []);
      setInfo("Analysis complete and saved to your wardrobe.");
      toast.success("Photo analyzed and saved.");
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["items", accessToken] });
      await Promise.all([refreshHistoryCache(), refreshWardrobeCache(), refreshItemsCache()]);
      onAnalysisSaved?.();
      await loadAnalysisLimits();
    },
  });

  const loading = activeAnalysisCount > 0;
  const disabled = useMemo(
    () => !file || !accessToken || activeAnalysisCount >= MAX_CONCURRENT_ANALYSIS_JOBS,
    [file, accessToken, activeAnalysisCount]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const toUserFriendlyAnalyzeError = (message: string) => {
    const raw = String(message || "").toLowerCase();
    if (raw.includes("unable to process input image")) {
      return "We couldn't process this image. Please try another JPG, PNG, or WEBP file.";
    }
    if (raw.includes("image file is empty")) {
      return "The selected file is empty. Please choose a valid image.";
    }
    if (raw.includes("missing bearer token") || raw.includes("invalid or expired token")) {
      return "Your session expired. Please sign in again.";
    }
    if (raw.includes("trial has ended")) {
      return "Your 14-day trial has ended.";
    }
    if (raw.includes("daily trial limit reached")) {
      return "You've reached today's trial limit. Try again after the daily reset.";
    }
    if (raw.includes("analysis timed out")) {
      return "Analysis is taking longer than expected. Please check back in a moment.";
    }
    if (raw.includes("analysis job failed")) {
      return message || "Analysis job failed. Please try again.";
    }
    if (raw.includes("quota") || raw.includes("rate-limit") || raw.includes("429")) {
      return "The AI service is busy right now. Please try again shortly.";
    }
    return message || "Unexpected error.";
  };

  const validateImageFile = async (candidate: File | null) => {
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
    } catch {
      return "This image appears corrupted or unreadable. Please choose another file.";
    }

    return new Promise<string>((resolve) => {
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

  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode image."));
      image.src = url;
    });

  const buildCroppedFile = async (candidate: File, crop: CropArea | null) => {
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(candidate);
      const image = await loadImage(objectUrl);
      const originalWidth = Number(image.naturalWidth || image.width || 0);
      const originalHeight = Number(image.naturalHeight || image.height || 0);

      if (originalWidth <= 0 || originalHeight <= 0) {
        throw new Error("Unable to read image dimensions.");
      }

      let srcX = 0;
      let srcY = 0;
      let srcWidth = originalWidth;
      let srcHeight = originalHeight;
      const hasCrop = Boolean(crop && crop.width > 0 && crop.height > 0);

      if (hasCrop && crop) {
        const cropX = Math.max(0, Math.min(1, Number(crop.x) || 0));
        const cropY = Math.max(0, Math.min(1, Number(crop.y) || 0));
        const cropWidth = Math.max(0, Math.min(1 - cropX, Number(crop.width) || 0));
        const cropHeight = Math.max(0, Math.min(1 - cropY, Number(crop.height) || 0));
        if (cropWidth <= 0 || cropHeight <= 0) {
          return candidate;
        }
        srcX = Math.max(0, Math.round(cropX * originalWidth));
        srcY = Math.max(0, Math.round(cropY * originalHeight));
        srcWidth = Math.max(1, Math.round(cropWidth * originalWidth));
        srcHeight = Math.max(1, Math.round(cropHeight * originalHeight));
      } else {
        const longestOriginalSide = Math.max(originalWidth, originalHeight);
        if (longestOriginalSide <= MAX_ANALYZE_IMAGE_SIDE) {
          return candidate;
        }
      }

      const longestSide = Math.max(srcWidth, srcHeight);
      const scale =
        longestSide > MAX_ANALYZE_IMAGE_SIDE ? MAX_ANALYZE_IMAGE_SIDE / longestSide : 1;
      const outputWidth = Math.max(1, Math.round(srcWidth * scale));
      const outputHeight = Math.max(1, Math.round(srcHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to initialize image crop context.");
      }

      context.drawImage(image, srcX, srcY, srcWidth, srcHeight, 0, 0, outputWidth, outputHeight);
      const outputType =
        candidate.type && candidate.type.startsWith("image/") ? candidate.type : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), outputType, 0.9);
      });

      if (!blob) {
        throw new Error("Failed to encode resized image.");
      }

      const fileName = candidate.name || "image";
      const dotIndex = fileName.lastIndexOf(".");
      const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
      const extension =
        outputType === "image/png" ? "png" : outputType === "image/webp" ? "webp" : "jpg";
      return new File([blob], `${baseName}-prepared.${extension}`, { type: outputType });
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const processSelectedFile = async (selected: File | null) => {
    setError("");
    setInfo("");
    setAnalysis(null);
    setSimilarResults([]);
    setJobStatus(null);
    setCropArea(null);

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

  const modelsQuery = useQuery({
    queryKey: ["models", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return { models: [], preferred_model: "gemini-2.5-flash" };
      }

      const response = await fetch(`${API_BASE}/api/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load models.");
      }

      return response.json();
    },
    enabled: false,
    staleTime: 20_000,
  });

  const limitsQuery = useQuery({
    queryKey: ["limits", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return null;
      }

      const response = await fetch(`${API_BASE}/api/limits`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load usage limits.");
      }

      return response.json();
    },
    enabled: false,
    staleTime: 20_000,
  });

  const loadModels = async () => {
    if (!accessToken) return;
    const result = await modelsQuery.refetch();
    if (result.isError) return;

    const payload = result.data || {};
    const models = (payload.models || []) as ModelOption[];
    setModelOptions(models);
    const preferred = payload.preferred_model || "gemini-2.5-flash";
    const preferredEntry = models.find(
      (model) => model.id === preferred && model.supports_image && model.available
    );
    if (preferredEntry) {
      setSelectedModel(preferredEntry.id);
      return;
    }
    const fallback = models.find((model) => model.supports_image && model.available);
    if (fallback) {
      setSelectedModel(fallback.id);
    }
  };

  const loadAnalysisLimits = async () => {
    if (!accessToken) {
      setAnalysisLimits(null);
      return;
    }
    const result = await limitsQuery.refetch();
    if (result.isError) return;
    setAnalysisLimits((result.data?.analysis || null) as AnalysisLimits | null);
  };

  return {
    previewUrl,
    onFileChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] || null;
      await processSelectedFile(selected);
    },
    onFileDrop: async (selected: File) => {
      await processSelectedFile(selected);
    },
    fileName: file?.name || "",
    clearSelectedFile: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl("");
      setAnalysis(null);
      setSimilarResults([]);
      setJobStatus(null);
      setCropArea(null);
      setError("");
      setInfo("");
    },
    cropArea,
    setCropArea,
    runAnalysis: async () => {
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
        toast.error("Image analysis is unavailable right now.");
        return;
      }

      if (activeAnalysisCount >= MAX_CONCURRENT_ANALYSIS_JOBS) {
        const message = `You can queue up to ${MAX_CONCURRENT_ANALYSIS_JOBS} analysis jobs at a time.`;
        setError(message);
        toast.error(message);
        return;
      }

      setError("");
      setInfo("Analysis request submitted. Waiting for queue processing...");
      setJobStatus({ jobId: null, status: "submitting", updatedAt: null });
      setActiveAnalysisCount((current) => current + 1);

      try {
        const fileToAnalyze = await buildCroppedFile(file, cropArea);
        if (fileToAnalyze !== file) {
          setInfo("Using selected crop area for analysis.");
        }
        await analyzeMutation.mutateAsync({ fileToAnalyze, modelId: selectedModel });
      } catch (err) {
        setJobStatus((current) => (current ? { ...current, status: "failed" } : current));
        const friendly = toUserFriendlyAnalyzeError((err as Error).message);
        setError(friendly);
        toast.error(friendly);
      } finally {
        setActiveAnalysisCount((current) => Math.max(0, current - 1));
      }
    },
    disabled,
    loading,
    analysis,
    similarResults,
    selectedModel,
    setSelectedModel,
    modelOptions,
    loadModels,
    jobStatus,
    activeAnalysisCount,
    maxConcurrentAnalysisJobs: MAX_CONCURRENT_ANALYSIS_JOBS,
    analysisLimits,
    limitsLoading: limitsQuery.isFetching,
    loadAnalysisLimits,
    resetAnalysisState: () => {
      setAnalysis(null);
      setSimilarResults([]);
      setFile(null);
      setPreviewUrl("");
      setModelOptions([]);
      setSelectedModel("gemini-2.5-flash");
      setAnalysisLimits(null);
      setJobStatus(null);
      setActiveAnalysisCount(0);
      setCropArea(null);
      setError("");
      setInfo("");
    },
    error,
    info,
  };
}

