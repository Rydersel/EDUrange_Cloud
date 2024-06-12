


dockerd & #hehehe dockerd

# Wait for Docker daemon to be ready
while(! docker info > /dev/null 2>&1); do
  sleep 1
done

# Start Docker Compose
docker-compose up -d

# Keep the container from timing out
tail -f /dev/null
