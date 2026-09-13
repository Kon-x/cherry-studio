/** Historical message metadata retained for database and backup compatibility. */
export type AgentSessionDeliveryStatus = 'accepted' | 'delivering' | 'consumed' | 'failed'

type DeliveryIdentity = { agentId: string; sessionId: string }
type DeliverySnapshot = { agentName: string; sessionName: string }

export interface AgentSessionDeliveryEnvelope {
  version: 1
  sender: DeliveryIdentity
  receiver: DeliveryIdentity
  senderSnapshot?: DeliverySnapshot
  receiverSnapshot?: DeliverySnapshot
  replyPolicy: 'none' | 'completion'
  sourceMessageId: string | null
  outcome: 'success' | 'failed' | 'interrupted' | null
  error: { code: string; message: string } | null
  statusAt: string
}

export interface AgentSessionDelivery extends AgentSessionDeliveryEnvelope {
  status: AgentSessionDeliveryStatus
  inReplyTo: string | null
  turnRef: string | null
}
