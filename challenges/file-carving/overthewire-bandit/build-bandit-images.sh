#!/bin/bash

# Script to build and push all Bandit challenge images
# Usage: ./build-bandit-images.sh [registry_url]

# Set default registry URL if not provided
REGISTRY_URL=${1:-"registry.rydersel.cloud"}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Building and pushing all Bandit challenge images to ${REGISTRY_URL}${NC}"
echo "=================================================="

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Array of all bandit challenge directories
BANDIT_DIRS=(
    "bandit-1"
    "bandit-2"
    "bandit-3"
    "bandit-4"
    "bandit-5"
    "bandit-6"
)

# Initialize counters
TOTAL=${#BANDIT_DIRS[@]}
SUCCESS=0
FAILED=0

# Process each directory
for dir in "${BANDIT_DIRS[@]}"; do
    # Extract the number from the directory name
    number=$(echo "$dir" | sed 's/bandit-//')

    # Image name is bandit followed by the number (no dash)
    image_name="bandit${number}"

    echo "=================================================="
    echo -e "${YELLOW}Processing ${dir} (${image_name})${NC}"

    # Navigate to the challenge directory
    cd "${SCRIPT_DIR}/${dir}" || {
        echo -e "${RED}Error: Directory ${dir} not found${NC}"
        ((FAILED++))
        continue
    }

    # Build and push the image (without multi-platform)
    echo -e "${YELLOW}Building ${image_name}...${NC}"

    # First build the image
    docker buildx build --platform linux/amd64 -t "${REGISTRY_URL}/${image_name}" .

    # Check if the build was successful
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully built ${image_name}${NC}"

        # Then push the image
        echo -e "${YELLOW}Pushing ${image_name} to registry...${NC}"
        docker push "${REGISTRY_URL}/${image_name}"

        # Check if the push was successful
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Successfully pushed ${image_name}${NC}"
            ((SUCCESS++))
        else
            echo -e "${RED}Failed to push ${image_name}${NC}"
            ((FAILED++))
        fi
    else
        echo -e "${RED}Failed to build ${image_name}${NC}"
        ((FAILED++))
    fi

    # Return to the script directory
    cd "${SCRIPT_DIR}"

    echo ""
done

# Print summary
echo "=================================================="
echo -e "${YELLOW}Build Summary:${NC}"
echo -e "${GREEN}Successfully built and pushed: ${SUCCESS}/${TOTAL}${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: ${FAILED}/${TOTAL}${NC}"
fi

# Exit with error code if any builds failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
