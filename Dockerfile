FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/proxmox-portal/package.json artifacts/proxmox-portal/
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm rebuild esbuild

FROM deps AS build
COPY . .
ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=3000
RUN pnpm --filter @workspace/proxmox-portal run build && \
    pnpm --filter @workspace/api-server run build

FROM node:20-slim AS production
RUN corepack enable && corepack prepare pnpm@9 --activate && \
    addgroup --system proxhub && adduser --system --ingroup proxhub proxhub
WORKDIR /app

COPY --from=deps --chown=proxhub:proxhub /app/node_modules ./node_modules
COPY --from=deps --chown=proxhub:proxhub /app/package.json ./package.json
COPY --from=deps --chown=proxhub:proxhub /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps --chown=proxhub:proxhub /app/pnpm-lock.yaml ./pnpm-lock.yaml

COPY --from=deps --chown=proxhub:proxhub /app/lib/db/node_modules ./lib/db/node_modules
COPY --from=deps --chown=proxhub:proxhub /app/lib/db/package.json ./lib/db/package.json
COPY --from=deps --chown=proxhub:proxhub /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=deps --chown=proxhub:proxhub /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

COPY --chown=proxhub:proxhub lib/api-spec/package.json ./lib/api-spec/package.json
COPY --chown=proxhub:proxhub lib/api-zod/package.json ./lib/api-zod/package.json
COPY --chown=proxhub:proxhub lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY --chown=proxhub:proxhub artifacts/proxmox-portal/package.json ./artifacts/proxmox-portal/package.json

COPY --from=build --chown=proxhub:proxhub /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=proxhub:proxhub /app/artifacts/proxmox-portal/dist/public ./artifacts/proxmox-portal/dist/public

COPY --chown=proxhub:proxhub lib/db/src ./lib/db/src
COPY --chown=proxhub:proxhub lib/db/tsconfig.json ./lib/db/
COPY --chown=proxhub:proxhub lib/db/drizzle.config.ts ./lib/db/

COPY --chown=proxhub:proxhub docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER proxhub

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
