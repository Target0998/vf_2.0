#!/usr/bin/env sh
# Runs a repo Node script on a machine without Node (our Azure server), in a throwaway node:22-alpine container:
#     scripts/node.sh scripts/promote.mjs staging prod page:rolunk
#     scripts/node.sh scripts/content.mjs --only=adatvedelem --dry-run
# The repo folder is mounted at /app, so .env is read as usual. Run it from a checkout of main (~/vf_2.0 on the
# server), not from /srv/vf-*/repo. Talk to the sites by their public URL: the Admin API refuses requests to
# Ghost's internal address (http://ghost:2368) because it doesn't match Ghost's configured url.
set -eu
cd "$(dirname "$0")/.."
TTY=""; [ -t 0 ] && TTY="-it"
exec docker run --rm $TTY -v "$PWD":/app -w /app -u "$(id -u):$(id -g)" -e GHOST_URL -e GHOST_ADMIN_API_KEY node:22-alpine node "$@"
