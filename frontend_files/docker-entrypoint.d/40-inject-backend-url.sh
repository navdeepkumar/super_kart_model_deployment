#!/bin/sh
# Regenerates env.js from the BACKEND_URL environment variable every time
# the container starts. The official Nginx image runs any executable
# script under /docker-entrypoint.d/ before Nginx itself starts, so this
# needs no custom ENTRYPOINT of its own.
#
# The same image can therefore point at a different backend in every
# environment (a Docker network hostname when both containers share a
# network, or a forwarded Codespace URL) without ever being rebuilt.
set -e

BACKEND_URL="${BACKEND_URL:-http://superkart-backend:7860}"

cat > /usr/share/nginx/html/env.js <<EOF
window.__BACKEND_URL__ = "${BACKEND_URL}";
EOF
