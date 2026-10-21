#!/usr/bin/env bash
# Run on Hostinger over SSH after cloning watcher3frontend.
# Usage:
#   PUBLIC_HTML="$HOME/domains/wacheelectronics.com/public_html" ./scripts/hostinger-deploy-frontend.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLIC_HTML="${PUBLIC_HTML:-$HOME/domains/wacheelectronics.com/public_html}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"

if [[ ! -f package.json ]]; then
  echo "Run this from the watcher3frontend repo root (package.json missing)." >&2
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "Expected a git clone of watcher3frontend." >&2
  exit 1
fi

echo "Pulling latest main..."
git pull origin main

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating default $ENV_FILE (edit API URLs if needed)."
  cat > "$ENV_FILE" << 'EOF'
VITE_API_ORIGINS=https://wach.wacheelectronics.com,https://watcher3-u8aw.onrender.com
EOF
fi

echo "Installing dependencies..."
npm ci

echo "Building production bundle..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
npm run build

if [[ ! -d dist ]]; then
  echo "Build failed: dist/ not found." >&2
  exit 1
fi

mkdir -p "$PUBLIC_HTML"
echo "Publishing to $PUBLIC_HTML ..."
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete dist/ "$PUBLIC_HTML/"
else
  rm -rf "${PUBLIC_HTML:?}"/*
  cp -a dist/. "$PUBLIC_HTML/"
fi

echo "Done. Site files updated."
