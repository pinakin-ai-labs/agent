# Use Node.js 22 as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY apps/web/package*.json ./apps/web/

# Install pnpm
RUN npm install -g pnpm@11.7.0

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the web frontend
RUN pnpm run build:web

# Expose port
EXPOSE 5173

# Start the development server
CMD ["pnpm", "--filter", "@deepseek-ai/dsh-web-frontend", "run", "dev", "--host", "0.0.0.0", "--port", "5173"]