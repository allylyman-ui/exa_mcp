/**
 * Exa MCP Server — Vercel Route Handler
 *
 * Exposes Exa's full API as MCP tools via mcp-handler.
 * Deploy to Vercel, connect at: https://<project>.vercel.app/api/mcp
 *
 * Tools:
 *   exa_search           — AI-powered web search
 *   exa_find_similar     — Find pages similar to a URL
 *   exa_get_contents     — Extract clean content from URLs
 *   exa_answer           — Get a cited answer to a question
 *   exa_research_start   — Start an async deep-research task
 *   exa_research_status  — Poll research task for results
 */

import { createMcpHandler } from "mcp-handler";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Exa from "exa-js";
import { z } from "zod";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 25_000;

function getExa(): Exa {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    throw new Error(
      "EXA_API_KEY environment variable is required. " +
        "Get your key at https://dashboard.exa.ai/api-keys"
    );
  }
  return new Exa(key);
}

function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function formatResults(results: any[]): string {
  if (!results || results.length === 0) return "No results found.";

  const lines: string[] = [];
  for (const r of results) {
    lines.push(`## ${r.title || "(untitled)"}`);
    lines.push(`**URL**: ${r.url}`);
    if (r.publishedDate) lines.push(`**Published**: ${r.publishedDate}`);
    if (r.author) lines.push(`**Author**: ${r.author}`);
    if (r.score != null) lines.push(`**Score**: ${r.score.toFixed(4)}`);
    if (r.summary) lines.push("", "### Summary", r.summary);
    if (r.highlights?.length) {
      lines.push("", "### Highlights");
      for (const h of r.highlights) {
        const text = typeof h === "string" ? h : h.text;
        lines.push(`> ${text}`);
      }
    }
    if (r.text) {
      const text =
        r.text.length > 3000
          ? r.text.slice(0, 3000) + "\n…(truncated)"
          : r.text;
      lines.push("", "### Text", text);
    }
    lines.push("", "---", "");
  }

  let output = lines.join("\n");
  if (output.length > MAX_TEXT_LENGTH) {
    output =
      output.slice(0, MAX_TEXT_LENGTH) +
      "\n\n…(response truncated — try fewer numResults or narrower filters)";
  }
  return output;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  return `Error: ${String(error)}`;
}

// ─── MCP Handler ────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  async (server: McpServer) => {
    // ── exa_search ────────────────────────────────────────────────────────

    server.tool(
      "exa_search",
      "Search the web using Exa's AI-powered search engine. Returns relevant pages " +
        "with optional full text, highlights, and summaries. Supports semantic, keyword, " +
        "or automatic search modes, plus filtering by domain, date, category, and text.",
      {
        query: z.string().min(1).max(2000).describe("Search query — natural language sentences work best"),
        type: z.enum(["auto", "neural", "keyword"]).default("auto").describe("Search mode"),
        category: z.enum(["company", "research paper", "news", "pdf", "github", "tweet", "personal site", "linkedin profile", "financial report"]).optional().describe("Restrict results to a content category"),
        numResults: z.number().int().min(1).max(100).default(10).describe("Number of results (1–100)"),
        includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
        excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
        startPublishedDate: z.string().optional().describe("ISO 8601 date — only pages published after this"),
        endPublishedDate: z.string().optional().describe("ISO 8601 date — only pages published before this"),
        includeText: z.array(z.string()).optional().describe("Only return pages containing ALL of these strings"),
        excludeText: z.array(z.string()).optional().describe("Exclude pages containing ANY of these strings"),
        useAutoprompt: z.boolean().optional().describe("Let Exa rewrite the query for better results"),
        livecrawl: z.enum(["always", "fallback", "never"]).optional().describe("'always' fetches live; 'fallback' tries cache first; 'never' cache only"),
        includeFullText: z.boolean().default(true).describe("Include full text of each result"),
        includeHighlights: z.boolean().default(false).describe("Include key sentence highlights"),
        includeSummary: z.boolean().default(false).describe("Include AI-generated summary per result"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const contents: any = {};
          if (input.includeFullText) contents.text = { maxCharacters: 3000 };
          if (input.includeHighlights) contents.highlights = { numSentences: 3 };
          if (input.includeSummary) contents.summary = true;

          const options: any = { type: input.type, numResults: input.numResults, contents };
          if (input.category) options.category = input.category;
          if (input.includeDomains) options.includeDomains = input.includeDomains;
          if (input.excludeDomains) options.excludeDomains = input.excludeDomains;
          if (input.startPublishedDate) options.startPublishedDate = input.startPublishedDate;
          if (input.endPublishedDate) options.endPublishedDate = input.endPublishedDate;
          if (input.includeText) options.includeText = input.includeText;
          if (input.excludeText) options.excludeText = input.excludeText;
          if (input.useAutoprompt != null) options.useAutoprompt = input.useAutoprompt;
          if (input.livecrawl) options.livecrawl = input.livecrawl;

          const response = await exa.search(input.query, options);
          const header = `# Search Results for: "${input.query}"\nFound ${response.results.length} results\n\n`;
          return txt(header + formatResults(response.results));
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );

    // ── exa_find_similar ──────────────────────────────────────────────────

    server.tool(
      "exa_find_similar",
      "Find web pages semantically similar to a given URL. Great for competitive analysis or discovering related content.",
      {
        url: z.string().url().describe("URL to find similar pages for"),
        numResults: z.number().int().min(1).max(100).default(10).describe("Number of results (1–100)"),
        excludeSourceDomain: z.boolean().default(true).describe("Exclude pages from the same domain"),
        category: z.enum(["company", "research paper", "news", "pdf", "github", "tweet", "personal site", "linkedin profile", "financial report"]).optional().describe("Restrict to a content category"),
        includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
        excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
        includeFullText: z.boolean().default(false).describe("Include full text of each result"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const options: any = { numResults: input.numResults, excludeSourceDomain: input.excludeSourceDomain };
          if (input.category) options.category = input.category;
          if (input.includeDomains) options.includeDomains = input.includeDomains;
          if (input.excludeDomains) options.excludeDomains = input.excludeDomains;
          if (input.includeFullText) options.contents = { text: { maxCharacters: 3000 } };

          const response = await exa.findSimilar(input.url, options);
          const header = `# Pages Similar to: ${input.url}\nFound ${response.results.length} similar pages\n\n`;
          return txt(header + formatResults(response.results));
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );

    // ── exa_get_contents ──────────────────────────────────────────────────

    server.tool(
      "exa_get_contents",
      "Retrieve clean, parsed content from one or more web pages by URL. Returns text, highlights, and/or summaries.",
      {
        urls: z.array(z.string()).min(1).max(100).describe("URLs to retrieve content from"),
        maxCharacters: z.number().int().positive().default(5000).describe("Max characters of text per page"),
        includeHighlights: z.boolean().default(false).describe("Include key sentence highlights"),
        includeSummary: z.boolean().default(false).describe("Include AI summary of each page"),
        livecrawl: z.enum(["always", "fallback", "never"]).optional().describe("'always' fetches live; 'fallback' tries cache first; 'never' cache only"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const options: any = { text: { maxCharacters: input.maxCharacters } };
          if (input.includeHighlights) options.highlights = { numSentences: 5 };
          if (input.includeSummary) options.summary = true;
          if (input.livecrawl) options.livecrawl = input.livecrawl;

          const response = await exa.getContents(input.urls, options);
          const header = `# Contents for ${input.urls.length} URL(s)\nRetrieved ${response.results.length} pages\n\n`;
          return txt(header + formatResults(response.results));
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );

    // ── exa_answer ────────────────────────────────────────────────────────

    server.tool(
      "exa_answer",
      "Get a direct, cited answer to a question. Exa searches the web then synthesizes an answer with citations.",
      {
        query: z.string().min(1).max(2000).describe("The question to answer"),
        text: z.boolean().default(false).describe("Include source page text alongside the answer"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const response = await exa.answer(input.query, { text: input.text });

          const lines: string[] = [
            "# Answer\n",
            String(response.answer),
            "", "---", "",
            `## Sources (${response.citations?.length || 0})`,
            "",
          ];

          if (response.citations) {
            for (const cite of response.citations) {
              const title = typeof cite === "string" ? cite : (cite as any).title || (cite as any).url || String(cite);
              const url = typeof cite === "string" ? cite : (cite as any).url || "";
              lines.push(`- [${title}](${url})`);
            }
          }

          return txt(lines.join("\n"));
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );

    // ── exa_research_start ────────────────────────────────────────────────

    server.tool(
      "exa_research_start",
      "Start an asynchronous deep-research task. Returns a researchId — use exa_research_status to poll for results.",
      {
        instructions: z.string().min(1).max(10000).describe("Detailed research instructions"),
        outputSchema: z.record(z.unknown()).optional().describe("Optional JSON Schema for output structure"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const config: any = { instructions: input.instructions };
          if (input.outputSchema) config.outputSchema = input.outputSchema;

          const response = await exa.research.create(config);
          return txt(
            `# Research Task Created\n\n` +
            `**Research ID**: \`${response.researchId}\`\n\n` +
            `Use \`exa_research_status\` with this ID to check progress and get results.`
          );
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );

    // ── exa_research_status ───────────────────────────────────────────────

    server.tool(
      "exa_research_status",
      "Check the status of a deep-research task and retrieve results when complete.",
      {
        researchId: z.string().min(1).describe("Research task ID from exa_research_start"),
      },
      async (input) => {
        try {
          const exa = getExa();
          const response = await exa.research.pollUntilFinished(input.researchId);

          let output: string;
          if (typeof response === "string") {
            output = `# Research Complete\n\n${response}`;
          } else {
            output = `# Research Complete\n\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;
          }

          if (output.length > MAX_TEXT_LENGTH) {
            output = output.slice(0, MAX_TEXT_LENGTH) + "\n\n…(output truncated)";
          }

          return txt(output);
        } catch (error) {
          return txt(errorText(error));
        }
      }
    );
  },
  {
    serverInfo: { name: "exa-mcp-server", version: "1.0.0" },
  },
  {
    basePath: "/api/[transport]",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
