# play with docker container
docker compose run --build -it -v ./:/ws --rm --remove-orphans agent-yes claude-yes -- hello, world
