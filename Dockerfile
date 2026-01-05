FROM debian
# install nodejs latest
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_current.x | bash - \
    && apt-get install -y nodejs

# install bun
RUN apt-get install -y unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun

# install git and build tools for native dependencies
RUN apt-get install -y git build-essential python3

# install claude-cli globally
RUN bun i @anthropic-ai/claude-code -g

# install this project
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun i --ignore-scripts
COPY . .
RUN bun run build
# Rebuild native dependencies for the container environment
RUN npm rebuild node-pty || true

# setup user
# RUN useradd -m bun
# USER bun

# run bun claude
# ENTRYPOINT ["bun", "x", "@anthropic/claude-cli"]