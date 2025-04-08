#!/bin/bash

# Build and push the Docker image for the SQL injection challenge

echo "Building and pushing sql-injection-basic Docker image..."
docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/sql-injection-basic . --push

if [ $? -eq 0 ]; then
    echo "Build and push successful!"
    echo "Challenge image: registry.rydersel.cloud/sql-injection-basic"
    echo ""
    echo "This image will be used by the sql-injection challenge type in the EDURange platform."
else
    echo "Build or push failed. Please check the error messages above."
fi 