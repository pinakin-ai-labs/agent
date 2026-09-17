# Use Node.js 22 as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy all project files
COPY . .

# Install pnpm globally
RUN npm install -g pnpm@11.7.0

# Clean install with no frozen lockfile
RUN pnpm install --no-frozen-lockfile

# Build everything (including web frontend)
RUN pnpm run build

# Expose port
EXPOSE 5173

# Set environment variables to simulate SSH connection (disables browser handoff)
# and configure the server to listen on all interfaces for production deployment
ENV SSH_CONNECTION="render-deployment"
ENV NODE_ENV=production

# Use dsh web with production build, no browser opening, and let it bind to default host
# The SSH_CONNECTION env var will prevent browser opening and should allow network access
CMD ["pnpm", "dsh", "web", "--port", "5173", "--no-open"]