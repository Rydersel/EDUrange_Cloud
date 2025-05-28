#!/bin/bash
#
# reset-image-cache.sh
# Script to reset all image caching components and clean up old flag secrets
#

set -e
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Image Cache Reset Tool                    ${NC}"
echo -e "${BLUE}=============================================${NC}"

# Function to delete resources safely (ignoring not found errors)
delete_resource() {
  local resource_type=$1
  local resource_name=$2
  local namespace=${3:-default}
  
  echo -e "${YELLOW}Deleting $resource_type/$resource_name in namespace $namespace...${NC}"
  kubectl delete $resource_type $resource_name --namespace=$namespace --ignore-not-found
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully deleted or not found: $resource_type/$resource_name${NC}"
  else
    echo -e "${RED}Error deleting $resource_type/$resource_name${NC}"
  fi
}

# Clean up registry mirror and related resources
echo -e "\n${BLUE}Step 1: Cleaning up registry mirror components...${NC}"
delete_resource "deployment" "registry-mirror"
delete_resource "service" "registry-mirror"
delete_resource "pvc" "registry-mirror-pvc"
delete_resource "configmap" "registry-mirror-config"

# Clean up image puller resources
echo -e "\n${BLUE}Step 2: Cleaning up image puller components...${NC}"
delete_resource "daemonset" "image-puller"
delete_resource "cronjob" "refresh-image-cache"

# Delete any pods related to image pulling
echo -e "\n${BLUE}Step 3: Deleting any remaining image puller pods...${NC}"
kubectl delete pods -l app=image-puller --namespace=default --ignore-not-found
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Successfully deleted image puller pods or none found${NC}"
else
  echo -e "${RED}Error deleting image puller pods${NC}"
fi

# Clean up flag secrets
echo -e "\n${BLUE}Step 4: Cleaning up old flag secrets...${NC}"
echo -e "${YELLOW}Fetching flag secrets...${NC}"
FLAG_SECRETS=$(kubectl get secrets | grep flag- | awk '{print $1}' || echo "")

if [ -z "$FLAG_SECRETS" ]; then
  echo -e "${GREEN}No flag secrets found${NC}"
else
  echo -e "${YELLOW}Found flag secrets to delete: ${NC}"
  echo -e "$FLAG_SECRETS"
  
  # Loop through each secret and delete it
  echo "$FLAG_SECRETS" | while read secret; do
    if [ ! -z "$secret" ]; then
      delete_resource "secret" "$secret"
    fi
  done
  
  echo -e "${GREEN}Flag secrets cleanup complete${NC}"
fi

# Reset webos-environment ConfigMap
echo -e "\n${BLUE}Step 5: Updating webos-environment ConfigMap...${NC}"
WEBOS_CONFIGMAP=$(kubectl get configmap webos-environment --ignore-not-found)

if [ -z "$WEBOS_CONFIGMAP" ]; then
  echo -e "${YELLOW}webos-environment ConfigMap not found, no action taken${NC}"
else
  echo -e "${YELLOW}Updating webos-environment ConfigMap with correct registry URL...${NC}"
  kubectl patch configmap webos-environment --type='json' -p='[{"op": "replace", "path": "/data/REGISTRY_URL", "value": "registry.edurange.cloud/edurange"}]'
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully updated webos-environment ConfigMap${NC}"
  else
    echo -e "${RED}Error updating webos-environment ConfigMap${NC}"
  fi
fi

echo -e "\n${GREEN}Image cache reset complete!${NC}"
echo -e "${YELLOW}If you want to re-enable image caching:${NC}"
echo -e "1. Reinstall the Instance Manager with caching enabled"
echo -e "2. Or manually apply the registry-mirror.yaml configuration" 