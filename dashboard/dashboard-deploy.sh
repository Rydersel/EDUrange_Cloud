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
export REGISTRY_URL="registry.edurange.cloud/edurange"
export DOMAIN_NAME="rydersel.cloud"
export INSTANCE_MANAGER_SUBDOMAIN="eductf"
export DASHBOARD_SUBDOMAIN="dashboard"
export DATABASE_SUBDOMAIN="database"

# Print environment variables for debugging
echo "Using the following environment variables:"
echo "REGISTRY_URL: $REGISTRY_URL"
echo "DOMAIN_NAME: $DOMAIN_NAME"
echo "INSTANCE_MANAGER_SUBDOMAIN: $INSTANCE_MANAGER_SUBDOMAIN"
echo "DASHBOARD_SUBDOMAIN: $DASHBOARD_SUBDOMAIN"
echo "DATABASE_SUBDOMAIN: $DATABASE_SUBDOMAIN"

# Calculate the full URLs for debugging
INSTANCE_MANAGER_FULL_URL="https://${INSTANCE_MANAGER_SUBDOMAIN}.${DOMAIN_NAME}/instance-manager/api"
DATABASE_FULL_URL="https://${DATABASE_SUBDOMAIN}.${DOMAIN_NAME}"
echo "Full INSTANCE_MANAGER_URL: $INSTANCE_MANAGER_FULL_URL"
echo "Full DATABASE_API_URL: $DATABASE_FULL_URL"

execute_and_continue kubectl delete deployment dashboard

execute_and_continue kubectl delete svc dashboard

execute_and_exit_on_failure docker buildx build --platform linux/amd64 -t ${REGISTRY_URL}/dashboard . --push

execute_and_exit_on_failure kubectl apply -f k8s/secrets.yaml

# Create a temporary file with substituted variables
echo "Creating deployment file with substituted variables..."
envsubst < k8s/deployment.yaml > /tmp/dashboard-deployment.yaml

# Check if substitution worked correctly
echo "Checking substituted deployment file..."
grep "INSTANCE_MANAGER_URL" /tmp/dashboard-deployment.yaml

# Apply the deployment
echo "Applying deployment..."
kubectl apply -f /tmp/dashboard-deployment.yaml

echo "Success! dashboard deployed to cluster"
