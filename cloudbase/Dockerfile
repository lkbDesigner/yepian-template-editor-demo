FROM node:24-bookworm-slim
WORKDIR /app
COPY site-renderer.mjs ./
COPY server/save-worker.mjs ./server/
COPY cloudbase ./cloudbase
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "cloudbase/server.mjs"]
