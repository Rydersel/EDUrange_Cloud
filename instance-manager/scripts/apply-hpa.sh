#!/bin/bash
#
# apply-hpa.sh
# Script to apply HPAs to existing deployments (instance-manager, database-controller, dashboard, monitoring-service)
#

set -e
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Applying Horizontal Pod Autoscalers        ${NC}"
echo -e "${BLUE}=============================================${NC}"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
  echo -e "${RED}kubectl not found. Please install it before running this script.${NC}"
  exit 1
fi

# Check if metrics-server is installed
echo -e "\n${YELLOW}Checking if metrics-server is installed...${NC}"
if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
  echo -e "${RED}metrics-server not found in the kube-system namespace.${NC}"
  echo -e "${YELLOW}You need to install metrics-server for HPAs to work.${NC}"
  echo -e "${YELLOW}Run: kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml${NC}"
  
  read -p "Do you want to install metrics-server now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Installing metrics-server...${NC}"
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  else
    echo -e "${YELLOW}Please install metrics-server manually before applying HPAs.${NC}"
    exit 1
  fi
fi

# Creating temporary files for HPA definitions
echo -e "\n${YELLOW}Creating HPA definitions...${NC}"

cat <<EOF > instance-manager-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: instance-manager-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: instance-manager
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
EOF

cat <<EOF > database-controller-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: database-controller-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: database-controller
  minReplicas: 1
  maxReplicas: 6
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
EOF

cat <<EOF > dashboard-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: dashboard-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: dashboard
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
EOF

cat <<EOF > monitoring-service-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: monitoring-service-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: monitoring-service
  minReplicas: 1
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
EOF

# Verify instance-manager deployment exists
echo -e "\n${YELLOW}Checking for instance-manager deployment...${NC}"
if kubectl get deployment instance-manager -n default &> /dev/null; then
  echo -e "${GREEN}Found instance-manager deployment, applying HPA...${NC}"
  kubectl apply -f instance-manager-hpa.yaml
else
  echo -e "${RED}instance-manager deployment not found. Skipping HPA creation.${NC}"
fi

# Verify database-controller deployment exists
echo -e "\n${YELLOW}Checking for database-controller deployment...${NC}"
if kubectl get deployment database-controller -n default &> /dev/null; then
  echo -e "${GREEN}Found database-controller deployment, applying HPA...${NC}"
  kubectl apply -f database-controller-hpa.yaml
else
  echo -e "${RED}database-controller deployment not found. Skipping HPA creation.${NC}"
fi

# Verify dashboard deployment exists
echo -e "\n${YELLOW}Checking for dashboard deployment...${NC}"
if kubectl get deployment dashboard -n default &> /dev/null; then
  echo -e "${GREEN}Found dashboard deployment, applying HPA...${NC}"
  kubectl apply -f dashboard-hpa.yaml
else
  echo -e "${RED}dashboard deployment not found. Skipping HPA creation.${NC}"
fi

# Verify monitoring-service deployment exists
echo -e "\n${YELLOW}Checking for monitoring-service deployment...${NC}"
if kubectl get deployment monitoring-service -n default &> /dev/null; then
  echo -e "${GREEN}Found monitoring-service deployment, applying HPA...${NC}"
  kubectl apply -f monitoring-service-hpa.yaml
else
  echo -e "${RED}monitoring-service deployment not found. Skipping HPA creation.${NC}"
fi

# Clean up temporary files
echo -e "\n${YELLOW}Cleaning up temporary files...${NC}"
rm -f instance-manager-hpa.yaml database-controller-hpa.yaml dashboard-hpa.yaml monitoring-service-hpa.yaml

# Verify HPAs were created
echo -e "\n${YELLOW}Verifying HPAs were created...${NC}"
kubectl get hpa -n default

echo -e "\n${GREEN}HPA setup complete!${NC}"
echo -e "${YELLOW}Note: It may take a few minutes for the metrics to be collected and for the HPAs to start working.${NC}"
echo -e "${YELLOW}      Run 'kubectl get hpa -n default' to check the status of the HPAs.${NC}"
echo -e "${YELLOW}      Run 'kubectl describe hpa <hpa-name> -n default' for more detailed information.${NC}"

# Make the script executable
chmod +x apply-hpa.sh 