#!/usr/bin/env sh
# Moves CODE one stage up. Fast-forward only, so staging and prod are always a point on main's history:
#     scripts/release.sh staging      main    → staging  (then git pull + compose in /srv/vf-staging/repo)
#     scripts/release.sh prod         staging → prod     (then pull + restart on the production server)
# Every commit is made on main. Never commit on staging or prod directly – the next release would refuse.
# Content (Ghost pages, posts, theme settings, images) is not in git: see scripts/promote.mjs.
set -eu

case "${1:-}" in
    staging) FROM=main;    TO=staging ;;
    prod)    FROM=staging; TO=prod ;;
    *) echo "usage: scripts/release.sh staging|prod"; exit 1 ;;
esac

git fetch -q origin
if git rev-parse -q --verify "refs/heads/$FROM" >/dev/null && [ -n "$(git rev-list "origin/$FROM..$FROM")" ]; then
    echo "⚠ local $FROM has commits that aren't pushed – this releases origin/$FROM without them. Push first if you want them in."
fi
if ! git merge-base --is-ancestor "origin/$TO" "origin/$FROM"; then
    echo "✗ origin/$TO has commits that origin/$FROM doesn't:"
    git log --oneline "origin/$FROM..origin/$TO"
    echo "  Bring them onto main first (cherry-pick), then release again. Nothing pushed."
    exit 1
fi

COMMITS="$(git log --oneline "origin/$TO..origin/$FROM")"
if [ -z "$COMMITS" ]; then echo "$TO is already at $FROM ($(git rev-parse --short "origin/$TO")). Nothing to do."; exit 0; fi

echo "Releasing $FROM → $TO:"
echo "$COMMITS" | sed 's/^/  /'
CHANGED="$(git diff --name-only "origin/$TO" "origin/$FROM")"
echo "$CHANGED" | sed 's/^/    /'
printf "Push? [y/N] "; read -r ok; [ "$ok" = "y" ] || { echo "Nothing pushed."; exit 1; }

git push origin "origin/$FROM:refs/heads/$TO"
echo "✓ $TO = $(git rev-parse --short "origin/$FROM")"

if [ "$TO" = prod ]; then
    echo
    echo "On the server (.env sets COMPOSE_FILE, so no -f flags):"
    echo "  cd /srv/vf-prod/repo && git pull && docker compose up -d"
    echo "  docker compose restart ghost   # theme changes (prod caches templates)"
else
    echo
    echo "On the server:"
    echo "  cd /srv/vf-staging/repo && git pull && docker compose up -d"
    echo "  docker compose restart ghost   # if theme/package.json or ghost/routes.yaml changed"
fi
