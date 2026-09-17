# Use Debian-based Node 22 for glibc and native module compatibility
FROM node:22-slim

# Install git, compiler, and python needed for native addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    python3 \
    ca-certificates \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy all project files
COPY . .

# Install pnpm globally
RUN npm install -g pnpm@11.7.0

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Compile native Linux addons (flock, landlock)
RUN pnpm run build:native-system

# Build the web frontend
RUN pnpm run build:web

# Expose Render standard port
EXPOSE 10000

# Set environment
ENV NODE_ENV=production
ENV PORT=10000

# Start via Render ingress proxy: listens on 0.0.0.0:10000 and forwards to loopback dsh web
CMD ["node", "render-entrypoint.mjs"]