# Base image - Node 20 (required for latest hardhat)
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies with ignore engines to handle version conflicts
RUN yarn install --ignore-engines || npm install

# Copy project files
COPY . .

# Copy deploy script with execute permission
COPY --chmod=755 deploy.sh .

# Pre-download solc compiler by running a dummy compile
# This ensures the compiler is available when deployment runs
RUN yarn hardhat compile --force 2>&1 || npm run compile 2>&1 || true

# Default command: open a shell (override in run if needed)
CMD ["/bin/sh"]

