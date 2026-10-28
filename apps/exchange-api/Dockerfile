# Образ exchange-api. Сборка из корня монорепо:
#   docker build -f apps/exchange-api/Dockerfile -t raffle-exchange-api .
FROM node:22.21.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@raffle-exchange/exchange-api...
# Только production-зависимости приложения и собранные workspace-пакеты.
RUN pnpm --filter=@raffle-exchange/exchange-api deploy --prod --legacy /out

FROM node:22.21.1-bookworm-slim AS runtime
ENV NODE_ENV=production EXCHANGE_API_HOST=0.0.0.0 EXCHANGE_API_PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
