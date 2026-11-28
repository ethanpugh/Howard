# Stage 1: Build the static web assets
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production dependencies only (without devDependencies)
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Serve static assets + local SQLite REST APIs via Node 24 native TypeScript
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/app/data

RUN apk add --no-cache tzdata

COPY --from=builder /app/dist ./dist
COPY package.json server.ts ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY server ./server
COPY shared ./shared
RUN mkdir -p /app/data

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 80) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.ts"]
