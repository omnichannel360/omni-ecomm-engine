# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim
WORKDIR /app
COPY services/generate-worker/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund
COPY services/generate-worker/tsconfig.json ./
COPY services/generate-worker/src ./src
COPY tsconfig.base.json /tsconfig.base.json
RUN sed -i 's|../../tsconfig.base.json|/tsconfig.base.json|' tsconfig.json
ENV NODE_ENV=production
CMD ["npm","start"]
