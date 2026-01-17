# setup node, bun, git, debian(bookworm)
FROM node:latest
RUN npm i -g bun

# python3
RUN apt update -y && apt upgrade -y
RUN apt-get update -y && apt-get install -y git build-essential python3 && \
rm -rf /var/lib/apt/lists/*

# latest vscode
RUN apt update -y &&\
    apt install software-properties-common apt-transport-https curl gnupg2 -y &&\
    curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /usr/share/keyrings/vscode.gpg > /dev/null &&\
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/vscode.gpg] https://packages.microsoft.com/repos/vscode stable main" | tee /etc/apt/sources.list.d/vscode.list > /dev/null &&\
    apt update && apt install code -y
    
# Install Rust for building bun-pty native module
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# TODO: golang for dev
# RUN apt install -y golang-go

# common db cli
RUN apt-get install -y postgresql
# RUN curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg && \
#     echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list && \
#     apt-get update -y && apt-get install -y mongodb-org

# install agents cli as bot user globally
RUN npm i -g \
    @anthropic-ai/claude-code \
    @qwen-code/qwen-code \
    @vibe-kit/grok-cli \
    @anthropic-ai/claude-code \
    @google/gemini-cli \
    @openai/codex \
    @github/copilot \
    @augmentcode/auggie \
    && \
    curl https://cursor.com/install -fsS | bash

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
# WORKDIR /home/bot/

# 
ENTRYPOINT bun /src/claude-yes/dist/claude-yes.js
# ENTRYPOINT bash -c " \
# cp -r /root /root/bo && \
# bun /src/claude-yes/dist/claude-yes.js $* \
# "
