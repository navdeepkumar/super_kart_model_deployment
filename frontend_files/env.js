// Default backend URL for local development without Docker. When this app
// runs inside a container, docker-entrypoint.d/40-inject-backend-url.sh
// overwrites this file at startup from the BACKEND_URL environment
// variable, so this checked-in default only matters for local, no-Docker
// use, and for the very first load in any other environment before the
// header's backend settings panel is used to point it somewhere else.
window.__BACKEND_URL__ = "http://127.0.0.1:7860";
