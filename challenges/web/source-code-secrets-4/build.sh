#!/bin/bash

# Build the Docker image
echo "Building Docker image"
docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/source-code-secrets-4 . --push

echo "Build and push completed successfully!"
