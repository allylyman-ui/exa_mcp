/**
 * Vercel serverless function — Streamable HTTP MCP endpoint.
 *
 * Deploy this to Vercel and point MCP clients at:
 *   https://<your-project>.vercel.app/api/mcp
 */

import { createMcpHandler } from "mcp-handler";
import { registerExaTools } from "../src/server.js";

const handler = createMcpHandler(
  (server) => registerExaTools(server),
  {
    serverInfo: {
      name: "exa-mcp-server",
      version: "1.0.0",
    },
  },
  {
    redisUrl: process.env.REDIS_URL || process.env.KV_URL,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
