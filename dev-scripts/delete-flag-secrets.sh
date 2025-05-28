#!/bin/bash
#
# This script deletes all Kubernetes secrets with names that start with "flag-secret"
#

set -e

echo "Searching for secrets that start with 'flag-secret'..."
SECRETS=$(kubectl get secrets -A --no-headers | grep "^.*flag-secret" | awk '{print $1 " " $2}')

if [ -z "$SECRETS" ]; then
  echo "No 'flag-secrets' found in any namespace."
  exit 0
fi

echo "Found the following 'flag-secrets' secrets:"
echo "$SECRETS" | while read namespace secret; do
  echo "  - $secret (namespace: $namespace)"
done

echo
read -p "Are you sure you want to delete these secrets? (y/n): " confirm

if [[ $confirm != "y" && $confirm != "Y" ]]; then
  echo "Operation canceled."
  exit 0
fi

echo
echo "Deleting secrets..."
echo "$SECRETS" | while read namespace secret; do
  echo "Deleting secret $secret in namespace $namespace..."
  kubectl delete secret "$secret" -n "$namespace"
done

echo
echo "All 'flag-secrets' have been deleted."
