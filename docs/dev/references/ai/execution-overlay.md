---
description: Shared topic message projections, bounded attachment recovery, and overlay handoff
sources:
  - src/shared/ai/messageProjection.ts
  - src/main/ai/messages/MessageProjection.ts
  - src/main/ai/messages/ProjectionSubscriptions.ts
  - src/main/ai/streamManager/TopicMessageProjection.ts
  - src/renderer/services/aiTransport/MessageProjectionService.ts
  - src/renderer/services/aiTransport/ExecutionStreamOverlayService.ts
  - src/renderer/hooks/useExecutionOverlay.ts
---

# Execution Overlay

## Ownership and message model

Chat conversations use `CherryUIMessage`. Chunk streams use `readUIMessageStream` in `pipeStreamLoop` to accumulate message content before observer fan-out. `TopicMessageProjection` publishes the current view. The renderer receives message snapshots and patches without running another SDK reader.

```text
Chat message source → TopicMessageProjection
                               ↓
               MessageProjection / ProjectionSubscriptions
                               ↓ ai.projection.*
                    MessageProjectionService
                               ↓
                     useExecutionOverlay
```

A topic baseline covers the current live overlay, not its saved history. It includes execution, attempt and message-anchor identities, so parallel models and a retry using the same model/anchor stay distinct. Observing or detaching a view does not submit input or stop a request.

## Publication

`MessageProjection` shares diffing, immutable baselines and subscriber delivery. A changed message is upserted; text/reasoning growth with otherwise unchanged structure uses an append patch. Every update carries the complete message order, which also expresses removal. Unchanged messages and parts keep stable references in the renderer.

Root updates coalesce into one pending view over 80 ms; renderer output projection runs once per flushed batch, not per accepted chunk. Without subscribers, the pending view waits for the next baseline capture instead of a timer. Revisions count published batches, not model chunks. Capturing a baseline flushes pending accepted content first.

A root terminal is published in the notification phase, after terminal persistence. The final view includes accepted content, the final execution state and its owning `userMessageId` in the same revision. That identity correlates a queued submit's user-only acknowledgement with its later assistant attempt and recovery completion. Persistence failure publishes an `unresolved` execution with readable content and an error; it does not signal a successful DB handoff. Host-resolved approvals are folded into Main's snapshots so a later SDK snapshot cannot restore a dismissed approval card.

## Attachment and recovery

`ai.projection.attach` accepts a topic target and a window-owned subscription ID. Main resolves the owner, registers delivery and captures a baseline without an asynchronous gap between registration and snapshot. A cancelled or replaced asynchronous attachment cannot install a listener. Window destruction removes its delivery leases.

The renderer listens before attaching and buffers up to 100 early updates. It installs the baseline, ignores covered revisions and applies only the next consecutive revision. A gap, invalid patch or buffer overflow starts a new attachment with a new subscription ID. Late responses and events from old subscriptions are ignored. This recovers the current view; it is not a durable event journal or a TCP-style retransmission protocol.

The store shares one transport subscription among consumers of the same target in a window. The last consumer detaches it. No renderer subscription controls the lifetime of a model request. A retained root facade may display its last view while a remount obtains the current baseline; its inactive cache is bounded to 32 topics.

## Root rendering and DB handoff

`ExecutionStreamOverlayService` turns a topic projection into message-ID-to-parts overlays and live assistant messages. `useExecutionOverlay` binds that facade to React and forwards update/finish notifications for speech and error presentation. It does not seed a reader from renderer history.

- Update routing retains the execution attempt and anchor. A stale active-execution cache cannot overwrite a newer attempt.
- Finish callbacks occur once per observed attempt, including failure completion for `unresolved` attempts. Failed persistence settles recovery requests and reports errors while retaining readable output. Replayed or duplicate revisions do not repeat completion.
- A completed overlay stays readable until the consumer refreshes its existing message store and calls `reset` or `disposeOverlay`. Home Chat also performs this handoff for an initially terminal baseline, whether topic status or projection content arrives first, so retained snapshots cannot override saved edits or deletions.
- A delayed handoff leaves active and unresolved attempts intact. Explicit `clear` hides the current attempt even if it continues producing frames.
- Topic status and approval indicators still use the existing shared-cache status entries. Those entries do not contain the streamed body.

Home Chat, Quick Assistant and Selection consume this projection path. Their command hooks send input and stop requests separately.

## Related references

- [IPC Transport](./ipc-transport.md) — command and observation routes.
- [Stream Manager](./stream-manager.md) — execution, SDK accumulation and terminal persistence.
