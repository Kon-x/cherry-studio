import { randomUUID } from 'node:crypto'

import { application } from '@application'
import { fileEntryService } from '@data/services/FileEntryService'
import { messageService } from '@data/services/MessageService'
import { loggerService } from '@logger'
import { inflateEntities, isToolOutputBlobEntry, reconstructOutput } from '@main/ai/contextBuild/toolOutputStore'
import { AiStreamAdmissionError, WebContentsListener } from '@main/ai/streamManager'
import { serializeError } from '@main/ai/utils/serializeError'
import type {
  AiStreamOpenRequest,
  AiToolResultResponse,
  PersistedToolOutput,
  PersistedToolOutputBlobRef
} from '@shared/ai/transport'
import { blobRefsOf, isPersistedToolOutput } from '@shared/ai/transport'
import { aiErrorCodes } from '@shared/ipc/errors/ai'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type { aiRequestSchemas } from '@shared/ipc/schemas/ai'
import type { IpcHandlersFor, WindowId } from '@shared/ipc/types'
import { isToolUIPart } from 'ai'

const logger = loggerService.withContext('ipc/ai')

/**
 * Thin adapters for the AI routes. The non-streaming model ops delegate to `AiService`;
 * the streaming-chat ops delegate to `AiStreamManager`. Business logic, provider
 * resolution, the abort registry and the stream registry all stay in those
 * services — these handlers only translate the IPC call.
 *
 * Every generating call is wrapped by {@link exposeAiError}: a provider/SDK failure
 * is re-thrown as an `AI_REQUEST_FAILED` IpcError carrying the full SerializedError
 * in `data`. Without this the renderer would only ever see `message` (Electron's
 * invoke reject drops `code`/`data`) — the detail this migration exists to surface.
 */
async function exposeAiError<T>(route: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (e) {
    // Log the FULL serialized error at the source (statusCode / responseBody / AI SDK
    // subtype). The `data` rides the IpcError for the renderer, but Electron's invoke
    // reject keeps only `message`, and a downstream normalize (e.g. the paintings
    // pipeline → `REMOTE_ERROR`) can collapse even that — so the only durable record of
    // the real cause is this log. User-initiated aborts are control flow, not failures.
    const serializedError = serializeError(e)
    if (!(e instanceof Error && e.name === 'AbortError')) {
      logger.error(`${route} failed`, serializedError)
    }
    throw new IpcError(aiErrorCodes.AI_REQUEST_FAILED, serializedError.message ?? '', serializedError)
  }
}

async function exposeAiStreamAdmission<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (error) {
    if (error instanceof AiStreamAdmissionError) {
      throw new IpcError(aiErrorCodes.AI_STREAM_ADMISSION_REJECTED, error.reason, { reason: error.reason })
    }
    throw error
  }
}

/**
 * The caller window's `WebContents`, resolved from its WindowId — the stream listener
 * needs the raw `WebContents` for its directed `send` + liveness, which IpcApi hides
 * behind `senderId`. `undefined` when the sender is not a managed window (null senderId
 * or window already gone); stream open/attach reject on that, detach treats it as a no-op.
 */
function senderWebContents(senderId: WindowId | null): Electron.WebContents | undefined {
  if (senderId == null) return undefined
  return application.get('WindowManager').getWindow(senderId)?.webContents
}

/** The persisted half of `ai.tool.get_result` — matches the same shape projection replaces. */
async function findPersistedToolOutput(
  topicId: string,
  messageId: string,
  toolCallId: string
): Promise<AiToolResultResponse> {
  try {
    const parts = messageService.getById(messageId).data.parts
    for (const part of parts ?? []) {
      if (!isToolUIPart(part) || part.state !== 'output-available') continue
      if (part.toolCallId !== toolCallId) continue
      if (isPersistedToolOutput(part.output)) {
        return { found: true, output: await resolvePersistedToolOutput(part.output) }
      }
      return { found: true, output: part.output }
    }
  } catch (e) {
    logger.warn('ai.tool.get_result persisted lookup failed', { topicId, messageId, toolCallId, err: e })
  }
  return { found: false }
}

/**
 * Rebuild a `$persistedToolOutput` envelope into the original output by
 * reading the blobs back from FileManager. When an entry is gone (manual DB
 * surgery, restore of an older backup) or is not a blob the tool-output store
 * wrote (a forged / colliding envelope in arbitrary tool output — the
 * ownership gate against reading unrelated entries), that blob degrades to
 * its stored excerpt with an explanatory note rather than `found: false` —
 * the renderer treats a miss as a permanent error, and the excerpt is still
 * real content.
 */
async function resolvePersistedToolOutput(output: PersistedToolOutput): Promise<unknown> {
  const ref = output.$persistedToolOutput
  const readBlob = async (blob: PersistedToolOutputBlobRef): Promise<string> => {
    try {
      const entry = fileEntryService.findById(blob.fileEntryId)
      if (!entry || !isToolOutputBlobEntry(entry)) throw new Error('entry is not a persisted tool-output blob')
      const { content } = await application.get('FileManager').read(blob.fileEntryId, { encoding: 'text' })
      return content
    } catch (e) {
      logger.warn('persisted tool output unavailable, serving excerpt', { fileEntryId: blob.fileEntryId, err: e })
      return `${blob.head}\n\n[persisted output no longer available — showing excerpt of ${blob.totalChars} chars]\n\n${blob.tail}`
    }
  }
  if (ref.shape === 'entities') {
    const texts = Object.fromEntries(
      await Promise.all(ref.blobRefs.map(async (blob) => [blob.key, await readBlob(blob)] as const))
    )
    return inflateEntities(ref, texts)
  }
  return reconstructOutput(ref, await readBlob(blobRefsOf(ref)[0]))
}

export const aiHandlers: IpcHandlersFor<typeof aiRequestSchemas> = {
  // ── One-shot model calls — AiService owns the provider clients. ──
  // A renderer one-shot call has no topic; it is its own conversation.
  'ai.text.generate': ({ requestId, ...request }) => {
    const generate = { ...request, conversation: { id: `one-shot:${randomUUID()}` } }
    return exposeAiError('ai.text.generate', () =>
      requestId
        ? application.get('AiService').runTextRequest(requestId, generate)
        : application.get('AiService').generateText(generate)
    )
  },
  'ai.text.abort': async ({ requestId }) => {
    application.get('AiService').abortRequest(requestId)
  },
  'ai.embedding.embed_many': (request) =>
    exposeAiError('ai.embedding.embed_many', () => application.get('AiService').embedMany(request)),
  'ai.image.generate': ({ requestId, payload }) =>
    exposeAiError('ai.image.generate', () => application.get('AiService').runImageRequest(requestId, payload)),
  'ai.image.abort': async ({ requestId }) => {
    application.get('AiService').abortRequest(requestId)
  },

  // ── Provider model catalog & reachability probe. ──
  'ai.provider.model.list': (request) =>
    exposeAiError('ai.provider.model.list', () => application.get('AiService').listModels(request)),
  'ai.provider.model.check': (request) =>
    exposeAiError('ai.provider.model.check', () => application.get('AiService').checkModel(request)),

  // ── Streaming chat — delegate to AiStreamManager, which owns the stream registry. ──
  'ai.stream.open': async (request, { senderId }) => {
    const wc = senderWebContents(senderId)
    if (!wc) throw new Error('ai.stream.open requires a managed window')
    const subscriber = new WebContentsListener(wc, request.topicId)
    return exposeAiStreamAdmission(() =>
      application.get('AiStreamManager').dispatch(subscriber, request as AiStreamOpenRequest)
    )
  },
  'ai.stream.attach': async (request, { senderId }) => {
    const wc = senderWebContents(senderId)
    if (!wc) throw new Error('ai.stream.attach requires a managed window')
    return application.get('AiStreamManager').attach(wc, request)
  },
  'ai.stream.detach': async (request, { senderId }) => {
    // Best-effort: a gone window has no listener to remove, so a missing WebContents is a no-op.
    const wc = senderWebContents(senderId)
    if (wc) application.get('AiStreamManager').detach(wc, request)
  },
  'ai.stream.abort': async ({ topicId }) => {
    await application.get('AiStreamManager').abortAndDrain(topicId, 'user-requested')
  },

  // ── Tool calls — deferred output lookup + approval decisions. ──
  'ai.tool.get_result': async ({ topicId, messageId, toolCallId }) => {
    // Active stream first: it is the only source holding the value before the message persists.
    const live = application.get('AiStreamManager').getDeferredToolOutput(topicId, toolCallId)
    if (live.found) return live
    return findPersistedToolOutput(topicId, messageId, toolCallId)
  },
  // The continuation dispatch streams to the caller window, so it needs that window's WebContents.
  'ai.tool.respond_approval': (payload, { senderId }) =>
    application.get('AiService').respondToolApproval(payload, senderWebContents(senderId))
}
