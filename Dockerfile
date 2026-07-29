FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir -p /data/backups && chown -R node:node /app /data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data BACKUP_DIR=/data/backups
EXPOSE 3000
CMD ["node", "server.js"]
