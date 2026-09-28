// A minimal MCP server over streamable HTTP (JSON responses), for the end-to-end checks of connectors. It has two
// tools, one that reads (search_issues) and one that writes (create_issue), which is all the permission and lock
// scenarios need. Real vendor servers need real tenants, so those stay a manual checklist.
export function startFakeMcp() {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 })
      const msg = (await req.json()) as { id?: number; method: string; params?: { protocolVersion?: string } }
      const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: msg.id, result })
      if (msg.method === "initialize")
        return reply({ protocolVersion: msg.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1.0.0" } })
      if (msg.method.startsWith("notifications/")) return new Response(null, { status: 202 })
      if (msg.method === "tools/list")
        return reply({
          tools: [
            { name: "search_issues", description: "search issues", inputSchema: { type: "object", properties: { q: { type: "string" } } } },
            { name: "create_issue", description: "create an issue", inputSchema: { type: "object", properties: { title: { type: "string" } } } },
          ],
        })
      if (msg.method === "tools/call") return reply({ content: [{ type: "text", text: "ok" }] })
      return Response.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "not found" } })
    },
  })
  return { url: `http://127.0.0.1:${server.port}/mcp`, stop: () => server.stop(true) }
}
