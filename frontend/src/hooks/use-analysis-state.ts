"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type {
  AnalysisLimits,
  CompletedAnalysisEntry,
  AnalysisResult,
  CropArea,
  JobStatus,
  ModelOption,
} from "@/lib/types";

const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const MODELS_STALE_MS = 5 * 60 * 1000;
const LIMITS_STALE_MS = 30 * 1000;
const ANALYSIS_JOB_POLL_MS = 2_000;

type SimilarResultsPayload = {
  results?: Array<{
    item: string;
    store: string;
    price: string;
    availability: string;
    delivery_timeline: string;
  }>;
};

type AnalyzeSubmitPayload = {
  job_id?: string;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
  result?: {
    progress?: JobStatus["progress"];
  } | null;
  items?: AnalysisResult["items"];
};

type AnalyzeJobPayload = {
  job_id?: string | null;
  status?: string;
  error_message?: string | null;
  result?: (AnalysisResult & { progress?: JobStatus["progress"] }) | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

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
  const [completedAnalyses, setCompletedAnalyses] = useState<CompletedAnalysisEntry[]>([]);
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
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [activeAnalysisCount, setActiveAnalysisCount] = useState(0);
  const [pendingJobs, setPendingJobs] = useState<Array<{ jobId: string }>>([]);
  const queryClient = useQueryClient();
  const handledJobIdsRef = useRef<Set<string>>(new Set());
  const processingJobIdsRef = useRef<Set<string>>(new Set());

  const modelsQuery = useQuery({
    queryKey: ["models", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load models.");
      }

      return response.json() as Promise<{ models?: ModelOption[]; preferred_model?: string }>;
    },
    enabled: Boolean(accessToken),
    staleTime: MODELS_STALE_MS,
  });

  const limitsQuery = useQuery({
    queryKey: ["limits", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/limits`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load usage limits.");
      }

      return response.json() as Promise<{ analysis?: AnalysisLimits | null }>;
    },
    enabled: Boolean(accessToken),
    staleTime: LIMITS_STALE_MS,
  });

  const modelOptions = useMemo(
    () => (modelsQuery.data?.models ?? []) as ModelOption[],
    [modelsQuery.data?.models]
  );
  const analysisLimits = (limitsQuery.data?.analysis || null) as AnalysisLimits | null;
  const loading = activeAnalysisCount > 0;
  const disabled = useMemo(
    () => !file || !accessToken || activeAnalysisCount >= MAX_CONCURRENT_ANALYSIS_JOBS,
    [file, accessToken, activeAnalysisCount]
  );

  useEffect(() => {
    if (!accessToken) {
      setSelectedModel(DEFAULT_MODEL_ID);
      return;
    }

    setSelectedModel((currentModel) => {
      const currentEntry = modelOptions.find(
        (model) => model.id === currentModel && model.supports_image && model.available
      );
      if (currentEntry) {
        return currentModel;
      }

      const preferredModelId = modelsQuery.data?.preferred_model || DEFAULT_MODEL_ID;
      const preferredEntry = modelOptions.find(
        (model) => model.id === preferredModelId && model.supports_image && model.available
      );
      if (preferredEntry) {
        return preferredEntry.id;
      }

      const fallbackEntry = modelOptions.find((model) => model.supports_image && model.available);
      return fallbackEntry?.id || DEFAULT_MODEL_ID;
    });
  }, [accessToken, modelOptions, modelsQuery.data?.preferred_model]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const mapJobPayloadToStatus = (payload: AnalyzeSubmitPayload | AnalyzeJobPayload): JobStatus => ({
    jobId: payload.job_id || null,
    status: payload.status || "queued",
    updatedAt: payload.updated_at || payload.created_at || null,
    progress: payload.result?.progress || null,
  });

  const fetchSimilarResults = async (analyzeJson: AnalysisResult) => {
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

    return (await similarRes.json()) as SimilarResultsPayload;
  };

  const finalizeSuccessfulAnalysis = async (payload: AnalyzeJobPayload | AnalyzeSubmitPayload) => {
    const analyzeJson = (payload.result || payload) as AnalysisResult;
    if (!Array.isArray(analyzeJson?.items)) {
      throw new Error("Analyze request did not return a valid result payload.");
    }

    const similarJson = await fetchSimilarResults(analyzeJson);

    setJobStatus({
      ...mapJobPayloadToStatus(payload),
      status: "completed",
    });
    setAnalysis(analyzeJson);
    setCompletedAnalyses((current) => [
      {
        job_id: payload.job_id || null,
        status: "completed",
        completed_at: "completed_at" in payload ? payload.completed_at || payload.updated_at || null : payload.updated_at || null,
        updated_at: payload.updated_at || payload.created_at || null,
        result: analyzeJson,
      },
      ...current.filter((entry) => {
        const currentJobId = String(entry.job_id || "").trim();
        const nextJobId = String(payload.job_id || "").trim();
        if (currentJobId && nextJobId) {
          return currentJobId !== nextJobId;
        }
        return String(entry.result.photo_id || "").trim() !== String(analyzeJson.photo_id || "").trim();
      }),
    ]);
    setSimilarResults(similarJson.results || []);
    setError("");
    setInfo("Analysis complete and saved to your wardrobe.");
    toast.success("Photo analyzed and saved.");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["history", accessToken] }),
      queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] }),
      queryClient.invalidateQueries({ queryKey: ["items", accessToken] }),
      queryClient.invalidateQueries({ queryKey: ["limits", accessToken] }),
      queryClient.invalidateQueries({ queryKey: ["stats", accessToken] }),
    ]);

    onAnalysisSaved?.();
  };

  const handleFailedAnalysis = (payload: AnalyzeJobPayload | null, fallbackMessage?: string) => {
    const message = fallbackMessage || payload?.error_message || "Analysis job failed.";
    const friendly = toUserFriendlyAnalyzeError(message);
    if (payload) {
      setJobStatus({
        ...mapJobPayloadToStatus(payload),
        status: "failed",
      });
    } else {
      setJobStatus((current) => (current ? { ...current, status: "failed" } : current));
    }
    setError(friendly);
    setInfo("");
    toast.error(friendly);
  };

  const analysisJobQueries = useQueries({
    queries: pendingJobs.map((job) => ({
      queryKey: ["analysis-job", accessToken, job.jobId],
      queryFn: async () => {
        const pollRes = await fetch(`${API_BASE}/api/analyze/jobs/${job.jobId}?wait_seconds=0`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!pollRes.ok) {
          const errorBody = await pollRes.json().catch(() => ({}));
          throw new Error(errorBody.error || "Failed to fetch analysis job status.");
        }

        return (await pollRes.json()) as AnalyzeJobPayload;
      },
      enabled: Boolean(accessToken),
      staleTime: 0,
      retry: 3,
      refetchInterval: (query: { state: { data?: AnalyzeJobPayload } }) => {
        const status = query.state.data?.status;
        return status === "completed" || status === "failed" ? false : ANALYSIS_JOB_POLL_MS;
      },
      refetchIntervalInBackground: true,
    })),
  });

  const latestPendingJobQuery =
    pendingJobs.length > 0 ? analysisJobQueries[pendingJobs.length - 1] : null;
  const latestPendingJobPayload = latestPendingJobQuery?.data as AnalyzeJobPayload | undefined;

  const syncLatestJobStatus = useEffectEvent((payload: AnalyzeJobPayload) => {
    setJobStatus((current) => {
      const nextStatus = mapJobPayloadToStatus(payload);
      if (
        current?.jobId === nextStatus.jobId &&
        current?.status === nextStatus.status &&
        current?.updatedAt === nextStatus.updatedAt &&
        JSON.stringify(current?.progress || null) === JSON.stringify(nextStatus.progress || null)
      ) {
        return current;
      }
      return nextStatus;
    });
  });

  const processTerminalJob = useEffectEvent(async (jobId: string, payload: AnalyzeJobPayload) => {
    try {
      if (payload.status === "completed") {
        await finalizeSuccessfulAnalysis(payload);
      } else {
        handleFailedAnalysis(payload);
      }
    } catch (err) {
      handleFailedAnalysis(payload, (err as Error).message);
    } finally {
      handledJobIdsRef.current.add(jobId);
      processingJobIdsRef.current.delete(jobId);
      setPendingJobs((current) => current.filter((job) => job.jobId !== jobId));
      setActiveAnalysisCount((current) => Math.max(0, current - 1));
      queryClient.removeQueries({ queryKey: ["analysis-job", accessToken, jobId] });
    }
  });

  useEffect(() => {
    if (!latestPendingJobPayload) {
      return;
    }

    syncLatestJobStatus(latestPendingJobPayload);
  }, [latestPendingJobPayload, latestPendingJobQuery?.dataUpdatedAt]);

  useEffect(() => {
    const nextTerminalJob = pendingJobs.find((job, index) => {
      const payload = analysisJobQueries[index]?.data as AnalyzeJobPayload | undefined;
      const status = payload?.status || "";
      return (
        (status === "completed" || status === "failed") &&
        !handledJobIdsRef.current.has(job.jobId) &&
        !processingJobIdsRef.current.has(job.jobId)
      );
    });

    if (!nextTerminalJob) {
      return;
    }

    const nextTerminalIndex = pendingJobs.findIndex((job) => job.jobId === nextTerminalJob.jobId);
    const terminalPayload = analysisJobQueries[nextTerminalIndex]?.data as AnalyzeJobPayload | undefined;
    if (!terminalPayload) {
      return;
    }

    processingJobIdsRef.current.add(nextTerminalJob.jobId);

    void processTerminalJob(nextTerminalJob.jobId, terminalPayload);
  }, [analysisJobQueries, pendingJobs]);

  const analyzeMutation = useMutation({
    mutationFn: async ({ fileToAnalyze, modelId }: { fileToAnalyze: File; modelId: string }) => {
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

      return (await analyzeRes.json()) as AnalyzeSubmitPayload;
    },
  });

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
      // Fall back to the browser's standard image decoder for mobile-captured files.
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

  const refreshAnalysisLimits = async () => {
    if (!accessToken) {
      return;
    }

    const result = await limitsQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load usage limits.");
    }
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
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
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
      let shouldReleaseSlot = true;

      try {
        const fileToAnalyze = await buildCroppedFile(file, cropArea);
        if (fileToAnalyze !== file) {
          setInfo("Using selected crop area for analysis.");
        }
        const analyzePayload = await analyzeMutation.mutateAsync({ fileToAnalyze, modelId: selectedModel });

        if (Array.isArray(analyzePayload.items)) {
          await finalizeSuccessfulAnalysis(analyzePayload);
          return;
        }

        if (!analyzePayload.job_id) {
          throw new Error("Analyze request did not return a valid job payload.");
        }

        shouldReleaseSlot = false;
        setJobStatus(mapJobPayloadToStatus(analyzePayload));
        setPendingJobs((current) => [
          ...current.filter((job) => job.jobId !== analyzePayload.job_id),
          {
            jobId: analyzePayload.job_id!,
          },
        ]);
        await queryClient.invalidateQueries({ queryKey: ["history", accessToken] });
      } catch (err) {
        handleFailedAnalysis(null, (err as Error).message);
      } finally {
        if (shouldReleaseSlot) {
          setActiveAnalysisCount((current) => Math.max(0, current - 1));
        }
      }
    },
    disabled,
    loading,
    analysis,
    completedAnalyses,
    similarResults,
    selectedModel,
    setSelectedModel,
    modelOptions,
    jobStatus,
    activeAnalysisCount,
    maxConcurrentAnalysisJobs: MAX_CONCURRENT_ANALYSIS_JOBS,
    analysisLimits,
    limitsLoading: limitsQuery.isLoading || limitsQuery.isFetching,
    refreshAnalysisLimits,
    resetAnalysisState: () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setAnalysis(null);
      setCompletedAnalyses([]);
      setSimilarResults([]);
      setFile(null);
      setPreviewUrl("");
      setSelectedModel(DEFAULT_MODEL_ID);
      setJobStatus(null);
      setPendingJobs([]);
      setActiveAnalysisCount(0);
      setCropArea(null);
      setError("");
      setInfo("");
      handledJobIdsRef.current.clear();
      processingJobIdsRef.current.clear();
      queryClient.removeQueries({ queryKey: ["analysis-job", accessToken] });
    },
    error,
    info,
  };
}
