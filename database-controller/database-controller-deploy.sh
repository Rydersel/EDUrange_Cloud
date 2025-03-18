#!/bin/bash

function execute_and_continue {
    "$@"
    if [ $? -ne 0 ]; then
        echo "Command failed: $@"
    else
        echo "Command succeeded: $@"
    fi
}

function execute_and_exit_on_failure {
    "$@"
    if [ $? -ne 0 ]; then
        echo "Failed to Build Image, Exiting."
        exit 1
    else
        echo "Building Image Successful :)"
    fi
}

# Set environment variables for deployment
export REGISTRY_URL="registry.rydersel.cloud"
export DOMAIN_NAME="edurange.cloud"
export INSTANCE_MANAGER_SUBDOMAIN="eductf"
export DASHBOARD_SUBDOMAIN="dashboard"
export DATABASE_SUBDOMAIN="database"

# Create database secrets
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: database-secrets
type: Opaque
data:
  postgres-host: $(echo -n "172.233.210.28" | base64)
  postgres-name: $(echo -n "postgres" | base64)
  postgres-user: $(echo -n "admin" | base64)
  postgres-password: $(echo -n "rydersel1927" | base64)
  database-url: $(echo -n "postgresql://admin:rydersel1927@172.233.210.28:5432/postgres?schema=public" | base64)
EOF

# Delete existing deployment, services and ingress
echo "Cleaning up existing resources..."
execute_and_continue kubectl delete deployment database-controller
execute_and_continue kubectl delete svc database-api-service

# Note: We no longer create an ingress for the database controller
# The database API is now only accessible from within the cluster using the ClusterIP service

# Clean up local Docker images to ensure fresh builds
echo "Cleaning up local Docker images..."
execute_and_continue docker rmi ${REGISTRY_URL}/database-api:latest || true
execute_and_continue docker rmi ${REGISTRY_URL}/database-sync:latest || true

# Build and push new Docker images with proper tags - always using --no-cache
echo "Building and pushing database-api image with no cache..."
execute_and_exit_on_failure docker buildx build --platform linux/amd64 -f dockerfile.api -t ${REGISTRY_URL}/database-api:latest --no-cache . --push

echo "Building and pushing database-sync image with no cache..."
execute_and_exit_on_failure docker buildx build --platform linux/amd64 -f dockerfile.sync -t ${REGISTRY_URL}/database-sync:latest --no-cache . --push

# Verify images are available in the registry
echo "Verifying images in registry..."
docker pull ${REGISTRY_URL}/database-api:latest
docker pull ${REGISTRY_URL}/database-sync:latest

# Create an imagePullPolicy: Always patch to force Kubernetes to pull the latest images
echo "Creating patch to force image pull..."
cat <<EOF > imagepull-patch.yaml
spec:
  template:
    spec:
      containers:
      - name: database-api
        imagePullPolicy: Always
      - name: database-sync
        imagePullPolicy: Always
EOF

# Apply the new deployment
echo "Applying deployment configuration..."
envsubst < database-controller-deployment.yaml | kubectl apply -f -

# Apply the imagePullPolicy patch
echo "Applying imagePullPolicy patch..."
kubectl patch deployment database-controller --patch "$(cat imagepull-patch.yaml)"

# Verify deployment status
echo "Checking deployment status..."
kubectl rollout status deployment/database-controller --timeout=120s

# Clean up patch file
rm -f imagepull-patch.yaml

echo "Success! Database controller deployed to cluster"
