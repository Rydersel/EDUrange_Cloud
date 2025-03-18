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
export DOMAIN_NAME="rydersel.cloud"
export INSTANCE_MANAGER_SUBDOMAIN="eductf"
export DASHBOARD_SUBDOMAIN="dashboard"
export DATABASE_SUBDOMAIN="database"

# Create the terminal-account service account if it doesn't exist
execute_and_continue kubectl create serviceaccount terminal-account -n default

# Create the secret for the service account token
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: terminal-account-token
  annotations:
    kubernetes.io/service-account.name: terminal-account
type: kubernetes.io/service-account-token
EOF

# Wait for the token to be created
sleep 5

# Get the cluster host
KUBERNETES_HOST=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' | sed 's|https://||')

# Get the service account token
KUBERNETES_SERVICE_ACCOUNT_TOKEN=$(kubectl get secret terminal-account-token -o jsonpath='{.data.token}' | base64 -d)

# Store these in a ConfigMap
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: terminal-credentials
data:
  KUBERNETES_HOST: "${KUBERNETES_HOST}"
  KUBERNETES_SERVICE_ACCOUNT_TOKEN: "${KUBERNETES_SERVICE_ACCOUNT_TOKEN}"
EOF

# Create a ConfigMap for WebOS environment variables
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: webos-environment
data:
  DOMAIN_NAME: "${DOMAIN_NAME}"
  INSTANCE_MANAGER_SUBDOMAIN: "${INSTANCE_MANAGER_SUBDOMAIN}"
  DATABASE_SUBDOMAIN: "${DATABASE_SUBDOMAIN}"
  REGISTRY_URL: "${REGISTRY_URL}"
EOF

execute_and_continue kubectl delete deployment instance-manager

execute_and_continue kubectl delete svc instance-manager

execute_and_exit_on_failure docker buildx build --platform linux/amd64 -t ${REGISTRY_URL}/instance-manager . --push

# Use envsubst to replace environment variables in the deployment file
envsubst < instance-manager-deployment.yaml | kubectl apply -f -

execute_and_exit_on_failure kubectl apply -f instance-manager-clusterrole.yaml

execute_and_exit_on_failure kubectl apply -f instance-manager-clusterrolebinding.yaml

echo "Success! Instance manager deployed to cluster"
