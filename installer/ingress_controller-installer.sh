#!/bin/bash

# Function to check if a command exists
function command_exists() {
  command -v "$1" &> /dev/null
}

# Step 1: Check for kubectl
if ! command_exists kubectl; then
  echo "kubectl not found. Please install kubectl and try again."
  exit 1
fi

# Step 2: Guide the user through connecting kubectl to their Linode cluster
echo "Kubectl Found. Verifiying connection to cluster."

# Check if kubectl is connected to a cluster
function verify_kubectl_connection() {
  kubectl cluster-info > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    return 1
  fi
  return 0
}

# Guide the user to connect kubectl to Linode Kubernetes cluster
while ! verify_kubectl_connection; do
  echo "It appears that kubectl is not connected to a cluster."
  echo "To connect kubectl to your Linode Kubernetes cluster, you will need to use the Linode CLI or Linode Cloud dashboard."
  echo "If you have the Linode CLI installed, you can run the following command:"
  echo "  linode-cli lke kubeconfig-view [CLUSTER_ID] --use-kubeconfig"

  echo ""
  echo "After you've configured kubectl, press [Enter] to retry the connection check."
  read
done

# Confirm that kubectl is connected
echo "kubectl is successfully connected to your Linode Kubernetes cluster!"

# Step 3: Check for helm
if ! command_exists helm; then
  echo "Helm not found. Please install Helm to proceed."
  echo "You can install Helm using Homebrew: brew install helm"
  exit 1
fi

# Step 4: Install NGINX Ingress Controller using kubectl in the ingress-nginx namespace
echo "Installing NGINX Ingress Controller in the ingress-nginx namespace for your Kubernetes cluster..."

# Create the ingress-nginx namespace
kubectl create namespace ingress-nginx

# Apply the NGINX Ingress Controller manifests to the ingress-nginx namespace
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml --namespace ingress-nginx

# Step 5: Wait for the ingress controller pods to be ready
echo "Waiting for NGINX Ingress Controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Step 6: Verify the installation
echo "Verifying NGINX Ingress Controller installation..."
kubectl get pods --namespace ingress-nginx

# Step 7: Get the external IP of the ingress controller (may take time to assign)
EXTERNAL_IP=""
while [ -z "$EXTERNAL_IP" ]; do
  echo "Waiting for external IP of the ingress controller..."
  EXTERNAL_IP=$(kubectl get svc --namespace ingress-nginx ingress-nginx-controller --template="{{range .status.loadBalancer.ingress}}{{.ip}}{{end}}")
  [ -z "$EXTERNAL_IP" ] && sleep 10
done

# Step 8: Configure client_max_body_size
echo "Configuring client_max_body_size in NGINX Ingress Controller..."
kubectl patch configmap -n ingress-nginx ingress-nginx-controller --patch '{"data": {"proxy-body-size": "0"}}'
kubectl rollout restart deployment -n ingress-nginx ingress-nginx-controller

echo "NGINX Ingress Controller installed successfully!"
echo "External IP: $EXTERNAL_IP"

echo "Installing Cert Manager"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.2/cert-manager.yaml

# Step 9: Wait for Cert Manager to be ready
echo "Waiting for Cert Manager components to be ready..."
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s

# Step 10: Verify Cert Manager installation
echo "Verifying Cert Manager installation..."
kubectl get pods --namespace cert-manager
