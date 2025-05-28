#!/bin/bash
# Comprehensive Harbor Registry Installation Script
# This script streamlines the installation of Harbor Registry with metrics and autoscaling

set -e

echo "===== Harbor Registry Complete Installation ====="
echo "This script will install Harbor with metrics and auto-scaling capabilities"

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

# Create harbor namespace if it doesn't exist
echo "Creating harbor namespace if it doesn't exist..."
kubectl get namespace harbor > /dev/null 2>&1 || kubectl create namespace harbor

# Create monitoring namespace if it doesn't exist and Prometheus is needed
echo "Creating monitoring namespace if it doesn't exist..."
kubectl get namespace monitoring > /dev/null 2>&1 || kubectl create namespace monitoring

# Check Prometheus CRDs
echo "Checking if Prometheus Operator is installed..."
if ! kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
    echo "Warning: Prometheus Operator CRDs not found. ServiceMonitors will not work."
    echo "For monitoring, you should install Prometheus Operator separately."
    PROMETHEUS_AVAILABLE=false
else
    PROMETHEUS_AVAILABLE=true
fi

# Add Harbor Helm repository if not already added
echo "Adding Harbor Helm repository if needed..."
helm repo list | grep -q "harbor" || helm repo add harbor https://helm.goharbor.io

# Update Helm repositories
echo "Updating Helm repositories..."
helm repo update

# Install Harbor with our values
echo "Installing Harbor Registry..."
helm upgrade --install harbor harbor/harbor -f values.yaml -n harbor

# Wait for Harbor pods to be ready
echo "Waiting for Harbor pods to become ready..."
kubectl wait --for=condition=ready pod -l app=harbor -n harbor --timeout=300s || true

# Apply HPAs
echo "Applying Horizontal Pod Autoscalers..."
kubectl apply -f harbor-hpa.yaml

# Check if metrics-server is installed (required for HPA)
echo "Checking if metrics-server is available..."
if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
    echo "Warning: metrics-server not found. Installing metrics-server for HPAs to function."
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
fi

# Apply ServiceMonitors if Prometheus is available
if [ "$PROMETHEUS_AVAILABLE" = true ]; then
    echo "Applying ServiceMonitor configurations to monitoring namespace..."
    kubectl apply -f harbor-service-monitors.yaml
    echo "ServiceMonitors have been applied for Prometheus monitoring."
else
    echo "Skipping ServiceMonitor creation as Prometheus Operator CRDs are not installed."
fi

echo "===== Harbor Installation Complete ====="
echo "Harbor registry is now available at: https://registry.edurange.cloud"
echo ""
echo "To check the status of HPAs:"
echo "kubectl get hpa -n harbor"
echo ""
echo "If you installed metrics-server for the first time, wait a few minutes for it to start collecting metrics."
echo ""
echo "If you need to troubleshoot Harbor jobservice issues, check the logs:"
echo "kubectl logs -n harbor deploy/harbor-jobservice" 