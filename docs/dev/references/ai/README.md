---
description: Entry point mapping the AI pipeline docs, src/main/ai code layout, chat-turn flow, runtimes, and key invariants
sources:
  - src/main/ai
  - src/renderer/services/aiTransport
---

# AI Reference

This is the entry point for Cherry Studio's AI pipeline: main-process provider
calls, AI SDK chat execution, and the renderer transport that connects to them.

## Quick navigation

### Top-level architecture

| Document | What it covers |
|---|---|
| [Core Architecture](./core-architecture.md) | End-to-end call flow: `ai.stream.open` IpcApi route → context provider → AiStreamManager → runtime → broadcast / persist |
| [Stream Manager](./stream-manager.md) | Active-stream registry, listeners, reconnect, abort, queue/yield/continuation steering, persistence backends |
| [Adapter Family](./adapter-family.md) | How `provider.endpointConfigs[ep].adapterFamily` picks the right `@ai-sdk/*` package per request |
| [Provider State Ownership](./provider-state-ownership.md) | Where provider facts, endpoint dialects, connection overrides, and per-request controls belong |

### Subsystems

| Document | What it covers |
|---|---|
| [Agent Loop](./agent-loop.md) | Main-process `Agent.stream()`: single-pass stream, hook composition, observer pattern, error/abort semantics |
| [Params Pipeline](./params-pipeline.md) | `buildAgentParams` + `RequestFeature` model: how capabilities, plugins, tools, and provider-specific quirks are composed |
| [Tool Registry](./tool-registry.md) | Built-in web/knowledge/file/image/MCP-resource tools, selected MCP tools, meta-tools, and deferred exposition |
| [Chat Attachments](./chat-attachments.md) | How attached files reach the model: native file parts when supported, capped extracted text otherwise, `read_file` for overflow paging |
| [Provider Resolution](./provider-resolution.md) | `Provider.endpointConfigs` schema, endpoint resolution chain, variant suffixes, custom provider extensions (aihubmix, newapi) |
| [Model Retry & Fallback](./model-retry.md) | `ai-retry` integration: same-model transient retry + user-configured fallback models, `wrapModel` hook, `chat.retry.*` preferences, embedding/rerank policies |
| [Observability (trace / telemetry)](./observability.md) | `AiSdkSpanAdapter`, root span propagation, OTel attribute shape, local span projection, sinks |
| [Local Models](./local-models.md) | The local embedding / OCR bundle catalog, on-disk registry, and verified acquisition of models and shared native runtimes |
| [AI Usage Records](./ai-usage-records.md) | Best-effort per-provider-invocation usage/cost analytics: capture ownership, immutable attribution snapshots, message projection, bounded query API, migration, freshness |

### Renderer-side glue

| Document | What it covers |
|---|---|
| [IPC Transport](./ipc-transport.md) | Commands, dispatch results, root/child projection subscriptions and topic-status mirror |
| [Execution Overlay](./execution-overlay.md) | Shared message snapshots/patches, bounded reconnect recovery, independent child views and root DB handoff |
| [Text Translation](./translation.md) | `translate.open` prompt streams, renderer-owned result handling, and Home `data-translation` persistence |
| [Tool Approval](./tool-approval.md) | Approval registry, Main-as-writer model, persistent decisions, `useToolApproval` hook |

## Where the code lives

```
src/main/ai/
├── AiService.ts                  ← provider operations, built-in tool init, approval decisions
├── runtime/aiSdk/                ← ordinary chat Agent class, loop, observers, params/features
├── streamManager/                ← AiStreamManager + listeners + persistence backends
│   ├── AiStreamManager.ts        ← active-stream registry and dispatch owner
│   ├── context/                  ← ChatContextProvider implementations + dispatch
│   ├── lifecycle/                ← chat / prompt-only stream lifecycles
│   ├── listeners/                ← WebContents / Persistence / callback
│   ├── persistence/              ← MessageService / TemporaryChat backends
│   └── pipeStreamLoop.ts         ← shared chunk-pipe primitive
├── provider/                     ← provider config, endpoint resolution, custom providers
│   ├── custom/                   ← provider-specific adapters, transports, and wire profiles
│   ├── config.ts                 ← providerToAiSdkConfig (builder table)
│   ├── endpoint.ts               ← resolveEffectiveEndpoint + adapterFamily routing
│   ├── extensions.ts             ← ProviderExtension registrations
│   └── listModels.ts             ← per-provider model listing
├── mcp/                          ← McpRuntimeService / McpCatalogService, oauth/, built-in servers
│   └── servers/                  ← in-memory MCP server implementations (browser, filesystem)
├── contextBuild/                 ← context-window policy, compression, persisted tool output
├── localModel/                   ← local model catalog, acquisition, installation, utility-process inference
├── tokens/                       ← token estimation and modality profiles
├── tools/                        ← unified tool registry
│   └── adapters/
│       ├── aiSdk/                ← registry.ts, repair.ts; builtin/ (web_search/web_fetch/kb_*),
│       │                            mcp/ (server → ToolEntry sync), meta/ (tool_search/inspect/invoke;
│       │                            tool_exec defined but not injected), exposition/ (shouldDefer + applyDefer)
├── observability/                ← AI SDK trace adapters, local projection, sinks
├── messages/                     ← UI part → AI SDK part conversion
├── types/                        ← AppProviderId, merged extension types, request types
└── utils/                        ← reasoning / model parameters / options / websearch helpers
```

## How a chat turn flows

1. Renderer command hook or conversation controller sends input →
   IpcApi `ai.stream.open` (`{ topicId, trigger, userMessageParts,
   parentAnchorId?, mentionedModelIds? }`).
2. The thin handler in `src/main/ipc/handlers/ai.ts` resolves the caller's
   managed window and delegates to `AiStreamManager.dispatchCommand`. Stream state stays in the manager; transport
   registration stays in IpcApi.
3. `dispatchStreamRequest` picks the first `ChatContextProvider` whose
   `canHandle(topicId)` matches (persistent or temporary chat) and calls `prepareDispatch` — that resolves models, persists
   the user message, builds listeners, and returns a `PreparedDispatch`.
4. `AiStreamManager.send(input)` **starts** a turn (no active stream): creates
   an `ActiveStream`, launches one `StreamExecution` per model. (A chat
   resubmit on a live topic is persisted + queued as a steer and takes the
   **inject** path — the running turn yields and `onExecutionDone` chains a
   continuation.)
5. Each execution's `runExecutionLoop` calls `AiService.streamText(request,
   signal)`, which builds params (`buildAgentParams`) and constructs an `Agent`
   composing hooks from `RequestFeature[]` (anthropic cache, usage
   normalisation, reasoning extraction, …), then calls `agent.stream(messages,
   signal)` to open the AI SDK stream and yield `UIMessageChunk`s.
6. `pipeStreamLoop` accumulates chunks through `readUIMessageStream`.
   `TopicMessageProjection` publishes the resulting `CherryUIMessage` snapshots
   and patches to desktop views; raw-stream listeners receive chunks separately.
7. On terminal (done / error / aborted / paused-for-approval), listeners get
   a typed terminal callback. `PersistenceListener` writes the final
   message via the appropriate `PersistenceBackend`.
8. Renderer reads the persisted row through `useQuery('/topics/:topicId/messages')`
   and disposes its overlay.

## Key invariants

- **Topic-level addressing.** Root chat streams are keyed by `topicId`.
  A topic has at most one active stream; subscribers are equal — there's no
  "owner" window. Child projections share the same delivery protocol while using their own owner-scoped subscription
  and remain independent of the parent's active turn.
- **Main owns persistence.** Renderer closing or crashing does not abort the
  stream and does not lose data — `PersistenceListener` writes on terminal
  regardless of who is listening.
- **Tool approval is Main-authoritative.** The renderer never writes
  `approved`/`denied` parts. It posts the decision over IPC and re-reads the
  authoritative row. See [Tool Approval](./tool-approval.md).
- **Adapter family per endpoint, not per provider.** Multi-endpoint relays
  (MiniMax, Silicon, AiHubMix, …) carry one `adapterFamily` per endpoint.
  Picking the SDK package never reads `apiHost` or provider id heuristics
  at request time. See [Adapter Family](./adapter-family.md).
- **One provider fact, one owner.** Host facts live on registry providers,
  protocol deviations on endpoint configs, user connection deltas on provider
  rows, and per-request choices on assistants. See
  [Provider State Ownership](./provider-state-ownership.md).

## MCP runtime compatibility

The MCP runtime uses SDK v2 and keeps the upstream schemas in its catalog.
Input validation honors an explicit `$schema` dialect and otherwise uses JSON
Schema 2020-12. Model adapters include any JSON `structuredContent` in text
without duplicating an equivalent server-provided JSON block; the stored result
retains its original content and media. Main validates the original upstream
output schemas.

Tools, prompts and resources share request-scoped interaction hosts and
cancellation. Modern stdio responses restore their caller's context by JSON-RPC
ID before the SDK continues an MRTR exchange. Interactive chat requests carry
the initiating desktop window; headless turns have no consent host.
Main validates form responses and closes pending dialogs on cancellation,
timeout or window closure. URL elicitation requires separate open and confirm
actions. OAuth can resume a request rejected by an authentication challenge;
unknown network outcomes are not replayed. Catalog/background reads cannot
start browser authorization.

The built-in sequential-thinking tool creates a `chainId` for thought 1.
Subsequent thoughts must provide that ID; completed chains and closed server
instances release their histories. History and branches are isolated per chain.

## Related references

- [Service Lifecycle](../lifecycle/README.md) — `AiService` extends `BaseService`
- [Data Layer](../data/README.md) — `MessageService`, `ModelService`,
  `ProviderService` (called from main-side AI code)
- [Window Manager](../window-manager/README.md) — projection subscriptions are scoped to managed windows
