# Static Web Components frontend for the SuperKart sales forecasting UI.
# No Node build step involved: plain HTML, CSS, and a single ES module,
# served exactly as written by Nginx.
FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY env.js /usr/share/nginx/html/env.js
COPY src/ /usr/share/nginx/html/src/
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-inject-backend-url.sh /docker-entrypoint.d/40-inject-backend-url.sh

RUN chmod +x /docker-entrypoint.d/40-inject-backend-url.sh

EXPOSE 8501

# BACKEND_URL is read by 40-inject-backend-url.sh at container start, not
# at build time, so the same image works with the Docker network hostname
# below, http://localhost:7860 for a local run, or a forwarded Codespace
# URL, just by passing a different value to `docker run -e BACKEND_URL=...`.
ENV BACKEND_URL="http://superkart-backend:7860"
