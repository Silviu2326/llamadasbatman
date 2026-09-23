FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data FRONTEND_DIST=/app/frontend/dist PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app/backend
COPY backend/requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements-lock.txt && playwright install --with-deps chromium && chmod -R a+rX /opt/browsers
COPY backend/ ./
COPY --from=frontend /src/frontend/dist /app/frontend/dist
RUN useradd -m -u 10001 auditor && mkdir -p /data && chown -R auditor:auditor /data /app
USER auditor
EXPOSE 8787
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8787","--workers","1"]
