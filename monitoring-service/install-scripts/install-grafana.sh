#!/bin/bash

set -e

# Color codes for better readability
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Your domain - CHANGE THIS
DOMAIN="edurange.cloud"

# Generate a strong random password
ADMIN_PASSWORD=$(openssl rand -base64 15)

echo -e "${BLUE}========== Grafana Installation Script ==========${NC}"
echo -e "${YELLOW}This script will remove any existing Grafana installation${NC}"
echo -e "${YELLOW}and install a fresh instance with proper configurations.${NC}"
echo

# Ensure namespace exists
echo -e "${BLUE}Creating monitoring namespace if it doesn't exist...${NC}"
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Check for existing Grafana installation
echo -e "${BLUE}Checking for existing Grafana installation...${NC}"
if helm list -n monitoring | grep -q grafana; then
  echo -e "${YELLOW}Existing Grafana found. Uninstalling...${NC}"
  helm uninstall grafana -n monitoring

  # Wait a moment to ensure cleanup has started
  sleep 5

  # Clean up any lingering resources
  echo -e "${BLUE}Cleaning up any lingering Grafana resources...${NC}"
  for resourceType in deployment statefulset configmap service secret ingress pvc; do
    kubectl delete $resourceType -l app.kubernetes.io/name=grafana -n monitoring --ignore-not-found=true
    kubectl delete $resourceType -l app=grafana -n monitoring --ignore-not-found=true
  done

  # Specifically delete the admin credentials secret
  kubectl delete secret grafana-admin-credentials -n monitoring --ignore-not-found=true

  echo -e "${GREEN}Cleanup completed.${NC}"
else
  echo -e "${GREEN}No existing Grafana installation found.${NC}"
fi

# Create admin credentials secret
echo -e "${BLUE}Creating Grafana admin credentials secret...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: grafana-admin-credentials
  namespace: monitoring
type: Opaque
data:
  admin-user: $(echo -n "admin" | base64)
  admin-password: $(echo -n "$ADMIN_PASSWORD" | base64)
EOF

# Create values file
echo -e "${BLUE}Creating Grafana values file...${NC}"
cat <<EOF > grafana-values.yaml
persistence:
  enabled: true
  storageClassName: linode-block-storage
  size: 5Gi

admin:
  existingSecret: grafana-admin-credentials
  userKey: admin-user
  passwordKey: admin-password

ingress:
  enabled: true
  ingressClassName: nginx
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - grafana.${DOMAIN}
  tls:
    - hosts:
        - grafana.${DOMAIN}
      secretName: wildcard-domain-certificate-prod

datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
      access: proxy
      isDefault: true
    - name: Loki
      type: loki
      url: http://loki-stack:3100
      access: proxy
      version: 1
      editable: true
      jsonData:
        maxLines: 1000
        derivedFields:
          - datasourceUid: Prometheus
            matcherRegex: "(?:trace_id|traceID|traceid)=([0-9a-f]+)"
            name: TraceID
        timeout: 60
        healthCheck:
          enabled: true
          query: "{instance=~\".+\"} |= \".*\" limit 1"

serviceMonitor:
  enabled: true

timeouts:
  connectTimeout: 30s
  readTimeout: 30s

resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
EOF

# Add Grafana Helm repo and update
echo -e "${BLUE}Adding/updating Grafana Helm repository...${NC}"
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Grafana
echo -e "${BLUE}Installing Grafana...${NC}"
helm install grafana grafana/grafana \
  --namespace monitoring \
  --create-namespace \
  --values grafana-values.yaml \
  --timeout 10m

# Wait for deployment to be ready
echo -e "${BLUE}Waiting for Grafana to be ready...${NC}"
kubectl rollout status deployment/grafana -n monitoring --timeout=300s || true

# Get Grafana URL and admin credentials
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Grafana installation complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${BLUE}Grafana URL:${NC} https://grafana.${DOMAIN}"
echo -e "${BLUE}Admin Username:${NC} admin"
echo -e "${BLUE}Admin Password:${NC} $ADMIN_PASSWORD"
echo
echo -e "${YELLOW}IMPORTANT: Save your admin password now!${NC}"
echo -e "${GREEN}=====================================${NC}"

# Save credentials to a file for future reference
echo -e "Grafana URL: https://grafana.${DOMAIN}\nAdmin Username: admin\nAdmin Password: $ADMIN_PASSWORD" > grafana-credentials.txt
echo -e "${BLUE}Credentials saved to${NC} grafana-credentials.txt"

echo
echo -e "${GREEN}Done!${NC}"
