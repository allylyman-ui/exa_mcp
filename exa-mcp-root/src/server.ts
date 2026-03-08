/**
 * Exa MCP Server — Tool definitions and registration.
 *
 * Provides tools for all core Exa API endpoints:
 *   - exa_search          (web search)
 *   - exa_find_similar    (find pages similar to a URL)
 *   - exa_get_contents    (retrieve page contents by URL/ID)
 *   - exa_answer          (get a direct answer with citations)
 *   - exa_research_start  (start an async deep-research task)
 *   - exa_research_status (poll a running research task)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  search,
  findSimilar,
  getContents,
  answer,
  createResearch,
  getResearchStatus,
  formatApiError,
} from "./exa-client.js";
import type { SearchResult } from "./types.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";

  const lines: string[] = [];
  for (const r of results) {
    lines.push(`## ${r.title}`);
    lines.push(`**URL**: ${r.url}`);
    if (r.publishedDate) lines.push(`**Published**: ${r.publishedDate}`);
    if (r.author) lines.push(`**Author**: ${r.author}`);
    if (r.score !== undefined) lines.push(`**Score**: ${r.score.toFixed(4)}`);
    if (r.summary) {
      lines.push("", "### Summary", r.summary);
    }
    if (r.highlights && r.highlights.length > 0) {
      lines.push("", "### Highlights");
      for (const h of r.highlights) {
        lines.push(`> ${h}`);
      }
    }
    if (r.text) {
      const text =
        r.text.length > 2000 ? r.text.slice(0, 2000) + "\n…(truncated)" : r.text;
      lines.push("", "### Text", text);
    }
    lines.push("", "---", "");
  }

  let output = lines.join("\n");
  if (output.length > CHARACTER_LIMIT) {
    output =
      output.slice(0, CHARACTER_LIMIT) +
      "\n\n…(response truncated — use fewer numResults or narrower filters)";
  }
  return output;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

// ─── Shared Zod fragments ───────────────────────────────────────────────────

const ContentsSchema = z
  .object({
    text: z
      .union([
        z.boolean(),
        z.object({
          maxCharacters: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Max characters to return per result"),
          includeHtmlTags: z
            .boolean()
            .optional()
            .describe("Include raw HTML tags in text"),
        }),
      ])
      .optional()
      .describe("Retrieve full text of pages"),
    highlights: z
      .union([
        z.boolean(),
        z.object({
          numSentences: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Number of sentences per highlight"),
          highlightsPerUrl: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Number of highlights per URL"),
          query: z.string().optional().describe("Query to target highlights"),
        }),
      ])
      .optional()
      .describe("Retrieve key sentence highlights"),
    summary: z
      .union([
        z.boolean(),
        z.object({
          query: z.string().optional().describe("Query to focus the summary on"),
        }),
      ])
      .optional()
      .describe("Get an AI-generated summary of each page"),
  })
  .optional()
  .describe(
    "Specify which content to retrieve for each result. " +
      "Pass true for defaults or an object for fine-grained control."
  );

const DateFilterSchema = {
  startPublishedDate: z
    .string()
    .optional()
    .describe("ISO 8601 date — only return pages published after this date"),
  endPublishedDate: z
    .string()
    .optional()
    .describe("ISO 8601 date — only return pages published before this date"),
  startCrawlDate: z
    .string()
    .optional()
    .describe("ISO 8601 date — only return pages crawled after this date"),
  endCrawlDate: z
    .string()
    .optional()
    .describe("ISO 8601 date — only return pages crawled before this date"),
};

const DomainFilterSchema = {
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Only include results from these domains (e.g. ['nytimes.com'])"),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe("Exclude results from these domains"),
};

const TextFilterSchema = {
  includeText: z
    .array(z.string())
    .optional()
    .describe("Only return pages containing ALL of these strings"),
  excludeText: z
    .array(z.string())
    .optional()
    .describe("Exclude pages containing ANY of these strings"),
};

// ─── Server ─────────────────────────────────────────────────────────────────

export function registerExaTools(server: McpServer): void {

  // ── exa_search ──────────────────────────────────────────────────────────

  const SearchInputSchema = z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe("The search query — a natural language sentence works best"),
    type: z
      .enum(["auto", "keyword", "neural"])
      .default("auto")
      .optional()
      .describe(
        "Search mode. 'auto' (default) picks the best mode; " +
          "'neural' uses embeddings for semantic search; " +
          "'keyword' uses traditional keyword matching"
      ),
    category: z
      .enum([
        "company",
        "research paper",
        "news",
        "pdf",
        "github",
        "tweet",
        "personal site",
        "linkedin profile",
        "financial report",
      ])
      .optional()
      .describe("Restrict results to a specific content category"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .optional()
      .describe("Number of results to return (1–100, default 10)"),
    ...DomainFilterSchema,
    ...DateFilterSchema,
    ...TextFilterSchema,
    contents: ContentsSchema,
    livecrawl: z
      .enum(["always", "fallback", "never"])
      .optional()
      .describe(
        "Live-crawl strategy. 'always' fetches live content, " +
          "'fallback' uses cache first, 'never' uses cache only"
      ),
    useAutoprompt: z
      .boolean()
      .optional()
      .describe("Let Exa rewrite the query for better results"),
  });

  server.registerTool(
    "exa_search",
    {
      title: "Exa Web Search",
      description:
        "Search the web using Exa's AI-powered search engine. " +
        "Returns relevant pages with optional full text, highlights, and summaries. " +
        "Supports semantic (neural), keyword, or automatic search modes, " +
        "plus filtering by domain, date, content category, and text content.",
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const response = await search(stripUndefined(params) as any);
        const header =
          `# Search Results for: "${params.query}"\n\n` +
          `Found ${response.results.length} results` +
          (response.autopromptString
            ? ` (autoprompt: "${response.autopromptString}")`
            : "") +
          "\n\n";
        return {
          content: [
            { type: "text", text: header + formatResults(response.results) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // ── exa_find_similar ────────────────────────────────────────────────────

  const FindSimilarInputSchema = z.object({
    url: z
      .string()
      .url()
      .describe("The URL to find similar pages for"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .optional()
      .describe("Number of similar results to return (1–100, default 10)"),
    excludeSourceDomain: z
      .boolean()
      .optional()
      .describe("Exclude pages from the same domain as the input URL"),
    category: z
      .enum([
        "company",
        "research paper",
        "news",
        "pdf",
        "github",
        "tweet",
        "personal site",
        "linkedin profile",
        "financial report",
      ])
      .optional()
      .describe("Restrict results to a specific content category"),
    ...DomainFilterSchema,
    ...DateFilterSchema,
    ...TextFilterSchema,
    contents: ContentsSchema,
  });

  server.registerTool(
    "exa_find_similar",
    {
      title: "Find Similar Pages",
      description:
        "Given a URL, find other web pages that are semantically similar. " +
        "Useful for competitive analysis, finding alternative sources, " +
        "or discovering related content. Supports the same filtering " +
        "options as search (domains, dates, text content).",
      inputSchema: FindSimilarInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const response = await findSimilar(stripUndefined(params) as any);
        const header =
          `# Pages Similar to: ${params.url}\n\n` +
          `Found ${response.results.length} similar pages\n\n`;
        return {
          content: [
            { type: "text", text: header + formatResults(response.results) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // ── exa_get_contents ────────────────────────────────────────────────────

  const GetContentsInputSchema = z.object({
    urls: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe("Array of URLs or Exa result IDs to retrieve content from"),
    text: z
      .union([
        z.boolean(),
        z.object({
          maxCharacters: z.number().int().positive().optional(),
          includeHtmlTags: z.boolean().optional(),
        }),
      ])
      .optional()
      .describe("Retrieve full page text. Pass true for defaults."),
    highlights: z
      .union([
        z.boolean(),
        z.object({
          numSentences: z.number().int().positive().optional(),
          highlightsPerUrl: z.number().int().positive().optional(),
          query: z.string().optional(),
        }),
      ])
      .optional()
      .describe("Retrieve key sentence highlights"),
    summary: z
      .union([
        z.boolean(),
        z.object({
          query: z.string().optional(),
        }),
      ])
      .optional()
      .describe("Get an AI summary of each page"),
    livecrawl: z
      .enum(["always", "fallback", "never"])
      .optional()
      .describe("Live-crawl strategy for fetching content"),
  });

  server.registerTool(
    "exa_get_contents",
    {
      title: "Get Page Contents",
      description:
        "Retrieve clean, parsed content from one or more web pages by URL. " +
        "Returns text, highlights, and/or summaries. " +
        "Useful for extracting content from known URLs without searching first.",
      inputSchema: GetContentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const requestBody = stripUndefined({
          ids: params.urls,
          text: params.text,
          highlights: params.highlights,
          summary: params.summary,
          livecrawl: params.livecrawl,
        });
        const response = await getContents(requestBody as any);
        const header =
          `# Contents for ${params.urls.length} URL(s)\n\n` +
          `Retrieved ${response.results.length} pages\n\n`;
        return {
          content: [
            { type: "text", text: header + formatResults(response.results) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // ── exa_answer ──────────────────────────────────────────────────────────

  const AnswerInputSchema = z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        "The question to answer. Works best as a clear, specific question."
      ),
    text: z
      .boolean()
      .optional()
      .describe("Include source page text with citations"),
    model: z
      .string()
      .optional()
      .describe("Override the model used for answer generation"),
  });

  server.registerTool(
    "exa_answer",
    {
      title: "Answer a Question",
      description:
        "Get a direct, cited answer to a question using Exa's search + LLM pipeline. " +
        "Exa searches the web, then synthesizes an answer with inline citations. " +
        "Best for factual questions where you want a concise response backed by sources.",
      inputSchema: AnswerInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const response = await answer(stripUndefined(params) as any);
        const lines: string[] = [
          `# Answer\n`,
          response.answer,
          "",
          "---",
          "",
          `## Sources (${response.citations.length})`,
          "",
        ];
        for (const cite of response.citations) {
          lines.push(`- [${cite.title}](${cite.url})`);
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // ── exa_research_start ──────────────────────────────────────────────────

  const ResearchStartInputSchema = z.object({
    instructions: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        "Detailed instructions for the research task. " +
          "Describe what you want researched, what data to collect, " +
          "and how results should be structured."
      ),
    outputSchema: z
      .record(z.unknown())
      .optional()
      .describe(
        "Optional JSON Schema defining the structure of the research output"
      ),
  });

  server.registerTool(
    "exa_research_start",
    {
      title: "Start Deep Research",
      description:
        "Start an asynchronous deep-research task. Exa's research agent will " +
        "search, read, and compile information based on your instructions. " +
        "Returns a researchId — use exa_research_status to poll for results. " +
        "Best for complex, multi-step research that requires reading many sources.",
      inputSchema: ResearchStartInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const response = await createResearch(stripUndefined(params) as any);
        return {
          content: [
            {
              type: "text",
              text:
                `# Research Task Created\n\n` +
                `**Research ID**: \`${response.researchId}\`\n` +
                `**Status**: ${response.status}\n\n` +
                `Use \`exa_research_status\` with this ID to check progress and retrieve results.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

  // ── exa_research_status ─────────────────────────────────────────────────

  const ResearchStatusInputSchema = z.object({
    researchId: z
      .string()
      .min(1)
      .describe(
        "The research task ID returned by exa_research_start"
      ),
  });

  server.registerTool(
    "exa_research_status",
    {
      title: "Check Research Status",
      description:
        "Check the status of a deep-research task and retrieve results when complete. " +
        "The task may be 'running', 'completed', or 'failed'. " +
        "Poll this periodically until the status is 'completed'.",
      inputSchema: ResearchStatusInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const response = await getResearchStatus(params.researchId);
        const lines: string[] = [
          `# Research Status\n`,
          `**Research ID**: \`${response.researchId}\``,
          `**Status**: ${response.status}`,
        ];

        if (response.status === "completed" && response.result) {
          lines.push("", "## Results", "");
          lines.push(
            typeof response.result === "string"
              ? response.result
              : JSON.stringify(response.result, null, 2)
          );
        }

        if (response.status === "failed" && response.error) {
          lines.push("", `**Error**: ${response.error}`);
        }

        if (response.status === "running") {
          lines.push(
            "",
            "The research task is still running. " +
              "Call this tool again in a few seconds to check for completion."
          );
        }

        let output = lines.join("\n");
        if (output.length > CHARACTER_LIMIT) {
          output =
            output.slice(0, CHARACTER_LIMIT) +
            "\n\n…(output truncated)";
        }

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    }
  );

}
