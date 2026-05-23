#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

SETUP_OK=true

echo ""
echo "=== API Endpoint Validator — Setup ==="
echo ""

if command -v bun >/dev/null 2>&1; then
	pass "Bun is installed ($(bun --version))"
else
	fail "Bun is not installed"
	echo "  Install: curl -fsSL https://bun.sh/install | bash"
	exit 1
fi

if [ -f .env ]; then
	pass ".env exists"
else
	if [ -f .env.example ]; then
		cp .env.example .env
		warn "Created .env from .env.example — add credentials before calling APIs"
	else
		fail "Missing .env and .env.example"
		SETUP_OK=false
	fi
fi

echo ""
echo "Installing dev dependencies (TypeScript types only)..."
bun install
pass "Dev dependencies installed"

echo ""
echo "Validating starter kit..."
if bun src/check.ts; then
	pass "Starter kit check passed"
else
	fail "Starter kit check failed"
	SETUP_OK=false
fi

echo ""
echo "Endpoint preview:"
INDEX_OUT=$(bun src/index.ts 2>&1)
echo "$INDEX_OUT" | head -n 22
INDEX_LINES=$(echo "$INDEX_OUT" | wc -l)
if [ "$INDEX_LINES" -gt 22 ]; then
	echo "  ... (truncated — run: bun run index)"
fi

echo ""
echo "Checking target API credentials (optional for sample endpoints)..."
if [ -f .env ] && grep -qE '^GOOGLE_ACCESS_TOKEN=.+' .env 2>/dev/null; then
	CONNECT_OUT=$(bun src/connect.ts 2>&1) || CONNECT_EXIT=$?
	if echo "$CONNECT_OUT" | grep -q "Auth works"; then
		pass "API token probe succeeded"
	else
		warn "API token probe did not succeed"
		echo "$CONNECT_OUT" | sed 's/^/    /'
		warn "Update GOOGLE_ACCESS_TOKEN — see PREPARATION.md"
	fi
else
	warn "GOOGLE_ACCESS_TOKEN not set — required for bundled Gmail/Calendar sample"
	echo "  You can still read the assignment and implement the agent."
fi

echo ""
echo "LLM (optional — configure in .env when you wire your model in src/agent.ts)..."
if [ -f .env ] && grep -qE '^LLM_API_URL=.+' .env 2>/dev/null; then
	pass "LLM_API_URL is set"
else
	warn "LLM_API_URL not set (optional)"
fi

echo ""
echo "=== Setup Summary ==="
if [ "$SETUP_OK" = true ]; then
	echo -e "${GREEN}Starter kit is ready. Implement src/agent.ts (see README.md).${NC}"
else
	echo -e "${YELLOW}Fix the errors above, then continue.${NC}"
fi
echo ""
echo "Commands:"
echo "  bun run check     — validate endpoints.json"
echo "  bun run index     — list endpoints"
echo "  bun run connect   — test API credentials"
echo "  bun run run       — run your agent → report.json"
echo ""
