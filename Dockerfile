# ─── Stage 1: Build the Vite/React frontend ────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install root dependencies (Vite, React, etc.)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY index.html vite.config.js .oxlintrc.json ./
COPY public ./public
COPY src ./src
RUN npm run build
# Output is in /app/dist

# ─── Stage 2: Production image with the Node.js backend ────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server source
COPY server ./server

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Render injects $PORT at runtime; default to 5000 for local testing
ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server/index.js"]
