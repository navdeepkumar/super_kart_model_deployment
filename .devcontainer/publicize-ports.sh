#!/bin/bash
# Runs automatically on every Codespace start, including a resume after the
# idle timeout stops the machine. Port visibility is not part of the machine
# state that survives a stop, it resets to private each time, this script
# puts it back to public without anyone having to run the gh CLI by hand.
#
# GITHUB_TOKEN and CODESPACE_NAME are expected to already be present in the
# lifecycle command environment that Codespaces provides for this hook.
# Everything is logged to a fixed path so a failure here can be diagnosed
# after the fact instead of disappearing silently.
LOG_FILE=/tmp/publicize-ports.log
{
  echo "=== publicize-ports.sh run at $(date -u) ==="
  echo "CODESPACE_NAME=${CODESPACE_NAME:-<unset>}"
  echo "GITHUB_TOKEN present: $([ -n "${GITHUB_TOKEN:-}" ] && echo yes || echo no)"

  if [ -z "${GITHUB_TOKEN:-}" ] || [ -z "${CODESPACE_NAME:-}" ]; then
    echo "Skipping, GITHUB_TOKEN or CODESPACE_NAME is not available in this session."
  else
    echo "${GITHUB_TOKEN}" | gh auth login --with-token
    echo "auth login exit code: $?"
    gh auth status

    for port in 7860 8501 8502; do
      gh codespace ports visibility "${port}:public" -c "${CODESPACE_NAME}"
      echo "visibility ${port} exit code: $?"
    done
  fi

  echo "=== done ==="
} >>"${LOG_FILE}" 2>&1
