#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
    compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    compose=(docker-compose)
else
    echo "Docker Compose was not found." >&2
    exit 1
fi

cleanup() {
    "${compose[@]}" down --volumes
}

trap cleanup EXIT

"${compose[@]}" up --detach --wait postgres
"${compose[@]}" build tests
"${compose[@]}" run --rm tests
