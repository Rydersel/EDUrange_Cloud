import time
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import yaml
import socket
import logging

# Initialize Kubernetes client
config.load_incluster_config()
v1 = client.CoreV1Api()
apps_v1 = client.AppsV1Api()

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

# Load YAML configuration
def load_yaml(filename):
    with open(filename) as f:
        return yaml.safe_load(f)

# Deploy the challenge and bridge
def deploy_challenge(instance_name, challenge_image, namespace='default'):
    challenge_yaml = load_yaml('challenge-pod.yaml')
    bridge_yaml = load_yaml('bridge-service.yaml')

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
        logging.debug("Creating Pod with YAML: %s", challenge_yaml)
        v1.create_namespaced_pod(namespace=namespace, body=challenge_yaml)
        logging.debug("Creating Service with YAML: %s", bridge_yaml)
        v1.create_namespaced_service(namespace=namespace, body=bridge_yaml)
        logging.info(f"Deployment of {instance_name} started on port {free_port}")
    except ApiException as e:
        logging.error(f"Exception when creating deployment: {e}")

# Delete the challenge and bridge
def delete_challenge(instance_name, namespace='default'):
    try:
        v1.delete_namespaced_pod(name=instance_name + '-challenge', namespace=namespace)
        v1.delete_namespaced_service(name=instance_name + '-bridge-service', namespace=namespace)
        logging.info(f"Deletion of {instance_name} started")
    except ApiException as e:
        logging.error(f"Exception when deleting deployment: {e}")

# Check pod status
def wait_for_pod(instance_name, namespace='default'):
    while True:
        try:
            pod = v1.read_namespaced_pod(name=instance_name + '-challenge', namespace=namespace)
            if pod.status.phase == 'Running' and all(c.ready for c in pod.status.container_statuses):
                logging.info(f"Pod {instance_name} is running")
                break
            else:
                logging.info("Waiting for pod to be ready...")
                time.sleep(1)
        except ApiException as e:
            logging.error(f"Exception when checking pod status: {e}")
            time.sleep(1)

# Set up port forwarding
def port_forward(namespace, pod_name, local_port, remote_port):
    from kubernetes.stream import portforward

    try:
        config.load_kube_config()
        v1 = client.CoreV1Api()
        pf = portforward(v1.connect_get_namespaced_pod_portforward, pod_name, namespace, ports=f"{local_port}:{remote_port}")
        logging.info(f"Port forwarding {local_port} -> {remote_port} for pod {pod_name}")
    except Exception as e:
        logging.error(f"Error setting up port forwarding: {e}")

# Main function for testing
if __name__ == '__main__':
    deploy_challenge('example-instance', 'rydersel/debiantest:latest')
    wait_for_pod('example-instance')
    port_forward('default', 'example-instance-challenge', 30000, 5000)
    delete_challenge('example-instance')
