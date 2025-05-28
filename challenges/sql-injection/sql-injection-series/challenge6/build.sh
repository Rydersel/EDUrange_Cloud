#!/bin/bash

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Navigate to the script directory
cd "$DIR"

echo "Building SQL Injection Challenge 4 Docker image..."
docker buildx build --platform linux/amd64 -t registry.edurange.cloud/challenges/sql-injection-challenge6 . --push

if [ $? -eq 0 ]; then
    echo "Build and push successful!"
    echo "Challenge image: registry.edurange.cloud/challenges/sql-injection-challenge6"
    echo ""
    echo "This image will be used by the SQL Injection Challenge 5 in the EDURange platform."

else
    echo "Build or push failed. Please check the error messages above."
fi
