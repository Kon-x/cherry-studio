---
description: Comparison of the knowledge and MCP memory mechanisms in Cherry Studio — Knowledge Base and MCP Memory — plus the status of the v1 Global Memory feature
sources:
  - src/main/ai/mcp/servers/memory.ts
  - src/main/features/knowledge
---

# Memory Feature Overview

Cherry Studio provides two memory mechanisms. They differ in who they serve, how they persist, and where they are stored. Use this reference to pick the right one for your use case and to understand why enabling one does not affect the others.

## Comparison

| Memory Type | Applies To | Persistence | Storage Location | Cross-Session | Cross-Agent |
|---|---|---|---|---|---|
| Knowledge Base | Assistant | Indexed retrieval (ingestion + vector/query) | Knowledge base directory | Yes | Yes |
| MCP Memory | Assistant | MCP protocol (`@cherry/memory` built-in server) | MCP server (`memory.json` knowledge graph) | Yes | Depends on server impl |

## About "Global Memory"

Cherry Studio v1.x had a fourth mechanism, **Global Memory**: a Settings toggle (`feature.memory.enabled`) that made the model auto-extract durable facts from assistant chats and recall them in later assistant sessions. It was **removed in v2** ([#14250](https://github.com/CherryHQ/cherry-studio/issues/14250)) because its setup was complex and its quality did not justify the overhead. There is deliberately no Global Memory toggle in v2 settings and no replacement yet.

If you relied on Global Memory in v1:

- For Assistants, put durable facts into the assistant's prompt, or curate them in a **Knowledge Base** until a successor feature lands.

## Details

### Knowledge Base

- User-curated document collections with per-base ingestion and retrieval indexes.
- Assistants can query the base via the knowledge lookup tools; not automatic — the model must choose to retrieve.
- See `docs/references/knowledge/`.

### MCP Memory

- The built-in `@cherry/memory` MCP server (`src/main/ai/mcp/servers/memory.ts`) exposes a `memory.json` knowledge-graph (entities / relations / observations).
- Assistants call it through MCP tools; persistence and sharing depend on the server implementation.

## Choosing

- Searchable reference material you curate → **Knowledge Base**.
- Structured entity/relation memory driven by MCP → **MCP Memory**.
