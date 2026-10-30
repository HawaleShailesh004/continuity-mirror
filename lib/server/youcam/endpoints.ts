// Pinned YouCam paths, verified live on 26 Oct (docs/YOUCAM_FACTS.md). Task paths come from STEP_META.
import { STEP_META } from "@/lib/catalog/pipeline";

export const ENDPOINTS = {
  credit: "/s2s/v1.0/client/credit",
  featureCost: "/s2s/v2.0/credit/feature-cost",
  /** One upload serves hair-transfer, hair-color and makeup-vto (verified). */
  fileUpload: "/s2s/v2.0/file",
  templates: "/s2s/v2.1/task/template/hair-transfer",
  task: (kind: keyof typeof STEP_META) => STEP_META[kind].endpoint,
  taskStatus: (kind: keyof typeof STEP_META, taskId: string) => `${STEP_META[kind].endpoint}/${encodeURIComponent(taskId)}`,
} as const;

/** `page_size` must be below 50 (50 → 400 InvalidParameters). */
export const TEMPLATE_PAGE_SIZE = 20;
