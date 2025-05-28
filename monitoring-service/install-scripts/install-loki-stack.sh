#!/bin/bash

set -e

# Color codes for better readability
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== Loki Stack Installation Script ==========${NC}"
echo -e "${YELLOW}This script will remove any existing Loki/Promtail installation${NC}"
echo -e "${YELLOW}and install a fresh Loki stack with proper configurations.${NC}"
echo

# Ensure namespace exists
echo -e "${BLUE}Creating monitoring namespace if it doesn't exist...${NC}"
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Uninstall existing Loki and Promtail
echo -e "${BLUE}Checking for existing Loki installations...${NC}"

if helm list -n monitoring | grep -q loki; then
  echo -e "${YELLOW}Existing Loki found. Uninstalling...${NC}"
  helm uninstall loki -n monitoring
  sleep 5
else
  echo -e "${GREEN}No existing Loki helm release found.${NC}"
fi

if helm list -n monitoring | grep -q promtail; then
  echo -e "${YELLOW}Existing Promtail found. Uninstalling...${NC}"
  helm uninstall promtail -n monitoring
  sleep 5
else
  echo -e "${GREEN}No existing Promtail helm release found.${NC}"
fi

if helm list -n monitoring | grep -q loki-stack; then
  echo -e "${YELLOW}Existing Loki Stack found. Uninstalling...${NC}"
  helm uninstall loki-stack -n monitoring
  sleep 5
else
  echo -e "${GREEN}No existing Loki Stack helm release found.${NC}"
fi

# Clean up lingering resources
echo -e "${BLUE}Cleaning up any lingering Loki/Promtail resources...${NC}"
for resourceType in deployment statefulset service configmap secret pvc pv; do
  kubectl delete $resourceType -l app=loki -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app=promtail -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app.kubernetes.io/name=loki -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app.kubernetes.io/name=promtail -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app.kubernetes.io/instance=loki -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app.kubernetes.io/instance=promtail -n monitoring --ignore-not-found=true
  kubectl delete $resourceType -l app.kubernetes.io/instance=loki-stack -n monitoring --ignore-not-found=true
done

# Also delete pods directly, just in case
kubectl delete pods -l app=loki -n monitoring --force --grace-period=0 --ignore-not-found=true
kubectl delete pods -l app=promtail -n monitoring --force --grace-period=0 --ignore-not-found=true

echo -e "${GREEN}Cleanup completed.${NC}"

# Create values file for Loki Stack
echo -e "${BLUE}Creating Loki Stack values file...${NC}"
cat <<EOF > loki-stack-values.yaml
loki:
  persistence:
    enabled: true
    storageClassName: linode-block-storage
    size: 10Gi
  serviceMonitor:
    enabled: true
  config:
    auth_enabled: false
    ingester:
      chunk_idle_period: 3m
      chunk_block_size: 262144
      chunk_retain_period: 1m
      max_transfer_retries: 0
      lifecycler:
        ring:
          kvstore:
            store: inmemory
          replication_factor: 1
    limits_config:
      enforce_metric_name: false
      reject_old_samples: true
      reject_old_samples_max_age: 168h
    schema_config:
      configs:
        - from: 2020-10-24
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h
    server:
      http_listen_port: 3100
    storage_config:
      boltdb_shipper:
        active_index_directory: /data/loki/boltdb-shipper-active
        cache_location: /data/loki/boltdb-shipper-cache
        cache_ttl: 24h
        shared_store: filesystem
      filesystem:
        directory: /data/loki/chunks
    chunk_store_config:
      max_look_back_period: 0s
    table_manager:
      retention_deletes_enabled: true
      retention_period: 24h

promtail:
  serviceMonitor:
    enabled: true
  config:
    logLevel: info
    serverPort: 3101
    clients:
      - url: http://loki:3100/loki/api/v1/push
    snippets:
      pipelineStages:
        - docker: {}
        - cri: {}
    positions:
      filename: /run/promtail/positions.yaml
    scrapeConfigs:
      - job_name: kubernetes
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_node_name]
            target_label: node_name
          - source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container_name
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod_name
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - action: replace
            replacement: $1
            separator: /
            source_labels:
              - __meta_kubernetes_namespace
              - __meta_kubernetes_pod_name
            target_label: job
          - action: replace
            source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - action: replace
            source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - action: replace
            source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container
          - replacement: /var/log/pods/*\$1/*.log
            separator: /
            source_labels:
              - __meta_kubernetes_pod_uid
              - __meta_kubernetes_pod_container_name
            target_label: __path__
          - action: replace
            source_labels: [__meta_kubernetes_pod_node_name]
            target_label: node
EOF

# Add Grafana Helm repo and update
echo -e "${BLUE}Adding/updating Grafana Helm repository...${NC}"
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki Stack
echo -e "${BLUE}Installing Loki Stack...${NC}"
helm install loki-stack grafana/loki-stack \
  --namespace monitoring \
  --values loki-stack-values.yaml \
  --set promtail.enabled=true \
  --timeout 10m

# Wait for Loki to be ready
echo -e "${BLUE}Waiting for Loki to be ready...${NC}"
kubectl rollout status statefulset/loki -n monitoring --timeout=300s || true

# Wait for Promtail to be ready
echo -e "${BLUE}Waiting for Promtail to be ready...${NC}"
kubectl rollout status daemonset/loki-stack-promtail -n monitoring --timeout=300s || true

# Update Grafana datasource
echo -e "${BLUE}Creating Grafana Loki datasource configuration...${NC}"
cat <<EOF > grafana-loki-datasource.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-loki-datasource
  namespace: monitoring
  labels:
    grafana_datasource: "1"
data:
  loki-datasource.yaml: |-
    apiVersion: 1
    datasources:
    - name: Loki
      type: loki
      url: http://loki-stack:3100
      access: proxy
      isDefault: false
      editable: true
EOF

kubectl apply -f grafana-loki-datasource.yaml

# Get Loki service endpoint
LOKI_ENDPOINT=$(kubectl get svc -n monitoring loki-stack -o jsonpath='{.metadata.name}.{.metadata.namespace}:3100')

# Output success message
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Loki Stack installation complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${BLUE}Loki Service:${NC} $LOKI_ENDPOINT"
echo -e "${BLUE}Grafana Datasource:${NC} Name: Loki, URL: http://loki-stack:3100"
echo
echo -e "${YELLOW}You may need to restart your Grafana pods to detect the new datasource${NC}"
echo -e "${YELLOW}kubectl rollout restart deployment/grafana -n monitoring${NC}"
echo -e "${GREEN}=====================================${NC}"

echo
echo -e "${GREEN}Done!${NC}" 