#!/bin/bash
# Runs automatically on every Codespace start, including a resume after the
# idle timeout stops the machine. Port visibility is not part of the machine
# state that survives a stop, it resets to private each time, this script
# puts it back to public without anyone having to run the gh CLI by hand.
#
# GITHUB_TOKEN and CODESPACE_NAME are provided by the Codespaces environment
# itself for lifecycle scripts, no separate login step is required for them.
set -uo pipefail

echo "${GITHUB_TOKEN}" | gh auth login --with-token >/dev/null 2>&1

for port in 7860 8501 8502; do
  gh codespace ports visibility "${port}:public" -c "${CODESPACE_NAME}" >/dev/null 2>&1
done

echo "Port visibility refresh attempted for 7860, 8501, 8502."
