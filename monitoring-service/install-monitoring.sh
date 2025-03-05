#!/bin/bash

# EDURange Cloud Monitoring Installation Script
# This script installs and configures Prometheus, the monitoring service, and connects them to the dashboard

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}EDURange Cloud Monitoring Installation Script${NC}"
echo "This script will install and configure Prometheus and the monitoring service"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed. Please install kubectl first.${NC}"
    exit 1
fi

# Check if helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${RED}Error: helm is not installed. Please install helm first.${NC}"
    exit 1
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed. Please install docker first.${NC}"
    exit 1
fi

# Function to clean up existing monitoring deployments
cleanup_existing_monitoring() {
    echo -e "${YELLOW}Cleaning up existing monitoring deployments...${NC}"

    # Check if monitoring namespace exists
    if kubectl get namespace monitoring &> /dev/null; then
        echo "Removing existing Prometheus and Grafana installations..."

        # Uninstall Prometheus if it exists
        if helm list -n monitoring | grep prometheus &> /dev/null; then
            echo "Uninstalling Prometheus Helm release..."
            helm uninstall prometheus -n monitoring
            echo "Prometheus uninstalled."
        fi

        # Check for any remaining Prometheus resources and delete them
        echo "Checking for remaining Prometheus resources..."

        # Delete Prometheus CRDs if they exist
        for crd in $(kubectl get crd -o name | grep "monitoring.coreos.com" || true); do
            echo "Deleting CRD: $crd"
            kubectl delete $crd --ignore-not-found
        done

        # Delete ServiceMonitor for instance-manager if it exists
        if kubectl get servicemonitor instance-manager -n monitoring &> /dev/null; then
            kubectl delete servicemonitor instance-manager -n monitoring
            echo "ServiceMonitor for instance-manager deleted."
        fi

        # Delete instance-manager-metrics service if it exists
        if kubectl get service instance-manager-metrics -n default &> /dev/null; then
            kubectl delete service instance-manager-metrics -n default
            echo "instance-manager-metrics service deleted."
        fi

        # Delete monitoring-service deployment if it exists
        if kubectl get deployment monitoring-service -n default &> /dev/null; then
            kubectl delete deployment monitoring-service -n default
            echo "monitoring-service deployment deleted."
        fi

        # Delete monitoring-service service if it exists
        if kubectl get service monitoring-service -n default &> /dev/null; then
            kubectl delete service monitoring-service -n default
            echo "monitoring-service service deleted."
        fi

        # Delete monitoring-service ServiceMonitor if it exists
        if kubectl get servicemonitor monitoring-service -n monitoring &> /dev/null; then
            kubectl delete servicemonitor monitoring-service -n monitoring
            echo "ServiceMonitor for monitoring-service deleted."
        fi

        # Delete all Prometheus-related resources in the monitoring namespace
        echo "Deleting all Prometheus-related resources in the monitoring namespace..."
        kubectl delete --all deployments,statefulsets,services,pods,configmaps,secrets -n monitoring --ignore-not-found

        # Wait for resources to be deleted
        echo "Waiting for resources to be deleted..."
        sleep 10

        # Delete and recreate the monitoring namespace to ensure a clean slate
        echo "Deleting and recreating monitoring namespace..."
        kubectl delete namespace monitoring --ignore-not-found
        sleep 5
        kubectl create namespace monitoring
    else
        echo "No existing monitoring namespace found. Creating it..."
        kubectl create namespace monitoring
    fi

    echo -e "${GREEN}Cleanup completed.${NC}"
}

# Function to install Prometheus and Grafana using Helm
install_prometheus_grafana() {
    echo -e "${YELLOW}Installing Prometheus and Grafana...${NC}"

    # Add prometheus-community helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    # Install new
    echo "Installing Prometheus for the first time..."
    helm install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set prometheus.service.type=ClusterIP \
        --set grafana.service.type=ClusterIP \
        --set grafana.adminPassword=edurange \
        --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
        --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false

    echo -e "${GREEN}Prometheus and Grafana installed successfully!${NC}"
}

# Function to create a ServiceMonitor for the instance-manager
create_instance_manager_service_monitor() {
    echo -e "${YELLOW}Creating ServiceMonitor for instance-manager...${NC}"

    # First, ensure the instance-manager service exists
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: instance-manager-metrics
  namespace: default
  labels:
    app: instance-manager
    release: prometheus
spec:
  selector:
    app: instance-manager
  ports:
  - name: metrics
    port: 9100
    targetPort: 9100
  type: ClusterIP
EOF

    # Create ServiceMonitor
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: instance-manager
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: instance-manager
  namespaceSelector:
    matchNames:
      - default
  endpoints:
  - port: metrics
    interval: 15s
EOF

    echo -e "${GREEN}ServiceMonitor for instance-manager created successfully!${NC}"
}

# Function to build and deploy the monitoring service
build_deploy_monitoring_service() {
    echo -e "${YELLOW}Building and deploying monitoring service...${NC}"

    # Build the Docker image
    docker buildx build -f Dockerfile --platform linux/amd64 -t registry.rydersel.cloud/monitoring-service . --push


    # Apply the Kubernetes manifests
    echo "Applying Kubernetes manifests..."
    kubectl apply -f deployment.yaml

    echo -e "${GREEN}Monitoring service deployed successfully!${NC}"
}

# Main function
main() {
    echo -e "${YELLOW}Starting installation...${NC}"

    # Clean up existing monitoring deployments
  #  cleanup_existing_monitoring

    # Install Prometheus and Grafana
  #  install_prometheus_grafana

    # Wait for Prometheus CRDs to be ready
   #  echo -e "${YELLOW}Waiting for Prometheus CRDs to be ready...${NC}"
   #  sleep 20

    # Create ServiceMonitor for instance-manager
    create_instance_manager_service_monitor

    # Build and deploy the monitoring service
    build_deploy_monitoring_service

    echo -e "${GREEN}Installation completed successfully!${NC}"
    echo -e "${YELLOW}To access Grafana, run: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80${NC}"
    echo -e "${YELLOW}Then open http://localhost:3000 in your browser${NC}"
    echo -e "${YELLOW}Username: admin, Password: edurange${NC}"
    echo -e "${YELLOW}To access Prometheus, run: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090${NC}"
    echo -e "${YELLOW}Then open http://localhost:9090 in your browser${NC}"
}

# Run the main function
main
