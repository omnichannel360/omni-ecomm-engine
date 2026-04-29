# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
COPY services/scrape-worker/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund
COPY services/scrape-worker/tsconfig.json ./
COPY services/scrape-worker/src ./src
COPY tsconfig.base.json /tsconfig.base.json
RUN sed -i 's|../../tsconfig.base.json|/tsconfig.base.json|' tsconfig.json
ENV NODE_ENV=production
CMD ["npm","start"]
