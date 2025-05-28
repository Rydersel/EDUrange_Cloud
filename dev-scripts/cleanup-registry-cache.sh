#!/bin/bash
#
# cleanup-registry-cache.sh
# Script to clean up unused images from the registry mirror
#

set -e
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Registry Mirror Cache Cleanup             ${NC}"
echo -e "${BLUE}=============================================${NC}"

# Get the registry mirror pod name
REGISTRY_POD=$(kubectl get pods -l app=registry-mirror -o jsonpath='{.items[0].metadata.name}')

if [ -z "$REGISTRY_POD" ]; then
  echo -e "${RED}Error: Registry mirror pod not found${NC}"
  exit 1
fi

echo -e "${YELLOW}Found registry mirror pod: $REGISTRY_POD${NC}"

# Check current storage usage
echo -e "\n${BLUE}Current storage usage:${NC}"
kubectl exec -it $REGISTRY_POD -- du -sh /var/lib/registry

# List all repositories in the registry
echo -e "\n${BLUE}Current repositories in cache:${NC}"
kubectl exec -it $REGISTRY_POD -- /bin/sh -c "curl -s http://localhost:5000/v2/_catalog" | jq

# Prompt for confirmation
echo -e "\n${YELLOW}Warning: This will run garbage collection on the registry mirror.${NC}"
echo -e "${YELLOW}It will remove unreferenced layers and may reduce storage usage.${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Operation cancelled${NC}"
  exit 0
fi

# Run garbage collection inside the registry pod
echo -e "\n${BLUE}Running garbage collection...${NC}"
kubectl exec -it $REGISTRY_POD -- /bin/registry garbage-collect --delete-untagged /etc/docker/registry/config.yml

# Check storage after garbage collection
echo -e "\n${BLUE}Storage usage after cleanup:${NC}"
kubectl exec -it $REGISTRY_POD -- du -sh /var/lib/registry

echo -e "\n${GREEN}Registry cleanup complete!${NC}" 