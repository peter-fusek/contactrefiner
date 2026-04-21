#!/bin/bash
# Install harvester launchd agents on macOS.
#
# Copies launchagents/*.plist → ~/Library/LaunchAgents/ with user-specific
# path rewrites, then loads them via launchctl.
#
# Idempotent: unload any existing agent before reinstalling.
#
# Status: template. Relies on main.py harvest-messages / backfill-beeper /
# score-interactions / crm-sync subcommands landing in Sprint 3.33.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/contactrefiner"
UV_BIN="$(command -v uv || echo /opt/homebrew/bin/uv)"

AGENTS=(
  "com.contactrefiner.harvester.hourly"
  "com.contactrefiner.harvester.daily"
  "com.contactrefiner.harvester.weekly"
  "com.contactrefiner.harvester.monthly"
)

if [[ ! -x "${UV_BIN}" ]]; then
  echo "error: uv not found. Install with: brew install uv" >&2
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/main.py" ]]; then
  echo "error: main.py not found at ${REPO_ROOT}/main.py" >&2
  exit 1
fi

mkdir -p "${LAUNCH_DIR}"
mkdir -p "${LOG_DIR}"

# Escape `&` in replacement strings so sed treats them as literal characters.
# Without this, a REPO_ROOT containing `&` (e.g. ~/Projects/R&D/…) would
# interpolate "the matched text" from the left-hand side into the replacement,
# silently corrupting the generated plist — and launchctl would load it.
SAFE_ROOT="${REPO_ROOT//&/\\&}"
SAFE_LOG="${LOG_DIR//&/\\&}"
SAFE_UV="${UV_BIN//&/\\&}"

for agent in "${AGENTS[@]}"; do
  src="${REPO_ROOT}/launchagents/${agent}.plist"
  dst="${LAUNCH_DIR}/${agent}.plist"

  if [[ ! -f "${src}" ]]; then
    echo "warn: ${src} missing, skipping" >&2
    continue
  fi

  # Unload if already loaded (idempotent reinstall)
  launchctl unload "${dst}" 2>/dev/null || true

  # Rewrite hardcoded paths in the template to match invoking user.
  # Pipe delimiter avoids needing to escape slashes in paths.
  sed -e "s|/Users/peterfusek1980gmail.com/Projects/contactrefiner|${SAFE_ROOT}|g" \
      -e "s|/Users/peterfusek1980gmail.com/Library/Logs/contactrefiner|${SAFE_LOG}|g" \
      -e "s|/opt/homebrew/bin/uv|${SAFE_UV}|g" \
      "${src}" > "${dst}"

  launchctl load "${dst}"
  echo "✓ loaded ${agent}"
done

echo ""
echo "Installed ${#AGENTS[@]} launch agents."
echo "Logs: ${LOG_DIR}/harvester-*.log"
echo "Uninstall: ./scripts/uninstall-launchd.sh"
