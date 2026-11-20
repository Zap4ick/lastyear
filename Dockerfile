# lastfmyear: one container serving the web app, the API and the story renderer.
# Build: docker build -t lastfmyear .
# Run:   docker run -p 8787:8787 -v lastfmyear-data:/data \
#          -e APP_URL=https://your.domain -e LASTFM_API_KEY=… lastfmyear

FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
ENV NODE_ENV=production \
    API_PORT=8787 \
    DB_PATH=/data/lastfmyear.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Runtime needs the TypeScript sources (run by tsx; the server also builds the bookmarklet from them).
COPY tsconfig.json ./
COPY src ./src
COPY --from=build /app/dist/web ./dist/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/server/index.ts"]
