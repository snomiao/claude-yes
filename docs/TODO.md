# Maybe: add a --until='validating-command' to ensure it works
e.g.: codex-yes --until="bun fmt" -- do some task
when idle will run the validating command and /exit if it success
and will ask agent to debug this command if it doesnt success
