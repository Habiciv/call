FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY dist ./dist
COPY server ./server
EXPOSE 8080
CMD ["node", "server/index.mjs"]
