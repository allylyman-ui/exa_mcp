# Exa MCP Server

An MCP (Model Context Protocol) server for the [Exa.ai](https://exa.ai) search API, deployable on Vercel.

## Tools

| Tool | Description |
|------|-------------|
| `exa_search` | AI-powered web search with semantic, keyword, or auto modes |
| `exa_find_similar` | Find pages semantically similar to a given URL |
| `exa_get_contents` | Retrieve clean text, highlights, or summaries from URLs |
| `exa_answer` | Get a direct answer to a question with cited sources |
| `exa_research_start` | Start an async deep-research task |
| `exa_research_status` | Poll a research task for results |

## Deploy to Vercel

1. Push this repo to GitHub
2. Import it into [Vercel](https://vercel.com/new)
3. Add the `EXA_API_KEY` environment variable in Vercel project settings
4. Deploy

Your MCP endpoint will be available at:

```
https://<your-project>.vercel.app/api/mcp
```

## Connect to an MCP Client

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "exa": {
      "url": "https://<your-project>.vercel.app/api/mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "exa": {
      "url": "https://<your-project>.vercel.app/api/mcp"
    }
  }
}
```

## Local Development

```bash
npm install
npx vercel dev
```

Set `EXA_API_KEY` in a `.env` file:

```
EXA_API_KEY=your-key-here
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXA_API_KEY` | Yes | Your Exa API key from [dashboard.exa.ai](https://dashboard.exa.ai/api-keys) |
