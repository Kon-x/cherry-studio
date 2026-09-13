import { appendFileSync } from 'node:fs'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod'

const server = new McpServer({ name: 'CI verification', version: '1.0.0' })
server.registerTool(
  'verify_connection',
  {
    description: 'Return a verification value through the ordinary chat MCP approval flow.',
    inputSchema: { value: z.string() }
  },
  async ({ value }) => {
    appendFileSync(process.env.E2E_MCP_CALLS_FILE, `${JSON.stringify({ value })}\n`)
    return { content: [{ type: 'text', text: `MCP verification succeeded: ${value}` }] }
  }
)
await server.connect(new StdioServerTransport())
