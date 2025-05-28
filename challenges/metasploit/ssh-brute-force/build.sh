#!/bin/bash

# Exit on error
set -e

# Configuration
REGISTRY="registry.edurange.cloud/challenges"
# CHALLENGE_NAME="ssh-brute-force"
CHALLENGE_NAME="vim-privesc-part3"

PLATFORM="linux/amd64"

# Display banner
echo "=========================================="
echo "Building ${CHALLENGE_NAME} Docker images"
echo "Target platform: ${PLATFORM}"
echo "=========================================="

# Ensure buildx is available and set up
echo "Setting up Docker Buildx..."
docker buildx inspect mybuilder >/dev/null 2>&1 || docker buildx create --name mybuilder --use
docker buildx use mybuilder

# Build attack container
echo "Building attack container..."
docker buildx build --platform ${PLATFORM} \
  -t ${REGISTRY}/${CHALLENGE_NAME}-attack \
  ./attack

# Build defense container
echo "Building defense container..."
docker buildx build --platform ${PLATFORM} \
  -t ${REGISTRY}/${CHALLENGE_NAME}-defense \
  ./defense

# Push images to registry
echo "=========================================="
echo "Pushing images to registry..."
echo "=========================================="

# Push attack container
echo "Pushing attack container..."
docker buildx build --platform ${PLATFORM} \
  -t ${REGISTRY}/${CHALLENGE_NAME}-attack \
  --push \
  ./attack

# Push defense container
echo "Pushing defense container..."
docker buildx build --platform ${PLATFORM} \
  -t ${REGISTRY}/${CHALLENGE_NAME}-defense \
  --push \
  ./defense

# Show results
echo "=========================================="
echo "Build and push complete!"
echo "Created and pushed the following images:"
echo " - ${REGISTRY}/${CHALLENGE_NAME}-attack (${PLATFORM})"
echo " - ${REGISTRY}/${CHALLENGE_NAME}-defense (${PLATFORM})"
echo "=========================================="
