# Before You Start

Do this setup **before** `src/agent.ts`. Read **[README.md](./README.md)** for the full assignment spec.

---

## Quick start

```bash
sh setup.sh          # Bun, deps, validate endpoints.json
# Edit .env — add GOOGLE_ACCESS_TOKEN (see below)
bun run connect      # optional: verify API auth
bun run index        # list 16 sample endpoints
# implement src/agent.ts
bun run run          # → report.json
```

---

## What you need

1. **[Bun](https://bun.sh)** — `curl -fsSL https://bun.sh/install | bash`
2. **API credentials** — sample uses Gmail + Calendar (or swap `endpoints.json` + `.env` for your APIs)
3. **LLM (optional)** — any provider via `fetch` + `.env`, or pure heuristics
4. **Editor** — your choice

---

## Google access token (sample data)

1. [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Select scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `calendar.readonly`, `calendar.events`, etc.
3. Authorize → exchange code → copy **access token**
4. `.env`: `GOOGLE_ACCESS_TOKEN=...`

Tokens expire (~1 hour). Use a secondary account — some endpoints send mail or modify calendar data.

---

## LLM (optional)

Free options include **Ollama** (no key), **Hugging Face Inference**, **Groq**, **Gemini (AI Studio)**, and others — see the table in [README.md](./README.md#free-or-easy-llm-options).

Set in `.env` (examples in `.env.example`):

| Variable | Purpose |
|----------|---------|
| `LLM_API_URL` | POST endpoint |
| `LLM_API_KEY` | Key if required (empty for Ollama) |
| `LLM_MODEL` | Model name |

This is independent of `GOOGLE_ACCESS_TOKEN`. Implement a small adapter in your agent for your provider's JSON format.

---

## Deliverables

| File | What |
|------|------|
| `src/agent.ts` | Your agent (`runAgent`) |
| `report.json` | Output of `bun run run` |
| `ARCHITECTURE.md` | Your design write-up |

---

## Suggested order

1. `README.md` + `src/types.ts`
2. One GET via `connect.ts` (e.g. `GMAIL_GET_PROFILE`)
3. Deterministic status classification
4. LLM or rules for bodies + path dependencies
5. Retries (don't mark 400 as final `error` without retrying)
6. Concurrent per-endpoint runs + shared cache
7. `ARCHITECTURE.md`

The hard part: **fake endpoint (404) vs you called it wrong (400).**
