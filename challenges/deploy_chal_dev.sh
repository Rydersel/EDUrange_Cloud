kubectl delete pod challenge-pod --wait=false
sleep 10
cd challenge-infa
kubectl apply -f challenge-pod.yaml
kubectl apply -f bridge-service.yaml
kubectl apply -f network-policy.yaml
echo "Waiting for pod to be ready..."
until kubectl get pods challenge-pod -o jsonpath='{.status.phase}' | grep -q 'Running'; do
  echo -n "."
  sleep 1
done
kubectl get pods
kubectl port-forward svc/bridge-service 5000:80



