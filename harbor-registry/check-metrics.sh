#!/bin/bash
# Script to check Harbor metrics configuration

set -e

echo "===== Harbor Registry Metrics Verification ====="

# Check ServiceMonitors in monitoring namespace
echo "Checking ServiceMonitors in monitoring namespace..."
kubectl get servicemonitor -n monitoring | grep harbor

# Check service labels to ensure they match ServiceMonitor selectors
echo -e "\nChecking Service Labels in harbor namespace..."
kubectl get services -n harbor --show-labels

# Verify Harbor Core service has the right labels
echo -e "\nVerifying Harbor Core service has required labels..."
kubectl get service -n harbor -l "app=harbor,component=core" -o wide

# Verify Harbor Registry service has the right labels
echo -e "\nVerifying Harbor Registry service has required labels..."
kubectl get service -n harbor -l "app=harbor,component=registry" -o wide

# Verify Harbor JobService service has the right labels
echo -e "\nVerifying Harbor JobService service has required labels..."
kubectl get service -n harbor -l "app=harbor,component=jobservice" -o wide

# Check if metrics endpoints are accessible
echo -e "\nTesting metrics endpoints (may need port-forwarding)..."

# Try port-forwarding to Harbor Core for metrics
echo "Port-forwarding to Harbor Core for metrics check..."
echo "Press Ctrl+C after checking in another terminal with: curl http://localhost:8001/metrics"
kubectl port-forward -n harbor svc/harbor-core 8001:8001 &
PF_PID=$!
sleep 5  # Give it time to establish

# Kill port-forward after 10 seconds
(sleep 10 && kill $PF_PID 2>/dev/null) &

# Check if Prometheus is finding the targets
echo -e "\nChecking Prometheus targets (requires port-forward)..."
echo "Starting port-forward to Prometheus (use Ctrl+C to stop after checking)..."
echo "After port-forward starts, open http://localhost:9090/targets in your browser"
echo "Look for 'harbor' in the targets list"

kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090

# This will run once port-forward is terminated
echo -e "\nNow let's query some basic Harbor metrics to verify data flow..."

# Create temp file for query results
TMPFILE=$(mktemp)

# Function to query Prometheus
query_prometheus() {
  local query=$1
  local description=$2
  
  echo -e "\n$description:"
  curl -s "http://localhost:9090/api/v1/query?query=$query" > $TMPFILE
  
  # Check if query returned data
  if grep -q "\"result\":\\[\\]" $TMPFILE; then
    echo "❌ No data found for query: $query"
  else
    echo "✅ Data found! Sample values:"
    cat $TMPFILE | grep -o '"value":\[[^]]*\]' | head -3
  fi
}

# Try some sample queries
query_prometheus "sum(harbor_core_http_request_total)" "Total Harbor Core HTTP requests"
query_prometheus "sum(rate(harbor_core_http_request_duration_seconds_sum[5m])) / sum(rate(harbor_core_http_request_duration_seconds_count[5m]))" "Average API response time"
query_prometheus "sum(rate(harbor_core_http_request_total[5m])) by (code)" "Request rate by status code"

# Clean up
rm $TMPFILE

echo -e "\n===== Verification Complete ====="
echo "If queries returned data, your metrics pipeline is working!"
echo "If not, check that:"
echo "1. ServiceMonitors in the monitoring namespace have the correct labels (release: prometheus-kube-prometheus)"
echo "2. Service labels in harbor namespace match the ServiceMonitor selectors (app: harbor, component: core/registry/jobservice)"
echo "3. The metrics endpoints are enabled and accessible on all Harbor services" 