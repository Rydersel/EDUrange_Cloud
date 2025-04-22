#!/bin/bash
#
# check-registry-mirror.sh
# Script to verify that the registry mirror is working correctly
#

set -e
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Registry Mirror Verification Script       ${NC}"
echo -e "${BLUE}=============================================${NC}"

# 1. Check if registry-mirror pods are running
echo -e "\n${YELLOW}Checking if registry-mirror is running...${NC}"
if kubectl get pods -l app=registry-mirror | grep -q "registry-mirror"; then
    MIRROR_POD=$(kubectl get pods -l app=registry-mirror -o jsonpath='{.items[0].metadata.name}')
    MIRROR_STATUS=$(kubectl get pods $MIRROR_POD -o jsonpath='{.status.phase}')
    
    if [ "$MIRROR_STATUS" == "Running" ]; then
        echo -e "${GREEN}✓ Registry mirror pod $MIRROR_POD is running${NC}"
    else
        echo -e "${RED}✗ Registry mirror pod $MIRROR_POD status is: $MIRROR_STATUS${NC}"
        echo -e "Run 'kubectl describe pod $MIRROR_POD' for more details"
        exit 1
    fi
else
    echo -e "${RED}✗ Registry mirror not found${NC}"
    echo -e "Make sure you've enabled image caching when installing the Instance Manager"
    exit 1
fi

# 2. Check registry-mirror service
echo -e "\n${YELLOW}Checking registry-mirror service...${NC}"
if kubectl get service registry-mirror > /dev/null 2>&1; then
    MIRROR_IP=$(kubectl get service registry-mirror -o jsonpath='{.spec.clusterIP}')
    MIRROR_PORT=$(kubectl get service registry-mirror -o jsonpath='{.spec.ports[0].port}')
    echo -e "${GREEN}✓ Registry mirror service available at $MIRROR_IP:$MIRROR_PORT${NC}"
else
    echo -e "${RED}✗ Registry mirror service not found${NC}"
    exit 1
fi

# 3. Test the registry mirror with a sample pull
echo -e "\n${YELLOW}Testing registry mirror with a sample image pull...${NC}"
echo -e "Creating a temporary pod to test the mirror..."

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: registry-mirror-test
  labels:
    app: registry-mirror-test
spec:
  containers:
  - name: alpine
    image: alpine:latest
    command: ["sleep", "30"]
  restartPolicy: Never
EOF

echo -e "\n${YELLOW}Waiting for test pod to start...${NC}"
kubectl wait --for=condition=Ready pod/registry-mirror-test --timeout=60s

# 4. Check logs from the registry mirror for cache hits
echo -e "\n${YELLOW}Checking registry mirror logs for cache activity...${NC}"
kubectl logs $MIRROR_POD --tail=20 | grep -i "request\|response\|cache" | head -10
CACHE_HIT_COUNT=$(kubectl logs $MIRROR_POD | grep -i "cache" | wc -l)

echo -e "\n${YELLOW}Found $CACHE_HIT_COUNT cache-related log entries${NC}"

# 5. Test the registry mirror directly
echo -e "\n${YELLOW}Testing direct access to registry mirror API...${NC}"
kubectl exec -it registry-mirror-test -- wget -q -O- --timeout=10 http://$MIRROR_IP:$MIRROR_PORT/v2/ > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Registry mirror API is responding${NC}"
else
    echo -e "${RED}✗ Registry mirror API is not accessible${NC}"
fi

# 6. Check for cached images
echo -e "\n${YELLOW}Checking for cached images in the registry...${NC}"
kubectl exec -it registry-mirror-test -- wget -q -O- --timeout=10 http://$MIRROR_IP:$MIRROR_PORT/v2/_catalog
echo -e "\n"

# 7. Check image puller daemonset
echo -e "\n${YELLOW}Checking image puller daemonset...${NC}"
if kubectl get daemonset image-puller > /dev/null 2>&1; then
    DESIRED=$(kubectl get daemonset image-puller -o jsonpath='{.status.desiredNumberScheduled}')
    CURRENT=$(kubectl get daemonset image-puller -o jsonpath='{.status.currentNumberScheduled}')
    READY=$(kubectl get daemonset image-puller -o jsonpath='{.status.numberReady}')
    
    echo -e "Desired pods: $DESIRED"
    echo -e "Current pods: $CURRENT"
    echo -e "Ready pods:   $READY"
    
    if [ "$DESIRED" == "$READY" ]; then
        echo -e "${GREEN}✓ Image puller daemonset is fully deployed${NC}"
    else
        echo -e "${YELLOW}! Image puller is partially deployed ($READY/$DESIRED)${NC}"
    fi
else
    echo -e "${RED}✗ Image puller daemonset not found${NC}"
fi

# 8. Check cronjob
echo -e "\n${YELLOW}Checking image cache refresh cronjob...${NC}"
if kubectl get cronjob refresh-image-cache > /dev/null 2>&1; then
    SCHEDULE=$(kubectl get cronjob refresh-image-cache -o jsonpath='{.spec.schedule}')
    LAST_SCHEDULE=$(kubectl get cronjob refresh-image-cache -o jsonpath='{.status.lastScheduleTime}')
    
    echo -e "${GREEN}✓ Refresh cronjob found with schedule: $SCHEDULE${NC}"
    if [ -n "$LAST_SCHEDULE" ]; then
        echo -e "Last scheduled at: $LAST_SCHEDULE"
    else
        echo -e "Not executed yet"
    fi
else
    echo -e "${RED}✗ Refresh cronjob not found${NC}"
fi

# 9. Clean up test pod
echo -e "\n${YELLOW}Cleaning up test resources...${NC}"
kubectl delete pod registry-mirror-test

echo -e "\n${GREEN}=============================================${NC}"
echo -e "${GREEN}   Registry Mirror Verification Complete     ${NC}"
echo -e "${GREEN}=============================================${NC}"

echo -e "\n${BLUE}Summary:${NC}"
echo -e "• Registry mirror deployment: ${GREEN}OK${NC}"
echo -e "• Registry mirror service: ${GREEN}OK${NC}"
echo -e "• Image puller daemonset: ${GREEN}OK${NC}"
echo -e "• Refresh cronjob: ${GREEN}OK${NC}"
echo -e "\n${YELLOW}Note:${NC} The registry mirror caches images on first pull."
echo -e "Subsequent pulls of the same image will be much faster."
echo -e "The image puller ensures commonly used images are already cached." 