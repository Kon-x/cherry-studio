---
description: Main-as-writer tool approval through ai.tool.respond_approval, approval-requested parts, and persistent MCP decisions
sources:
  - src/main/ai/AiService.ts
  - src/main/ipc/handlers/ai.ts
  - src/renderer/hooks/useToolApprovalBridge.ts
  - src/renderer/components/chat/messages/tools/hooks/useToolApproval.ts
---

# Tool Approval

## Model

Main is the single writer of approval state. The renderer surfaces an
`approval-requested` ToolUIPart, takes the user's decision, and posts it
to Main. Main applies the decision to the DB-authoritative anchor parts,
persists, and resumes the stream.

## End-to-end flow

1. **Tool needs approval** — at `execute` time, the wrapper checks
   `tool.needsApproval` and the assistant's auto-approve policy. If
   approval is required, the wrapper writes an `approval-requested` part
   and pauses the stream on that approval part.

2. **Stream pauses** — `AiStreamManager` transitions the topic to
   `awaiting-approval`. The `topic.stream.statuses.<topicId>` shared-cache
   entry carries the status; every renderer window reading that key sees
   the pause atomically.

3. **User decides** — the approval card renders from the part. On click,
   `useToolApprovalBridge` (`src/renderer/hooks/useToolApprovalBridge.ts`)
   calls `ipcApi.request('ai.tool.respond_approval', ...)` with `approvalId`,
   `approved`, optional `reason` / `updatedInput`, `topicId`, `anchorId`.

4. **Main applies** — the IpcApi handler delegates to `AiService.respondToolApproval`.
   It requires `topicId` and `anchorId`, waits for terminal persistence, and applies the decision
   to the DB-authoritative anchor with `MessageService.applyToolApprovalDecisions`. Duplicate
   decisions do not start another continuation. Once every approval on the row is decided,
   Main dispatches `continue-conversation` through the ordinary chat executor.

5. **Awaiting-approval clears** — the moment the continue stream
   broadcasts `pending`, the shared-cache entry flips back. Every window
   sees the approval card disappear in the same tick.

## Persistent decisions

`useToolApproval`
(`src/renderer/components/chat/messages/tools/hooks/useToolApproval.ts`)
exposes an `autoApprove` action **only for MCP tools** — when an `mcpTool`
descriptor is passed. It persists the opt-out by PATCHing the server's
`disabledAutoApproveTools`, so the MCP settings page reflects it and
subsequent calls of that tool skip the approval card.

## Why this design

- **No renderer writes** — the renderer cannot PATCH approval state. If
  it did, it would race Main's authoritative re-read and cause the
  approval card to reappear on every click.
- **Cross-window consistency** — the shared-cache `awaiting-approval`
  status is the single source of truth for "this topic is paused".
- **Overlay/persist gap** — the renderer sometimes sees the
  `approval-requested` part via overlay before it lands in the DB row.
  Writing unconditionally would clobber the (concurrent) Main-side
  persistence; the conditional write + continue-dispatch covers that case.

## Where to read more

- IpcApi route: `src/main/ipc/handlers/ai.ts` (`ai.tool.respond_approval`)
- Main decision owner: `src/main/ai/AiService.ts` (`respondToolApproval`)
- Renderer bridge: `src/renderer/hooks/useToolApprovalBridge.ts`
- Persistent decisions: `src/renderer/components/chat/messages/tools/hooks/useToolApproval.ts`
- Status broadcast: [Stream Manager](./stream-manager.md)
