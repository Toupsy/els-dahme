FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @els/server deploy --prod --legacy /runtime

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/els.db WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./web
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.mjs"]
