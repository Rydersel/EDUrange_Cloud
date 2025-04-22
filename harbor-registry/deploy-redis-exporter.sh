#!/bin/bash

# Script to deploy the Redis exporter for Harbor

set -e

echo "Deploying Harbor Redis Exporter..."

# Apply the Redis exporter deployment and service
kubectl apply -f harbor-redis-exporter.yaml

echo "Applying updated ServiceMonitor configuration..."
kubectl apply -f harbor-service-monitors.yaml

echo "Waiting for Redis exporter deployment to be ready..."
kubectl rollout status deployment/harbor-redis-exporter -n harbor --timeout=60s

echo "Checking if Redis exporter pod is running..."
kubectl get pods -n harbor -l app=harbor,component=redis-exporter

echo "Checking if Redis exporter service is available..."
kubectl get service harbor-redis-exporter-metrics -n harbor

echo "Redis exporter has been deployed successfully. It will start reporting Redis metrics to Prometheus."
echo "Please check the Grafana dashboard in a few minutes to see Redis metrics."
echo ""
echo "To verify the Redis exporter is working correctly, run:"
echo "kubectl port-forward service/harbor-redis-exporter-metrics 9121:9121 -n harbor"
echo "Then open http://localhost:9121/metrics in your browser." 