export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ItemRecord = {
  id: string;
  category?: string;
  name?: string;
  color?: string;
  style_label?: string;
  image_url?: string | null;
  analysis_id?: string | null;
  attributes_json?: Record<string, unknown> | null;
};

export type OutfitAnalysis = {
  outfit_id?: string;
  outfit_index?: number;
  style?: string;
  source_type?: string;
  items?: ItemRecord[];
};

export type AnalysisResult = {
  photo_id?: string;
  style?: string;
  items: ItemRecord[];
  outfits?: OutfitAnalysis[];
};

export type HistoryEntry = {
  job_id: string;
  photo_id?: string;
  analysis_model?: string;
  status?: string;
  error_message?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  updated_at?: string;
  image_url?: string;
  outfit_count?: number;
};

export type WardrobeEntry = {
  row_id?: string;
  outfit_id: string;
  photo_id: string;
  image_url?: string;
  source_outfit_image_url?: string;
  created_at?: string;
  style_label?: string;
  source_type?: string;
  source_outfit_id?: string | null;
  outfit_index?: number;
  outfit_count?: number;
  outfit_items_count?: number;
};

export type WardrobeDetails = {
  photo_id?: string;
  created_at?: string;
  image_url?: string;
  source_outfit_image_url?: string;
  style_label?: string | null;
  outfitsme_image_url?: string;
  outfits?: OutfitAnalysis[];
  selected_outfit_index?: number | null;
  selected_outfit?: OutfitAnalysis | null;
};

export type StatsPayload = {
  photos_count: number;
  outfits_count: number;
  analyses_count: number;
  items_count: number;
  generated_outfit_images_count?: number;
};

export type AnalysisLimits = {
  user_role?: string;
  trial_active?: boolean;
  trial_started_at_utc?: string | null;
  trial_ends_at_utc?: string | null;
  trial_days_total?: number;
  trial_days_remaining?: number | null;
  daily_limit?: number | null;
  used_today?: number;
  remaining_today?: number | null;
  today_window_start_utc?: string | null;
  next_reset_utc?: string | null;
  analysis_actions_today?: number;
  outfit_generations_today?: number;
  access_mode?: "trial" | "unlimited";
};

export type ModelOption = {
  id: string;
  label: string;
  supports_image: boolean;
  available: boolean;
  unavailable_reason?: string;
};

export type JobStatus = {
  jobId: string | null;
  status: string;
  updatedAt: string | null;
  progress?: {
    stage?: string;
    message?: string;
    counts?: {
      total_items?: number;
      processed_items?: number;
      generated_items?: number;
      failed_items?: number;
      disabled?: boolean;
    } | null;
    current_item?: {
      index?: number;
      category?: string;
      name?: string;
      color?: string;
    } | null;
  } | null;
};

export type CostSummary = {
  month_start_utc?: string | null;
  analysis_runs?: number;
  custom_outfit_generations?: number;
  estimated_costs_usd?: Record<string, number>;
  estimated_token_costs_usd?: Record<string, Record<string, number>>;
  token_usage_estimate?: {
    total?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
    source?: string;
  };
  unit_costs_usd?: Record<string, number>;
  token_pricing_usd_per_1m?: Record<string, number>;
};

export type SettingsFormState = {
  profile_gender: string;
  profile_age: string;
  enable_outfit_image_generation: boolean;
  enable_online_store_search: boolean;
  enable_accessory_analysis: boolean;
};
