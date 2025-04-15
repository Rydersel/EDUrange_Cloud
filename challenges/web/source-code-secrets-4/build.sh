#!/bin/bash

# Build the Docker image
echo "Building Docker image"
docker buildx build --platform linux/amd64 -t registry.edurange.cloud/challenges/source-code-secrets-4 . --push

echo "Build and push completed successfully!"
