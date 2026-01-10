FROM debian

# Source - https://stackoverflow.com/a
# Posted by Abdullah Jibaly, modified by community. See post 'Timeline' for change history
# Retrieved 2026-01-09, License - CC BY-SA 3.0

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Set debconf to run non-interactively
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

# Install base dependencies
RUN apt-get update && apt-get install -y -q --no-install-recommends \
        apt-transport-https \
        build-essential \
        ca-certificates \
        curl \
        git \
        libssl-dev \
        wget \
    && rm -rf /var/lib/apt/lists/*

ENV NVM_DIR=/root/.nvm
ENV NODE_VERSION=20

# Install nvm with node and npm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && NODE_VERSION_FULL=$(ls $NVM_DIR/versions/node | grep "^v$NODE_VERSION" | head -1) \
    && echo "export NODE_VERSION_FULL=$NODE_VERSION_FULL" >> ~/.bashrc

# Set NODE_PATH and PATH using the actual installed version directory
RUN . $NVM_DIR/nvm.sh && NODE_VERSION_FULL=$(ls $NVM_DIR/versions/node | grep "^v$NODE_VERSION" | head -1) \
    && echo "NODE_PATH=$NVM_DIR/versions/node/$NODE_VERSION_FULL/lib/node_modules" >> /etc/environment \
    && echo "PATH=$NVM_DIR/versions/node/$NODE_VERSION_FULL/bin:\$PATH" >> /etc/environment

ENV PATH=$NVM_DIR/versions/node/v20.19.6/bin:$PATH
ENV NODE_PATH=$NVM_DIR/versions/node/v20.19.6/lib/node_modules


# # install nvm
# RUN apt-get update && apt-get install -y curl \
#     && curl -fsSL https://deb.nodesource.com/setup_current.x | bash - \
#     && apt-get install -y nodejs

# install bun
RUN apt-get update && apt-get install -y unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    rm -rf /var/lib/apt/lists/*

# Add bun's global bin directory to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# install git and build tools for native dependencies
RUN apt-get update && apt-get install -y git build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

# install claude-cli globally
RUN bun i @anthropic-ai/claude-code -g

# install this project
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun i --ignore-scripts
COPY . .
RUN bun build ts/index.ts --outdir=dist --target=node --sourcemap --external=@snomiao/bun-pty --external=bun-pty --external=node-pty --external=from-node-stream --external=bun && \
    bun build ts/cli.ts --outdir=dist --target=node --sourcemap --external=@snomiao/bun-pty --external=bun-pty --external=node-pty --external=from-node-stream --external=bun && \
    bun ./ts/postbuild.ts
# Install Rust for building bun-pty native module
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Rebuild native dependencies for the container environment (npm is available via nvm)
RUN npm rebuild node-pty || true

# Fix bun-pty by rebuilding with Rust
RUN node ./ts/pty-fix.ts || echo "pty-fix completed with warnings"

# setup user
# RUN useradd -m bun
# USER bun

# run bun claude
# ENTRYPOINT ["bun", "x", "@anthropic/claude-cli"]