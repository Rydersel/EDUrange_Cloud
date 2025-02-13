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

# Delete existing deployment, services and ingress
execute_and_continue kubectl delete deployment database-controller
execute_and_continue kubectl delete svc sync-api-service
execute_and_continue kubectl delete ingress database-api-ingress


# Build and push new Docker images
execute_and_exit_on_failure docker buildx build --platform linux/amd64 -f dockerfile.api -t registry.rydersel.cloud/database-api . --push
execute_and_exit_on_failure docker buildx build --platform linux/amd64 -f dockerfile.sync -t registry.rydersel.cloud/database-sync . --push

# Apply the new deployment
execute_and_exit_on_failure kubectl apply -f database-controller-deployment.yaml

echo "Success! Database controller deployed to cluster"
