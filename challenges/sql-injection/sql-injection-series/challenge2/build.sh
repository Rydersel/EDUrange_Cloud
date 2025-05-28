#!/bin/bash

# Build and push the Docker image for the SQL injection challenge

echo "Building and pushing sql-injection-challenge2 Docker image..."
docker buildx build --platform linux/amd64 -t registry.edurange.cloud/challenges/sql-injection-challenge2 . --push

if [ $? -eq 0 ]; then
    echo "Build and push successful!"
    echo "Challenge image: registry.edurange.cloud/challenges/sql-injection-challenge2"
    echo ""
    echo "This image will be used by the sql-injection challenge2 in the EDURange platform."
else
    echo "Build or push failed. Please check the error messages above."
fi
 