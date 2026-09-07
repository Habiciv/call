FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate \
    && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

EXPOSE 8080
CMD ["node", "server/index.mjs"]
