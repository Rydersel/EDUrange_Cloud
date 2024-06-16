import time
from kubernetes.client.rest import ApiException
from kubernetes import client, config, stream
import yaml
import select
import logging
import socket



# Init Kubernetes client
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

    challenge_yaml['spec']['serviceAccountName'] = 'portforward-sa'
    # Assign a free port for the bridge service
    free_port = 30009
    bridge_yaml['spec']['ports'][0]['nodePort'] = free_port

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
def port_forward(name, namespace, port, local_port):
    config.load_incluster_config()
    api_instance = client.CoreV1Api()

    pod_name = name + '-challenge'
    logging.info(f"Pod name: {pod_name}")
    try:
        # Execute the port forward
        forward = stream.stream(api_instance.connect_get_namespaced_pod_portforward,
                                pod_name,
                                namespace,
                                ports=str(port),
                                _preload_content=False)
        logging.info(f"Port forwarding to {pod_name} in namespace {namespace} on remote port {port}")

        # Open a local socket
        local_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        local_sock.bind(('localhost', local_port))
        local_sock.listen(1)
        logging.info(f"Listening on local port {local_port}")

        conn, addr = local_sock.accept()
        logging.info(f"Connection accepted from {addr}")

        while True:
            read_sockets, _, _ = select.select([conn, forward], [], [])

            if conn in read_sockets:
                data = conn.recv(1024)
                if not data:
                    break
                forward.write_channel(data, str(port))
                logging.debug(f"Sent data to pod: {data}")

            if forward in read_sockets:
                data = forward.read_channel(str(port))
                if not data:
                    break
                conn.send(data)
                logging.debug(f"Received data from pod: {data}")

        forward.close()
        conn.close()
        local_sock.close()
        logging.info("Port forwarding session closed")

    except client.ApiException as e:
        logging.error(f"Exception when port forwarding: {e}")


