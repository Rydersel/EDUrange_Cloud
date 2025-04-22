#!/bin/bash
# Script to fix Harbor JobService multi-attach error

set -e

echo "===== Fixing Harbor JobService Multi-Attach Error ====="

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH"
    exit 1
fi

# Check if helm is available
if ! command -v helm &> /dev/null; then
    echo "Error: helm is not installed or not in PATH"
    exit 1
fi

# Create backup
echo "Creating backup of current Harbor resources..."
kubectl get all -n harbor -o yaml > harbor-all-backup-$(date +%Y%m%d%H%M%S).yaml

# Delete problematic JobService deployment and pods
echo "Deleting Harbor JobService deployment and pods..."
kubectl delete deployment -n harbor harbor-jobservice

# Wait for resources to be removed
echo "Waiting for JobService pods to terminate..."
sleep 10

# Apply the updated values.yaml to Harbor Helm chart
echo "Upgrading Harbor with fixed JobService configuration..."
helm upgrade harbor harbor/harbor \
  -f values.yaml \
  -n harbor

# Wait for Harbor pods to be ready
echo "Waiting for Harbor pods to become ready..."
kubectl wait --for=condition=ready pod -l app=harbor -n harbor --timeout=300s

echo "===== Harbor JobService Fix Complete ====="
echo ""
echo "The JobService is now configured to use emptyDir volumes and Redis for job data,"
echo "which allows multiple replicas to run simultaneously without volume conflicts."
echo ""
echo "Verify with: kubectl get pods -n harbor | grep jobservice" 