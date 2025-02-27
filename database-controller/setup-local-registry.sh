#!/bin/bash

# Check if Docker registry container is already running
if docker ps | grep -q "registry"; then
  echo "Docker registry is already running"
else
  echo "Starting Docker registry container..."
  docker run -d -p 5000:5000 --restart=always --name registry registry:2
  echo "Docker registry started on localhost:5000"
fi

# Modify the deployment script to use the local registry
cat > database-controller-deploy-local.sh << 'EOF'
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
execute_and_continue kubectl delete svc database-api-service
execute_and_continue kubectl delete ingress database-api-ingress

# Build and push to local registry
execute_and_exit_on_failure docker build -f dockerfile.api -t localhost:5000/database-api .
execute_and_exit_on_failure docker push localhost:5000/database-api

execute_and_exit_on_failure docker build -f dockerfile.sync -t localhost:5000/database-sync .
execute_and_exit_on_failure docker push localhost:5000/database-sync

# Apply the deployment using the local registry configuration
execute_and_exit_on_failure kubectl apply -f database-controller-deployment-local.yaml

echo "Success! Database controller deployed to cluster using local registry"
EOF

chmod +x database-controller-deploy-local.sh

echo "Setup complete. You can now run ./database-controller-deploy-local.sh to deploy using the local registry." 