#!/bin/bash

# Setup script for Docker image caching

set -e

echo "Setting up image caching for EDURange Cloud..."

# Deploy the registry mirror
echo "Deploying registry mirror..."
kubectl apply -f k8s/registry-mirror.yaml

# Deploy image puller DaemonSet
echo "Deploying image puller DaemonSet..."
kubectl apply -f k8s/image-puller.yaml

# Setup Docker daemon config (requires SSH access to nodes or manual configuration)
echo "Configuring Docker daemon to use registry mirror..."

# List of challenge images to pre-pull
IMAGES=(
  "registry.edurange.cloud/edurange/webos"
  "registry.edurange.cloud/edurange/terminal"
  # Add other common images here
)

# Display instructions for manual configuration
echo "============================================================"
echo "To complete the setup on each Kubernetes node, run:"
echo
echo "1. Copy the docker daemon configuration:"
echo "   kubectl get configmap docker-daemon-config -n kube-system -o jsonpath='{.data.daemon\.json}' > /etc/docker/daemon.json"
echo
echo "2. Restart the Docker daemon:"
echo "   sudo systemctl restart docker"
echo
echo "3. Pre-pull the most common images:"
for img in "${IMAGES[@]}"; do
  echo "   docker pull $img"
done
echo "============================================================"

# Wait for the registry mirror to be ready
echo "Waiting for registry mirror to be ready..."
kubectl rollout status deployment/registry-mirror --timeout=300s

echo "Image caching setup complete! The registry mirror will now cache Docker images."
echo "The image puller DaemonSet will ensure common images are available on all nodes."
echo "Challenge startup times will significantly improve after the first few launches." 