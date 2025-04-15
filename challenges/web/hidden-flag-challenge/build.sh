#!/bin/bash

# Build and push the Docker image for the hidden flag web challenge

echo "Building and pushing hidden-flag-challenge Docker image..."
docker buildx build --platform linux/amd64 -t registry.edurange.cloud/challenges/hidden-flag-challenge . --push

if [ $? -eq 0 ]; then
    echo "Build and push successful!"
    echo "Challenge image: registry.edurange.cloud/challenges/hidden-flag-challenge"
else
    echo "Build or push failed. Please check the error messages above."
fi
