# Shoulder family app: the built React app and the Python API in one image.
#
#   docker build -t shoulder .
#   docker run -p 8001:8001 -v shoulder-data:/data shoulder
#
# The SQLite database lives in /data. Mount a volume there or families are lost
# when the container is replaced.

FROM node:20-slim AS app
WORKDIR /build/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv

COPY pyproject.toml README.md LICENSE ./
COPY shoulder/ shoulder/
RUN pip install .

# The server runs from /srv, so it finds fixtures/ and app/dist beside the code.
COPY fixtures/ fixtures/
COPY --from=app /build/app/dist app/dist

RUN useradd --system --uid 10001 --home /srv shoulder \
    && mkdir -p /data \
    && chown shoulder /data
USER shoulder

ENV SHOULDER_DB=/data/shoulder.db
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/health', timeout=4)"
CMD ["python", "-m", "shoulder.api", "--host", "0.0.0.0", "--port", "8001"]
