# Playwright image pins the exact Chromium that playwright@1.63.0 expects.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS base
ENV NODE_ENV=production
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM base
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
ENV DATA_DIR=/data PORT=8787 HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
