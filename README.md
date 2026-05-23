# API Endpoint Validator

Build an AI agent that, given a list of API endpoint definitions, figures out which ones actually work.

**Start here:** [PREPARATION.md](./PREPARATION.md) (setup) → implement `src/agent.ts` → document in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## The Problem

You have a JSON file with API endpoint definitions. For each endpoint, your agent must determine:

- **Valid** — the endpoint exists and returns a successful response (any 2xx)
- **Invalid** (`invalid_endpoint`) — the endpoint doesn't exist in the real API (404, wrong method)
- **Insufficient scopes** — the endpoint exists but the credentials lack permissions (401, 403)
- **Error** — something else went wrong (bad request, server error, timeout)

This is a single-request sanity check per endpoint. You're not testing business logic or edge cases. One successful call is enough to mark an endpoint as valid.

## What Makes This Hard

**Some endpoints are fake.** They look like real endpoints but the path doesn't exist. Your agent must distinguish between "this endpoint doesn't exist" and "I sent a bad request." A 404 means the endpoint is fake. A 400 means you messed up. These are different.

**Some endpoints have dependencies.** You can't call `GET /messages/{messageId}` without a real message ID. Your agent needs to figure out that it should first call `GET /messages`, extract an ID from the response, and substitute it into the path. This must work generically for any API, not hardcoded for specific resources.

**Some endpoints need request bodies.** A `POST` to create an issue needs a JSON body with at least a title. Your agent must construct minimal valid payloads from the parameter schema — not garbage, not empty objects.

**Some endpoints will fail because your agent called them wrong, not because the endpoint is broken.** This is the most important problem. If your agent sends a malformed request and gets a 400, classifying the endpoint as `error` is wrong — the endpoint is valid, your agent just doesn't know how to call it. Good agents retry. Bad agents misclassify.

**Your agent must work for any API.** No hardcoded logic for specific services. If someone swaps in endpoints for Stripe or Jira or Notion, your agent should handle it without code changes.

## Sample data

The bundled `endpoints.json` has **16 endpoints** (Gmail + Google Calendar), including a few **intentionally fake paths** (e.g. folders, archive, reminders routes that do not exist on the real API). Your agent should classify those as `invalid_endpoint`, not `error`.

## Endpoint Definition Format

Each endpoint in `endpoints.json`:

```json
{
  "tool_slug": "UNIQUE_ID",
  "description": "What this endpoint does.",
  "app": "service_name",
  "method": "GET",
  "base_url": "https://api.example.com",
  "path": "/resource/{id}",
  "required_scopes": ["read:resource"],
  "parameters": {
    "query": [
      { "name": "limit", "type": "integer", "required": false, "description": "Max results." }
    ],
    "header": [],
    "path": [
      { "name": "id", "type": "string", "required": true, "description": "Resource ID." }
    ],
    "body": null
  }
}
```

- `base_url` + `path` — the full URL. Path may contain `{placeholders}` for path parameters that must be substituted before calling.
- `parameters.query` — query string parameters.
- `parameters.path` — path parameters that need real values from other endpoints.
- `parameters.body` — request body schema for POST/PUT/PATCH.
- `required_scopes` — permissions the endpoint needs. For reporting only.

In the **provided** `endpoints.json`, `base_url` lives once per app (`gmail`, `googlecalendar`). `load-endpoints.ts` flattens each row with `app` + `base_url` before your agent runs.

## How to Call APIs

Use `fetch()`. Build the URL from `base_url + path`, inject auth headers, make the call. Starter helpers live in `connect.ts` (`loadEnv`, `authHeadersForApp`, `buildRequestUrl`).

```typescript
const res = await fetch("https://api.example.com/resource/123", {
  method: "GET",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  },
});
const status = res.status;
const body = await res.json();
```

**Path parameters** like `{messageId}` must be substituted into the URL before calling. `fetch()` doesn't do this for you.

**Query parameters** go in the URL string or as a `URLSearchParams` object.

**Request bodies** for POST/PUT/PATCH get JSON-stringified.

## Authentication

Credentials live in `.env`. Different APIs use different auth patterns — your agent must handle at least these:

| Pattern | How it works |
|---------|-------------|
| Bearer token | `Authorization: Bearer <token>` |
| API key in header | `X-API-Key: <key>` or any custom header |
| API key in query param | `?apikey=<key>` appended to the URL |
| Basic auth | `Authorization: Basic base64(user:pass)` |
| No auth | Nothing needed |

See `.env.example` and `connect.ts` for naming conventions (`GOOGLE_ACCESS_TOKEN`, `AUTH_MODE`, per-app overrides).

## How to Use an LLM (optional but recommended)

Use **whatever model provider you prefer** — local or cloud. Wire it with `fetch()` and credentials from `.env`. No SDK and no required vendor.

This is **separate from API keys for Gmail/Calendar** (`GOOGLE_ACCESS_TOKEN`). The LLM is only for reasoning inside your agent (bodies, dependencies, retries). You can use a free LLM key even when testing the Google sample endpoints.

Typical env vars (see `.env.example`):

- `LLM_API_URL` — HTTP endpoint for your provider
- `LLM_API_KEY` — API key (leave empty if not required, e.g. local Ollama)
- `LLM_MODEL` — model id/name

Each provider uses a different request/response JSON shape. Implement a small adapter in your agent (or `src/llm.ts`) for the one you pick.

### Free or easy LLM options

| Provider | API key? | Getting started |
|----------|----------|-----------------|
| **[Ollama](https://ollama.ai)** (local) | No | Install Ollama, `ollama pull llama3.2`, run the app. `LLM_API_URL=http://localhost:11434/api/chat` |
| **[Hugging Face Inference](https://huggingface.co/docs/api-inference)** | Yes (free tier) | Create a token at [hf.co/settings/tokens](https://huggingface.co/settings/tokens). Use the Inference API URL for your chosen model. |
| **[Groq](https://console.groq.com)** | Yes (free tier) | Sign up, create an API key. OpenAI-style chat completions URL. |
| **[Google AI Studio](https://aistudio.google.com)** (Gemini) | Yes (free tier) | API key from AI Studio; use Gemini’s HTTP API. |
| **[OpenRouter](https://openrouter.ai)** | Optional | Some models are free; one key, many backends. |
| **Together, Mistral, etc.** | Often free credits | Sign up; many expose OpenAI-compatible endpoints. |

You may also skip an LLM and use heuristics/rules only (harder for POST bodies and path dependencies, but allowed).

The model handles ambiguous work: request bodies, dependency planning, retry reasoning. Auth injection, HTTP calls, and status code mapping should stay deterministic code.

## Classification

| Status | Meaning | Signals |
|--------|---------|---------|
| `valid` | Endpoint works | Any 2xx |
| `invalid_endpoint` | Doesn't exist | 404, 405 |
| `insufficient_scopes` | Auth/permission issue | 401, 403 |
| `error` | Something else | 400, 422, 5xx, timeout, network error |

**An HTTP 400 is not `invalid_endpoint`.** Retry with corrected parameters before giving up.

## Dependency Resolution

1. Endpoint has path parameters: `GET /repos/{owner}/{repo}/issues`
2. Another endpoint returns a list with real IDs
3. Call the list first, extract values, substitute into the path
4. Call the detail endpoint

Detect this from the schema — do not hardcode Gmail/Calendar resource names.

## Architecture

**One agent per endpoint.** Each endpoint gets its own test run.

**No hardcoded execution order.** Run concurrently; resolve dependencies at runtime from cached responses.

**Minimize false negatives.** Real endpoints misclassified because of bad params or bodies are worse than missing a fake endpoint.

## Output Format

Your `runAgent()` returns a `TestReport`:

```json
{
  "total_endpoints": 16,
  "results": [
    {
      "tool_slug": "SOME_ENDPOINT",
      "method": "GET",
      "path": "/resource",
      "app": "service_name",
      "status": "valid",
      "http_status_code": 200,
      "response_summary": "Returned list of 5 items. Endpoint is working.",
      "response_body": {},
      "required_scopes": ["read:resource"],
      "attempts": 1
    }
  ],
  "summary": {
    "valid": 12,
    "invalid_endpoint": 2,
    "insufficient_scopes": 1,
    "error": 1
  }
}
```

Every endpoint must appear exactly once in `results`. Summary counts must match.

## What to Build

Implement `runAgent()` in `src/agent.ts`. It receives `{ endpoints: EndpointDefinition[] }` and returns a `TestReport`.

Also write `ARCHITECTURE.md` covering request construction, dependency resolution, false negatives, LLM vs deterministic split, and what would break on a new API.

## Setup

```bash
# 1. Install Bun: https://bun.sh
# 2. From repo root:
sh setup.sh

# 3. Add credentials to .env (see PREPARATION.md)
bun run connect    # optional: probe API auth
bun run index      # list endpoints
bun run run        # after implementing agent → report.json
```

## Constraints

- **Bun only.** Not Node.js.
- **Zero runtime npm dependencies.** Only `fetch`, `Bun.file`, etc. Dev dependency: `@types/bun` for editor types.
- **Model-agnostic.** Any LLM over HTTP, or no LLM.
- **No hardcoded app logic.** Work from the schema.

## File Structure

```
src/
├── agent.ts           ← YOUR IMPLEMENTATION
├── types.ts           ← Types (provided, do not modify)
├── run.ts             ← Runner + validation (provided, do not modify)
├── endpoints.json     ← Endpoint definitions (provided, do not modify)
├── load-endpoints.ts  ← Loads + flattens endpoints.json (provided)
├── connect.ts         ← Auth + URL helpers (provided; extend if needed)
├── index.ts           ← Endpoint summary viewer (provided)
└── check.ts           ← Starter kit sanity check (provided)
```

Add files as needed. Don't modify `types.ts`, `run.ts`, or `endpoints.json`.
