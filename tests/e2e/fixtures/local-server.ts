import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

type ChatRequest = {
  model?: string
  stream?: boolean
  input?: string | string[]
  messages?: Array<{ role: string; content: unknown }>
  tools?: Array<{ function: { name: string } }>
}

export async function startLocalServer() {
  const requests: Array<{ path: string; headers: http.IncomingHttpHeaders }> = []
  const server = http.createServer(async (request, response) => {
    requests.push({ path: request.url ?? '', headers: request.headers })
    if (request.url === '/login') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<h1>Provider login fixture</h1>')
      return
    }

    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = (raw ? JSON.parse(raw) : {}) as ChatRequest
    if (request.url === '/v1/embeddings') {
      const inputs = Array.isArray(body.input) ? body.input : [body.input]
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          object: 'list',
          model: body.model,
          data: inputs.map((_, index) => ({
            object: 'embedding',
            index,
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
          })),
          usage: { prompt_tokens: 8, total_tokens: 8 }
        })
      )
      return
    }
    if (request.url !== '/v1/chat/completions') {
      response.writeHead(404)
      response.end('Unexpected fixture request')
      return
    }

    const messages = body.messages ?? []
    const lastUser = messages.findLastIndex((message) => message.role === 'user')
    const lastTool = messages.findLastIndex((message) => message.role === 'tool')
    const prompt = JSON.stringify(messages[lastUser]?.content ?? '')
    const tool = body.tools?.find((tool) => tool.function.name.endsWith('verify_connection'))
    const callTool = Boolean(tool && prompt.includes('verification MCP') && lastTool < lastUser)
    let reply = 'Ordinary chat verification succeeded.'
    if (lastTool > lastUser) {
      reply = JSON.stringify(messages[lastTool].content).includes('MCP verification succeeded')
        ? 'MCP verified after approval.'
        : 'MCP request was denied.'
    } else if (prompt.includes('HTML preview fixture')) {
      reply =
        '```html\n<!doctype html><html><head><title>Retained HTML preview</title></head><body><h1>HTML preview is working</h1></body></html>\n```'
    }

    const completion = { id: 'chatcmpl-e2e', created: 1, model: body.model }
    const usage = { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 }
    if (!body.stream) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          ...completion,
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
          usage
        })
      )
      return
    }
    const delta = callTool
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_e2e',
              type: 'function',
              function: { name: tool!.function.name, arguments: JSON.stringify({ value: 'ordinary-chat-mcp' }) }
            }
          ]
        }
      : { role: 'assistant', content: reply }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: callTool ? 'tool_calls' : 'stop' }
    ]) {
      response.write(
        `data: ${JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [choice], usage })}\n\n`
      )
    }
    response.end('data: [DONE]\n\n')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}
