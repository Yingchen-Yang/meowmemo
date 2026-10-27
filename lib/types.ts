export type Cat = { id: string; name: string; photo?: string; createdAt: string };

export type UserProfile = {
  id: string;
  displayName: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
};

export type Detection = "likely_meow" | "uncertain" | "not_detected";
export type AnalysisMode = "database_match" | "database_plus_ai";
export type AnalysisSource = "exact_reference_match" | "database_match" | "acoustic_classifier" | "none";

export type Analysis = {
  detection: Detection;
  analysis_mode?: AnalysisMode;
  result_source?: AnalysisSource;
  matched_reference_id?: string | null;
  reference_provenance?: string | null;
  suggested_context?: string;
  context: "B" | "F" | "I" | null;
  context_label: string | null;
  evidence: string;
  fallback_used?: boolean;
  quality: "usable" | "limited";
  model_version: string;
  detection_model_version?: string;
  disclaimer: string;
};

export type OwnerLabel = "Waiting for food" | "Brushing" | "Isolation in an unfamiliar room" | "Other" | "Unknown";
export type SupportedContext = Exclude<OwnerLabel, "Other" | "Unknown">;
export type CaptionBasis = "inferred_context" | "owner_corrected_context";

export type Recording = {
  id: string;
  catId: string;
  createdAt: string;
  duration: number;
  mimeType: string;
  peaks: number[];
  analysis: Analysis;
  analysisMode?: AnalysisMode;
  analysisSource?: AnalysisSource;
  originalInferredContext?: OwnerLabel;
  ownerConfirmedContext?: OwnerLabel;
  povCaption?: string;
  povCaptions?: Partial<Record<SupportedContext, string>>;
  captionVersion?: string;
  captionBasis?: CaptionBasis;
  ownerLabel: OwnerLabel;
  note: string;
};

export type PreparedAudio = { blob: Blob; url: string; duration: number; samples: number[]; sampleRate: number; peaks: number[] };
