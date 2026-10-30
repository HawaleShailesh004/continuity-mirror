// Shapes of raw YouCam responses, as observed live on 26 Oct (tests/fixtures/youcam).
// Loose objects: extra fields are tolerated, missing required ones are drift and fail loudly.
import { z } from "zod";

export const CreditResponse = z.looseObject({
  status: z.literal(200),
  results: z.array(z.looseObject({ type: z.string(), amount: z.number(), expiry: z.number().optional() })),
});

export const FeatureCostResponse = z.looseObject({
  status: z.literal(200),
  result: z.looseObject({
    skus: z.array(z.looseObject({ description: z.string(), amount: z.number(), unit: z.string(), run_task_url: z.string() })),
  }),
});

export const Template = z.looseObject({
  id: z.string(),
  thumb: z.string(),
  title: z.string(),
  category_name: z.string(),
  keep_users_color: z.boolean(),
});
export const TemplatesResponse = z.looseObject({
  status: z.literal(200),
  data: z.looseObject({ templates: z.array(Template), next_token: z.string().nullable().optional() }),
});

export const FileInitResponse = z.looseObject({
  status: z.literal(200),
  data: z.looseObject({
    files: z
      .array(
        z.looseObject({
          file_id: z.string().min(1),
          requests: z.array(z.looseObject({ method: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) })).min(1),
        }),
      )
      .min(1),
  }),
});

export const TaskCreateResponse = z.looseObject({
  status: z.literal(200),
  data: z.looseObject({ task_id: z.string().min(1) }),
});

export const TaskStatus = z.enum(["running", "success", "error"]);
export const TaskPollResponse = z.looseObject({
  status: z.literal(200),
  data: z.looseObject({
    task_status: TaskStatus,
    error: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
    results: z.looseObject({ url: z.string() }).nullable().optional(),
  }),
});
export type TaskPollResponse = z.infer<typeof TaskPollResponse>;

/** Error body on HTTP 4xx/5xx, e.g. 400 InvalidParameters, 401 InvalidAccessToken. */
export const HttpErrorResponse = z.looseObject({
  status: z.number(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  message: z.string().optional(),
});
