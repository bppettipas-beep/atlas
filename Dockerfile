# =============================================================================
#  Atlas — production image
#
#  One Node service that serves both the REST/Socket.IO API and the built React
#  app. Railway builds this automatically when the repository contains it.
#
#  Build locally with:
#    docker build -t atlas .
#    docker run -p 8080:8080 -e DATABASE_URL=... -e JWT_SECRET=... \
#      -e SESSION_SECRET=... -e NODE_ENV=production atlas
# =============================================================================

# ------------------------------- build stage ---------------------------------
FROM node:22-alpine AS builder

# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

# Install with the lockfile first so Docker can cache this layer. The Prisma
# schema has to be present because `postinstall` runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Then the source, so a code change does not invalidate the install layer.
COPY . .

RUN npm run build

# ------------------------------ runtime stage --------------------------------
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only. `prisma` is a runtime dependency on purpose:
# the start command runs `prisma migrate deploy` before booting the server.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Attachments land here. Mount a Railway Volume at /app/uploads if you want
# them to survive a redeploy — the container filesystem is ephemeral.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
ENV UPLOAD_DIR=/app/uploads

USER node

# Railway injects PORT; this is only the fallback for a plain `docker run`.
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applies any pending migrations, then starts the API. `migrate deploy` only
# ever applies migrations that already exist — it never resets or drops data.
CMD ["npm", "run", "start"]
