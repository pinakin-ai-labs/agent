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

# Build the web frontend
RUN pnpm run build:web

# Expose port
EXPOSE 5173

# Use the correct dsh web command instead of direct vite
CMD ["pnpm", "dsh", "web", "--host", "0.0.0.0", "--port", "5173"]