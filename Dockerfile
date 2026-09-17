# Use Node.js 22 as the base image
FROM node:22-alpine

# Install git needed for versioning and dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy all project files
COPY . .

# Install pnpm globally
RUN npm install -g pnpm@11.7.0

# Install dependencies with flexible lockfile
RUN pnpm install --no-frozen-lockfile

# Build the web frontend
RUN pnpm run build:web

# Expose Render standard port
EXPOSE 10000

# Set environment
ENV NODE_ENV=production
ENV PORT=10000

# Start via Render ingress proxy: listens on 0.0.0.0:10000 and forwards to loopback dsh web
CMD ["node", "render-entrypoint.mjs"]