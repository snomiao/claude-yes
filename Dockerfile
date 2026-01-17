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

# Install VS Code with architecture support
ARG TARGETARCH=amd64
RUN apt update -y &&\
    apt install software-properties-common apt-transport-https curl gnupg2 -y &&\
    curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /usr/share/keyrings/vscode.gpg > /dev/null &&\
    echo "deb [arch=${TARGETARCH}] https://packages.microsoft.com/repos/vscode stable main" | tee /etc/apt/sources.list.d/vscode.list > /dev/null &&\
    apt update && apt install code -y &&\
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
    @augmentcode/auggie

# install this project
WORKDIR /src/claude-yes
# TODO: replace with COPY package.json bun.lock ./
COPY package.json bun.lock* ./
RUN bun i --skip-scripts

COPY . .
RUN bun run build && bun link


# bot user?
# RUN useradd -ms /bin/bash bot
# USER bot
WORKDIR /home/bot/

# specify a workdir is recommended
WORKDIR /root/
# 
ENTRYPOINT ["bun","/src/claude-yes/dist/claude-yes.js"]
# ENTRYPOINT bash -c " \
# cp -r /root /root/bo && \
# bun /src/claude-yes/dist/claude-yes.js $* \
# "
