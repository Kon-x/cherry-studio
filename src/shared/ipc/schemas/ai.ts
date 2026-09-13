import { imageParamsSchema } from '@cherrystudio/provider-registry'
import type {
  AiStreamAttachResponse,
  AiStreamOpenResponse,
  AiToolApprovalRespondRequest,
  AiToolResultRequest,
  AiToolResultResponse,
  StreamChunkPayload,
  StreamDonePayload,
  StreamErrorPayload
} from '@shared/ai/transport'
import { CleanupPolicySchema, type FileEntry, FileEntrySchema } from '@shared/data/types/file'
import type { CherryMessagePart } from '@shared/data/types/message'
import {
  ImageGenerationModeSchema,
  ModelSchema,
  ServiceTierSelectionSchema,
  UniqueModelIdSchema
} from '@shared/data/types/model'
import { ReasoningEffortOptionSchema } from '@shared/types/aiSdk'
import type { EmbeddingModelUsage, LanguageModelUsage, ModelMessage } from 'ai'
import * as z from 'zod'

import { defineRoute } from '../define'
/** Clone-safe subset of `AiTransportOptions` (no signal). */
const aiTransportOptionsSchema = z.object({
  headers: z.record(z.string(), z.string().optional()).optional(),
  timeout: z.number().optional(),
  maxRetries: z.number().optional()
})

/** Clone-safe subset of `AiRequest` — the transport fields every modality shares. */
const aiRequestShape = {
  assistantId: z.string().optional(),
  // Strict `providerId::modelId` validation (separator at a real position, both
  // parts well-formed) — a malformed id is rejected here instead of throwing later
  // in `parseUniqueModelId`. The brand `z.custom<UniqueModelId>` alone only checked
  // string-ness, letting a bad id penetrate to the routing code.
  uniqueModelId: UniqueModelIdSchema.optional(),
  requestOptions: aiTransportOptionsSchema.optional()
}

/** Clone-safe subset of `AiChatRequest`; `conversation` is assigned by the handler. */
const aiChatRequestShape = {
  ...aiRequestShape,
  mcpToolIds: z.array(z.string()).optional()
}

const aiImagePayloadSchema = z.strictObject({
  ...aiRequestShape,
  prompt: z.string(),
  /**
   * The image-generation mode (which tab). A request property — NOT a param — so
   * main can derive per-model transport routing (`vendorTransport` → descriptor)
   * from the registry itself. Defaults to `generate` when absent.
   */
  mode: ImageGenerationModeSchema.optional(),
  /**
   * The canonical param bag, validated + coerced at the IPC boundary by the
   * catalog value schema — the router's `safeParse` yields a typed `ParamValues`
   * (non-catalog keys stripped). Per-model option/range constraints already ran
   * in the renderer's `buildParamsSchema`; this is the value-type gate.
   */
  paramValues: imageParamsSchema,
  /** Attached images / mask are encoded file bytes (data URLs), not form params. */
  inputImages: z.array(z.string()).optional(),
  mask: z.string().optional(),
  // Required: the calling business feature decides the cleanup intent for the
  // generated OUTPUT entries (file-entry-cleanup.md §4.1) — main never defaults it.
  // It does not reach the job path's input / mask copies: those are transport
  // scratch owned by the job, pinned to `delete_when_unreferenced`.
  cleanupPolicy: CleanupPolicySchema
})

const aiStreamRegenerateShape = {
  trigger: z.literal('regenerate-message'),
  parentAnchorId: z.string().min(1),
  userMessageParts: z.never().optional(),
  targetMode: z.never().optional(),
  reasoningEffort: ReasoningEffortOptionSchema.optional(),
  serviceTier: ServiceTierSelectionSchema.optional(),
  fastMode: z.boolean().optional()
}

const mentionedModelIdsSchema = z
  .array(UniqueModelIdSchema)
  .refine((modelIds) => new Set(modelIds).size === modelIds.length, {
    message: 'mentionedModelIds must not contain duplicate model ids'
  })
  .optional()

export const aiRequestSchemas = {
  // ── One-shot model calls, grouped by output modality (AiService) ──
  'ai.text.generate': defineRoute({
    input: z.strictObject({
      // Optional request identity pairs this one-shot call with `ai.text.abort`.
      // Callers that do not need cancellation keep the existing wire shape.
      requestId: z.string().min(1).optional(),
      ...aiChatRequestShape,
      reasoningEffort: ReasoningEffortOptionSchema.optional(),
      serviceTier: ServiceTierSelectionSchema.optional(),
      system: z.string().optional(),
      prompt: z.string().optional(),
      messages: z.array(z.custom<ModelMessage>()).optional()
    }),
    output: z.object({ text: z.string(), usage: z.custom<LanguageModelUsage>().optional() })
  }),
  'ai.text.abort': defineRoute({
    input: z.strictObject({ requestId: z.string().min(1) }),
    output: z.void()
  }),
  'ai.embedding.embed_many': defineRoute({
    input: z.strictObject({ ...aiRequestShape, values: z.array(z.string()) }),
    output: z.object({ embeddings: z.array(z.array(z.number())), usage: z.custom<EmbeddingModelUsage>().optional() })
  }),
  'ai.image.generate': defineRoute({
    // requestId pairs the request with `ai.image.abort` (the abort registry lives in AiService).
    input: z.strictObject({ requestId: z.string().min(1), payload: aiImagePayloadSchema }),
    // Pin the output to the named `FileEntry` so declaration-emit references the alias
    // instead of trying to name FileEntry's module-private phantom path brand (TS4023).
    output: z.object({ files: z.array(FileEntrySchema) }) as z.ZodType<{ files: FileEntry[] }>
  }),
  'ai.image.abort': defineRoute({
    // Was a one-way `ipcOn`; per the migration guide a one-off becomes a `void` request.
    input: z.strictObject({ requestId: z.string().min(1) }),
    output: z.void()
  }),

  // ── Provider model catalog & reachability probe (AiService) ──
  'ai.provider.model.list': defineRoute({
    input: z.strictObject({
      providerId: z.string().optional(),
      assistantId: z.string().optional(),
      throwOnError: z.boolean().optional()
    }),
    output: z.array(ModelSchema.partial())
  }),
  'ai.provider.model.check': defineRoute({
    input: z.strictObject({
      ...aiRequestShape,
      apiKeyOverride: z.string().optional(),
      timeout: z.number().optional()
    }),
    output: z.object({ latency: z.number() })
  }),

  // ── Streaming chat (AiStreamManager) ──
  // Requests are R→M; the produced chunk/done/error events ride the AiEventSchemas block below.
  'ai.stream.open': defineRoute({
    // Variant union mirrors AiStreamOpenRequest. `userMessageParts` is opaque pass-through
    // (main persists it), so its items are `z.custom<CherryMessagePart>()`.
    input: z.intersection(
      z.object({
        topicId: z.string().min(1),
        mentionedModelIds: mentionedModelIdsSchema
      }),
      z.union([
        z.object({
          trigger: z.literal('submit-message'),
          parentAnchorId: z.string().optional(),
          userMessageParts: z.array(z.custom<CherryMessagePart>()),
          targetMode: z.enum(['active-path', 'reserved-branch']).optional(),
          retryMessageId: z.never().optional(),
          appendToLiveGroupMessageId: z.never().optional(),
          reasoningEffort: ReasoningEffortOptionSchema.optional(),
          serviceTier: ServiceTierSelectionSchema.optional(),
          fastMode: z.boolean().optional(),
          enableWebSearch: z.boolean().optional()
        }),
        z.object({
          ...aiStreamRegenerateShape,
          retryMessageId: z.string().min(1),
          appendToLiveGroupMessageId: z.never().optional()
        }),
        z.object({
          ...aiStreamRegenerateShape,
          retryMessageId: z.never().optional(),
          appendToLiveGroupMessageId: z.string().min(1)
        }),
        z.object({
          ...aiStreamRegenerateShape,
          retryMessageId: z.never().optional(),
          appendToLiveGroupMessageId: z.never().optional()
        })
      ])
    ),
    output: z.custom<AiStreamOpenResponse>()
  }),
  'ai.stream.attach': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.custom<AiStreamAttachResponse>()
  }),
  'ai.stream.detach': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.void()
  }),
  'ai.stream.abort': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.void()
  }),

  // ── Tool calls: deferred results + approval decisions. Spans two owners
  // (AiStreamManager holds the live output, AiService applies the decision) —
  // the subtree groups by domain, not by service.
  'ai.tool.get_result': defineRoute({
    // Mirrors AiToolResultRequest (z.ZodType pins exact-shape drift here, not in a test).
    input: z.strictObject({
      topicId: z.string().min(1),
      messageId: z.string().min(1),
      toolCallId: z.string().min(1)
    }) satisfies z.ZodType<AiToolResultRequest>,
    output: z.custom<AiToolResultResponse>()
  }),
  'ai.tool.respond_approval': defineRoute({
    // Mirrors AiToolApprovalRespondRequest (z.ZodType pins exact-shape drift here, not in a test).
    // strictObject for parity with the model-op routes — reject unknown keys rather than strip them.
    input: z.strictObject({
      approvalId: z.string().min(1),
      approved: z.boolean(),
      reason: z.string().optional(),
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      topicId: z.string().optional(),
      anchorId: z.string().optional()
    }) satisfies z.ZodType<AiToolApprovalRespondRequest>,
    output: z.object({ ok: z.boolean() })
  })
}

/**
 * AI events (M→R, pure types — main is the TCB that builds them). High-frequency topic
 * streams: `AiStreamManager`'s per-(topic,window) `WebContentsListener` emits these via
 * directed `webContents.send` on the IpcApi event channel (class-B topic stream), keeping
 * its coalescing/liveness intact — it does not `broadcast`.
 */
export type AiEventSchemas = {
  'ai.stream.chunk': StreamChunkPayload
  'ai.stream.done': StreamDonePayload
  'ai.stream.error': StreamErrorPayload
  // Auto-rename push (broadcast): a background job renamed a topic / agent session; any
  // window showing it should invalidate its cache.
  'ai.topic.auto_renamed': { topicId: string }
  // Auto-rename failure (broadcastToType Main): a background naming job's summarization call
  // failed (e.g. the naming model returned an auth error). Delivered to the main window only
  // — the job has no origin window — which surfaces it as a toast so the failure isn't silent.
  'ai.topic.naming_failed': { message: string }
}
