#!/bin/sh

# Start Docker daemon
dockerd &

# Wait for Docker daemon to be ready
while(! docker info > /dev/null 2>&1); do
  sleep 1
done

# Start Docker Compose services
docker-compose up -d

# Keep the container running
tail -f /dev/null
