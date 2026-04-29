# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* turbo.json tsconfig.base.json ./
COPY apps/engine/package.json apps/engine/
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund --workspaces=false --prefix apps/engine

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/apps/engine/node_modules /app/apps/engine/node_modules
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/engine apps/engine
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/engine && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8005
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/engine/.next/standalone /app/
COPY --from=build /app/apps/engine/.next/static /app/apps/engine/.next/static
COPY --from=build /app/apps/engine/public /app/apps/engine/public
EXPOSE 8005
CMD ["node", "apps/engine/server.js"]
