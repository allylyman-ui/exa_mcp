/**
 * Exa.ai API client.
 *
 * Handles authentication, request formatting, and error handling
 * for all Exa API endpoints.
 */

import type {
  SearchRequest,
  SearchResponse,
  FindSimilarRequest,
  GetContentsRequest,
  GetContentsResponse,
  AnswerRequest,
  AnswerResponse,
  ResearchCreateRequest,
  ResearchCreateResponse,
  ResearchStatusResponse,
} from "./types.js";

const EXA_API_BASE = "https://api.exa.ai";
const REQUEST_TIMEOUT_MS = 30_000;

export class ExaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(`Exa API error ${status} (${statusText}): ${body}`);
    this.name = "ExaApiError";
  }
}

function getApiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    throw new Error(
      "EXA_API_KEY environment variable is required. " +
        "Get your API key at https://dashboard.exa.ai/api-keys"
    );
  }
  return key;
}

async function request<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${EXA_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ExaApiError(response.status, response.statusText, errorBody);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ExaApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Exa API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. ` +
          "Try reducing numResults or simplifying your query."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API methods ─────────────────────────────────────────────────────

export async function search(params: SearchRequest): Promise<SearchResponse> {
  return request<SearchResponse>("/search", params as unknown as Record<string, unknown>);
}

export async function findSimilar(
  params: FindSimilarRequest
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "/findSimilar",
    params as unknown as Record<string, unknown>
  );
}

export async function getContents(
  params: GetContentsRequest
): Promise<GetContentsResponse> {
  return request<GetContentsResponse>(
    "/contents",
    params as unknown as Record<string, unknown>
  );
}

export async function answer(params: AnswerRequest): Promise<AnswerResponse> {
  return request<AnswerResponse>("/answer", params as unknown as Record<string, unknown>);
}

export async function createResearch(
  params: ResearchCreateRequest
): Promise<ResearchCreateResponse> {
  return request<ResearchCreateResponse>(
    "/research/v0/tasks",
    params as unknown as Record<string, unknown>
  );
}

export async function getResearchStatus(
  researchId: string
): Promise<ResearchStatusResponse> {
  const apiKey = getApiKey();

  const response = await fetch(
    `${EXA_API_BASE}/research/v0/tasks/${researchId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ExaApiError(response.status, response.statusText, errorBody);
  }

  return (await response.json()) as ResearchStatusResponse;
}

/**
 * Formats an Exa API error into a user-friendly, actionable message.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof ExaApiError) {
    switch (error.status) {
      case 400:
        return `Error: Invalid request. Check your parameters. Details: ${error.body}`;
      case 401:
        return "Error: Invalid API key. Verify your EXA_API_KEY environment variable.";
      case 403:
        return "Error: Access forbidden. Your API key may not have permission for this endpoint.";
      case 429:
        return "Error: Rate limit exceeded. Wait a moment before retrying.";
      case 500:
        return "Error: Exa API internal error. Try again in a few seconds.";
      default:
        return `Error: Exa API returned status ${error.status}. ${error.body}`;
    }
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: An unexpected error occurred: ${String(error)}`;
}
