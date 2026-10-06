FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    ARE_DATA_DIR=/data

WORKDIR /app

# No runtime dependencies: only the server, the Store View and the docs.
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /data && addgroup -S are && adduser -S are -G are && chown -R are:are /app /data
USER are

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/products/catalog >/dev/null || exit 1

CMD ["node", "server/index.js"]
