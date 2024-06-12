import time
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import yaml
import socket
import subprocess

# Initialize Kubernetes client
config.load_incluster_config()
v1 = client.CoreV1Api()
apps_v1 = client.AppsV1Api()

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def used_ports():
    ports_in_use = []
    try:
        result = subprocess.run(
            ["kubectl", "get", "services", "--all-namespaces", "-o", "jsonpath={..nodePort}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True
        )
        ports = result.stdout.strip().split()
        ports_in_use = [int(port) for port in ports if port.isdigit()]
    except subprocess.CalledProcessError as e:
        print(f"Error retrieving ports in use: {e.stderr}")
    return ports_in_use

# Load YAML configuration
def load_yaml(filename):
    with open(filename) as f:
        return yaml.safe_load(f)


# Deploy the challenge and bridge
def deploy_challenge(instance_name, challenge_image, namespace='default'):
    challenge_yaml = load_yaml('challenge-pod.yaml')
    bridge_yaml = load_yaml('bridge-service.yaml')
    #network_policy_yaml = load_yaml('network-policy.yaml')

    # Modify names to ensure uniqueness
    challenge_yaml['metadata']['name'] = instance_name + '-challenge'
    bridge_yaml['metadata']['name'] = instance_name + '-bridge-service'

    # Set the challenge image
    for container in challenge_yaml['spec']['containers']:
        if container['name'] == 'challenge-container':
            container['image'] = challenge_image

    # Assign a free port for the bridge service
    free_port = find_free_port()
    for port in bridge_yaml['spec']['ports']:
        if 'nodePort' in port:
            port['nodePort'] = free_port

    # Apply the YAML configurations
    try:
        v1.create_namespaced_pod(namespace=namespace, body=challenge_yaml)
        v1.create_namespaced_service(namespace=namespace, body=bridge_yaml)
        #v1.create_namespaced_network_policy(namespace=namespace, body=network_policy_yaml)
        print(f"Deployment of {instance_name} started on port {free_port}")
    except ApiException as e:
        print(f"Exception when creating deployment: {e}")


# Delete the challenge and bridge
def delete_challenge(instance_name, namespace='default'):
    try:
        v1.delete_namespaced_pod(name=instance_name + '-challenge', namespace=namespace)
        v1.delete_namespaced_service(name=instance_name + '-bridge-service', namespace=namespace)
        print(f"Deletion of {instance_name} started")
    except ApiException as e:
        print(f"Exception when deleting deployment: {e}")


# Check pod status
def wait_for_pod(instance_name, namespace='default'):
    while True:
        pod = v1.read_namespaced_pod(name=instance_name + '-challenge', namespace=namespace)
        if pod.status.phase == 'Running':
            print(f"Pod {instance_name} is running")
            break
        else:
            print("Waiting for pod to be ready...")
            time.sleep(1)


# Main function for testing
if __name__ == '__main__':
    deploy_challenge('example-instance', 'rydersel/debiantest:latest')
    wait_for_pod('example-instance')
    delete_challenge('example-instance')
