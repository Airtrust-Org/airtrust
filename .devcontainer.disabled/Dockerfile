FROM mcr.microsoft.com/devcontainers/typescript-node:22-bullseye

# Install additional tools
RUN apt-get update && apt-get install -y \
    sqlite3 \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Wrangler globally
RUN npm install -g wrangler

# Create workspace directory
WORKDIR /workspace
