/**
 * Type definitions for the Exa.ai API.
 */

// ─── Search Types ───────────────────────────────────────────────────────────

export type SearchType = "auto" | "keyword" | "neural";

export type SearchCategory =
  | "company"
  | "research paper"
  | "news"
  | "pdf"
  | "github"
  | "tweet"
  | "personal site"
  | "linkedin profile"
  | "financial report";

export type LivecrawlOption = "always" | "fallback" | "never";

export interface TextContentsOptions {
  maxCharacters?: number;
  includeHtmlTags?: boolean;
}

export interface HighlightsContentsOptions {
  numSentences?: number;
  highlightsPerUrl?: number;
  query?: string;
}

export interface SummaryContentsOptions {
  query?: string;
}

export interface ContentsOptions {
  text?: TextContentsOptions | boolean;
  highlights?: HighlightsContentsOptions | boolean;
  summary?: SummaryContentsOptions | boolean;
}

export interface SearchRequest {
  query: string;
  type?: SearchType;
  category?: SearchCategory;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  startCrawlDate?: string;
  endCrawlDate?: string;
  includeText?: string[];
  excludeText?: string[];
  contents?: ContentsOptions;
  livecrawl?: LivecrawlOption;
  useAutoprompt?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  id: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
}

export interface SearchResponse {
  requestId: string;
  autopromptString?: string;
  results: SearchResult[];
}

// ─── Find Similar Types ─────────────────────────────────────────────────────

export interface FindSimilarRequest {
  url: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  startCrawlDate?: string;
  endCrawlDate?: string;
  includeText?: string[];
  excludeText?: string[];
  contents?: ContentsOptions;
  excludeSourceDomain?: boolean;
  category?: SearchCategory;
}

// ─── Get Contents Types ─────────────────────────────────────────────────────

export interface GetContentsRequest {
  ids: string[];
  text?: TextContentsOptions | boolean;
  highlights?: HighlightsContentsOptions | boolean;
  summary?: SummaryContentsOptions | boolean;
  livecrawl?: LivecrawlOption;
}

export interface GetContentsResponse {
  requestId: string;
  results: SearchResult[];
}

// ─── Answer Types ───────────────────────────────────────────────────────────

export interface AnswerRequest {
  query: string;
  text?: boolean;
  model?: string;
}

export interface AnswerResponse {
  requestId: string;
  answer: string;
  citations: SearchResult[];
}

// ─── Research Types ─────────────────────────────────────────────────────────

export interface ResearchCreateRequest {
  instructions: string;
  outputSchema?: Record<string, unknown>;
}

export interface ResearchCreateResponse {
  researchId: string;
  status: string;
}

export interface ResearchStatusResponse {
  researchId: string;
  status: "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}
