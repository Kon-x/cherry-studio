/**
 * API Gateway IPC schemas — the gateway itself was removed from this fork; only the
 * `api_gateway.required` push event remains (the claude-code runtime broadcasts it when a
 * session's model would have needed the gateway bridge, and the agents UI listens).
 */

// ── Event: main→renderer pushes (pure types, never parsed) ──
export type ApiGatewayEventSchemas = {
  // An agent session could not connect because its model must be bridged through the gateway,
  // which this fork removed. Broadcast; the owning session's UI filters by `sessionId`.
  'api_gateway.required': { sessionId: string }
}
