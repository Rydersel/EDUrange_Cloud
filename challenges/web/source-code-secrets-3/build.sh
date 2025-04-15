#!/bin/bash

# Build and push the Docker image for the source-code-secrets-3 challenge

echo "Building and pushing source-code-secrets-3 Docker image..."
docker buildx build --platform linux/amd64 -t registry.edurange.cloud/challenges/source-code-secrets-3 . --push

if [ $? -eq 0 ]; then
    echo "Build and push successful!"
    echo "Challenge image: registry.edurange.cloud/challenges/source-code-secrets-3"
else
    echo "Build or push failed. Please check the error messages above."
fi
