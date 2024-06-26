import base64
import logging
import yaml
from kubernetes import client, config
import time
import uuid
import hashlib
import requests

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def wait_for_url(url, timeout=120, interval=5):  # Waits for url to not return 404 Ingress not found or 503 Ingress temp not available
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(url)
            if response.status_code != 503 and response.status_code != 404:
                return True
        except requests.RequestException as e:
            logging.error(f"Error checking URL {url}: {e}")
        time.sleep(interval)
    return False


def load_config():
    config.load_incluster_config()

def generate_unique_flag(user_id):
    secret_salt = "test123" # temp
    secret_salt = "test123"  # temp
    full_hash = hashlib.sha256((user_id + secret_salt).encode()).hexdigest()
    shortened_hash = full_hash[:8]  # Take the first 8 characters of the hash (full_hash is way too long)
    return f"EDU-CTF-{{{shortened_hash}}}"

def create_flag_secret(user_id, flag):
    sanitized_user_id = user_id.replace("_", "-").lower()
    timestamp = str(int(time.time()))
    secret_name = f"flag-secret-{sanitized_user_id}-{timestamp}"  # Unique name
    body = client.V1Secret(
        metadata=client.V1ObjectMeta(name=secret_name),
        string_data={"flag": flag}
    )
    core_api = client.CoreV1Api()
    core_api.create_namespaced_secret(namespace="default", body=body)
    return secret_name

def get_secret(secret_name, namespace='default'):
    # Load Kubernetes configuration
    load_config()

    # Create an API client
    v1 = client.CoreV1Api()

    try:
        # Fetch the secret
        secret = v1.read_namespaced_secret(name=secret_name, namespace=namespace)
        return secret
    except client.ApiException as e:
        print(f"Exception when reading secret: {e}")
        return None

def decode_secret_data(secret):
    if secret is None:
        return None
    decoded_data = {}
    for key, value in secret.data.items():
        # Decode the base64 encoded secret data
        decoded_data[key] = base64.b64decode(value).decode('utf-8')
    return decoded_data


def read_yaml_file(yaml_path):
    try:
        with open(yaml_path, 'r') as file:
            documents = list(yaml.safe_load_all(file))
        logging.info("Successfully loaded YAML file")
        return documents
    except Exception as e:
        logging.error(f"Error loading YAML file: {e}")
        raise

def create_challenge_pod(user_id, challenge_image, yaml_path, run_as_root):
    logging.info("Starting create_challenge_pod")
    logging.debug(f"Received parameters: user_id={user_id}, challenge_image={challenge_image}, yaml_path={yaml_path}, run_as_root={run_as_root}")

    flag = generate_unique_flag(user_id)
    secret_name = create_flag_secret(user_id, flag)
    sanitized_user_id = user_id.replace("_", "-").lower()
    instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()

    logging.info("Generated instance name and sanitized user ID")
    logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

    documents = read_yaml_file(yaml_path)
    pod_spec = documents[0]
    service_spec = documents[1]
    ingress_spec = documents[2]

    pod_spec['metadata']['name'] = instance_name  # Set the instance name here
    service_spec['metadata']['name'] = f"service-{instance_name}"
    ingress_spec['metadata']['name'] = f"ingress-{instance_name}"
    ingress_spec['spec']['rules'][0]['host'] = f"{instance_name}.rydersel.cloud"
    ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"

    # Dynamically set the challenge image
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'challenge-container':
            container['image'] = challenge_image


    # Add CHALLENGE_POD_NAME environment variable to the bridge container
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'bridge':
            container['env'].append({"name": "CHALLENGE_POD_NAME", "value": instance_name})

        # Add FLAG_SECRET_NAME environment variable to all containers
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'bridge':
            container['env'].append({"name": "flag_secret_name", "value": secret_name})

    pod = client.V1Pod(
        api_version="v1",
        kind="Pod",
        metadata=client.V1ObjectMeta(name=instance_name, labels={"app": "challenge", "user": sanitized_user_id}),
        spec=pod_spec['spec']
    )

    service = client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=service_spec['metadata']['name']),
        spec=client.V1ServiceSpec(
            selector={"app": "challenge", "user": sanitized_user_id},
            ports=[client.V1ServicePort(protocol="TCP", port=80, target_port=3000)],
            type="ClusterIP"
        )
    )

    ingress = client.V1Ingress(
        api_version="networking.k8s.io/v1",
        kind="Ingress",
        metadata=client.V1ObjectMeta(name=ingress_spec['metadata']['name']),
        spec=ingress_spec['spec']
    )

    logging.info("Constructed Kubernetes Pod, Service, and Ingress objects")

    return pod, service, ingress, secret_name

def create_pod_service_and_ingress(user_id, challenge_image, yaml_path, run_as_root):
    logging.info("Starting create_pod_service_and_ingress")
    logging.debug(f"Received parameters: user_id={user_id}, challenge_image={challenge_image}, yaml_path={yaml_path}, run_as_root={run_as_root}")

    pod, service, ingress, secret_name = create_challenge_pod(user_id, challenge_image, yaml_path, run_as_root)

    try:
        core_api = client.CoreV1Api()
        core_api.create_namespaced_pod(body=pod, namespace="default")
        logging.info("Pod created successfully")
    except Exception as e:
        logging.error(f"Error creating pod: {e}")
        raise

    try:
        core_api.create_namespaced_service(namespace="default", body=service)
        logging.info("Service created successfully")
    except Exception as e:
        logging.error(f"Error creating service: {e}")
        raise

    try:
        networking_v1 = client.NetworkingV1Api()
        networking_v1.create_namespaced_ingress(namespace="default", body=ingress)
        logging.info("Ingress created successfully")
    except Exception as e:
        logging.error(f"Error creating ingress: {e}")
        raise

    logging.info(f"Creating challenge {pod.metadata.name} for user {user_id}")

    challenge_url = f"http://{pod.metadata.name}.rydersel.cloud"
    logging.info(f"Assigned challenge URL: {challenge_url}")

    return pod.metadata.name, challenge_url, secret_name

def delete_challenge_pod(pod_name):
    core_api = client.CoreV1Api()
    core_api.delete_namespaced_pod(
        name=pod_name,
        namespace="default",
        body=client.V1DeleteOptions(propagation_policy='Foreground')
    )
    core_api.delete_namespaced_service(
        name=f"service-{pod_name}",
        namespace="default",
    )
    networking_v1 = client.NetworkingV1Api()
    networking_v1.delete_namespaced_ingress(
        name=f"ingress-{pod_name}",
        namespace="default",
    )
