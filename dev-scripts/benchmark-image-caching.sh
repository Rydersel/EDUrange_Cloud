#!/bin/bash
#
# benchmark-image-caching.sh
# Script to benchmark the performance improvement from image caching
#

set -e
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Image Caching Performance Benchmark        ${NC}"
echo -e "${BLUE}=============================================${NC}"

# Test image to use for benchmarking
TEST_IMAGE="registry.edurange.cloud/edurange/webos:latest"
TEST_NAMESPACE="default"
# Number of concurrent pulls to simulate
CONCURRENT_PULLS=3  # Reduced to 3 users for faster testing

# Function to time image pull - returns only the duration number
pull_image() {
    local pod_name="$1"
    local use_proxy="$2"
    local start_time
    local end_time
    local duration

    echo -e "\n${YELLOW}Starting test for $pod_name...${NC}"
    
    if [ "$use_proxy" == "true" ]; then
        echo -e "Testing $CONCURRENT_PULLS concurrent pulls WITH registry mirror..."
    else
        echo -e "Testing $CONCURRENT_PULLS concurrent pulls WITHOUT registry mirror (direct)..."
    fi

    # Clean up any previous pods with the same prefix
    echo -e "Cleaning up any previous test pods..."
    kubectl delete pods --selector="test-type=$pod_name" --ignore-not-found --namespace=$TEST_NAMESPACE > /dev/null 2>&1

    # Create multiple pod specs in parallel
    for i in $(seq 1 $CONCURRENT_PULLS); do
        if [ "$use_proxy" == "true" ]; then
            # Create pod spec that uses the mirror
            cat <<EOF > ${pod_name}-${i}.yaml
apiVersion: v1
kind: Pod
metadata:
  name: ${pod_name}-${i}
  labels:
    test-type: $pod_name
spec:
  containers:
  - name: test-container
    image: $TEST_IMAGE
    imagePullPolicy: Always
    command: ["sleep", "60"]
  restartPolicy: Never
EOF
        else
            # Create pod spec without using mirror
            cat <<EOF > ${pod_name}-${i}.yaml
apiVersion: v1
kind: Pod
metadata:
  name: ${pod_name}-${i}
  labels:
    test-type: $pod_name
  annotations:
    registry-mirror.kubernetes.io/disable: "true"
spec:
  containers:
  - name: test-container
    image: $TEST_IMAGE
    imagePullPolicy: Always
    command: ["sleep", "60"]
  restartPolicy: Never
EOF
        fi
    done

    # Start timing
    start_time=$(date +%s.%N)

    # Create all pods in parallel
    echo -e "Creating $CONCURRENT_PULLS pods simultaneously..."
    for i in $(seq 1 $CONCURRENT_PULLS); do
        kubectl apply -f ${pod_name}-${i}.yaml --namespace=$TEST_NAMESPACE > /dev/null &
    done

    # Wait for all background apply commands to finish
    wait

    # Wait for all pods to be ready
    echo -e "Waiting for all pods to be ready..."
    for i in $(seq 1 $CONCURRENT_PULLS); do
        kubectl wait --for=condition=Ready pod/${pod_name}-${i} --timeout=300s --namespace=$TEST_NAMESPACE > /dev/null &
    done

    # Wait for all background wait commands to finish
    wait

    # End timing
    end_time=$(date +%s.%N)

    # Calculate duration
    duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    echo -e "Time taken: $duration seconds\n"
    
    # Clean up
    for i in $(seq 1 $CONCURRENT_PULLS); do
        rm ${pod_name}-${i}.yaml
    done
    
    # Return only the duration as a number
    echo $duration
}

# Now do the benchmark
echo -e "\n${BLUE}Starting benchmark...${NC}"
echo -e "${YELLOW}Test image: $TEST_IMAGE${NC}"

# Run test without mirror - store the output in a variable
echo -e "\n${YELLOW}Running test WITHOUT registry mirror...${NC}"
direct_time=$(pull_image "pull-test-direct" "false" | tail -n 1)
echo -e "${GREEN}Direct pull time: ${direct_time} seconds${NC}"

# Run test with mirror - store the output in a variable
echo -e "\n${YELLOW}Running test WITH registry mirror...${NC}"
mirror_time=$(pull_image "pull-test-mirror" "true" | tail -n 1)
echo -e "${GREEN}Mirror pull time: ${mirror_time} seconds${NC}"

# Calculate improvement safely
echo -e "\n${BLUE}Performance Summary for $CONCURRENT_PULLS concurrent pulls:${NC}"
echo -e "Direct pull time: ${YELLOW}${direct_time} seconds${NC}"
echo -e "Mirror pull time: ${YELLOW}${mirror_time} seconds${NC}"

# Safely calculate percentage improvement with better error handling
if [[ "$direct_time" =~ ^[0-9.]+$ ]] && [[ "$mirror_time" =~ ^[0-9.]+$ ]] && (( $(echo "$direct_time > 0" | bc -l 2>/dev/null || echo "0") )); then
    improvement=$(echo "$direct_time - $mirror_time" | bc -l 2>/dev/null)
    percent_improvement=$(echo "scale=2; ($improvement / $direct_time) * 100" | bc -l 2>/dev/null || echo "0")
    
    if (( $(echo "$improvement > 0" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "Improvement: ${GREEN}${percent_improvement}%${NC} faster with registry mirror"
        echo -e "Time saved: ${GREEN}${improvement} seconds${NC} per deployment"
        
        # Calculate for 30 users
        total_saved=$(echo "scale=2; $improvement * 30 / $CONCURRENT_PULLS" | bc -l 2>/dev/null)
        echo -e "\n${BLUE}Projected savings for 30 concurrent users:${NC}"
        echo -e "Estimated time saved: ${GREEN}${total_saved} seconds${NC}"
    else
        echo -e "Improvement: ${RED}No improvement detected${NC}"
        echo -e "${YELLOW}Note: If this is the first pull, the mirror may be caching the image.${NC}"
        echo -e "${YELLOW}      Try running the benchmark again for better results.${NC}"
    fi
else
    echo -e "${RED}Could not calculate improvement - verify numeric values: '$direct_time' and '$mirror_time'${NC}"
fi

# Clean up
echo -e "\n${YELLOW}Cleaning up test pods...${NC}"
kubectl delete pods --selector="test-type=pull-test-direct" --ignore-not-found --namespace=$TEST_NAMESPACE > /dev/null 2>&1
kubectl delete pods --selector="test-type=pull-test-mirror" --ignore-not-found --namespace=$TEST_NAMESPACE > /dev/null 2>&1

echo -e "\n${GREEN}Benchmark complete!${NC}"
echo -e "${YELLOW}Note: This benchmark simulates $CONCURRENT_PULLS users starting challenges simultaneously.${NC}"
echo -e "${YELLOW}      For best results, run this benchmark multiple times.${NC}"
echo -e "${YELLOW}      The first run caches images in the registry mirror.${NC}"
echo -e "${YELLOW}      Subsequent runs will show the real performance benefit when multiple users${NC}"
echo -e "${YELLOW}      access the platform concurrently, as will be the case with 30 students.${NC}"
