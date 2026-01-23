# setup node, bun, git, debian(bookworm)
FROM node:latest
RUN npm i -g bun

# python3 and build tools
RUN apt update -y && apt upgrade -y
RUN apt-get update -y && apt-get install -y \
    git \
    build-essential \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# VS Code - supports both amd64 and arm64
ARG TARGETARCH
RUN apt update -y && \
    apt install software-properties-common apt-transport-https curl gnupg2 -y && \
    curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /usr/share/keyrings/vscode.gpg > /dev/null && \
    echo "deb [arch=${TARGETARCH}] https://packages.microsoft.com/repos/vscode stable main" | tee /etc/apt/sources.list.d/vscode.list > /dev/null && \
    apt update && apt install code -y && \
    rm -rf /var/lib/apt/lists/*

# Install Rust for building bun-pty native module
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# TODO: golang for dev
# RUN apt install -y golang-go

# common db cli (optional, uncomment if needed)
# RUN apt-get update -y && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# install agents cli globally
RUN npm i -g \
    @anthropic-ai/claude-code \
    @qwen-code/qwen-code \
    @vibe-kit/grok-cli \
    @google/gemini-cli \
    @openai/codex \
    @github/copilot \
    @augmentcode/auggie \
    opencode-ai \
    @sourcegraph/amp
    

# install bun seems not working
# RUN curl -fsSL https://bun.com/install | bash && \
#   export BUN_INSTALL="$HOME/.bun" && \
#   export PATH="$BUN_INSTALL/bin:$PATH"

# install this project
WORKDIR /src/agent-yes
COPY package.json bun.lock ./
# Install dependencies - node-pty will build its native modules (needs build-essential, python3)
RUN bun install

# build and link
COPY . .
RUN bun run build && bun link

# bot user?
RUN useradd -ms /bin/bash bot
# USER bot
# WORKDIR /home/bot/

# specify a workdir is recommended
WORKDIR /root/

# Use node to run (uses node-pty which properly passes environment variables)
ENTRYPOINT ["bash", "-c", "exec node /src/agent-yes/dist/agent-yes.js $@", "bash"]
# ENTRYPOINT bash -c " \
# cp -r /root /root/bo && \
# bun /src/agent-yes/dist/agent-yes.js $* \
# "
