FROM oven/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
ENTRYPOINT ["bun", "ts/cli.ts"]
