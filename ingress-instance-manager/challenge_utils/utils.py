import base64
import logging
import os
import random
import yaml
from dotenv import load_dotenv
from kubernetes import client, config
import time
import uuid
import hashlib
import requests
load_dotenv()  # Load environment variables


def wait_for_url(url, timeout=120,
                 interval=5):  # Waits for url to not return 404 Ingress not found or 503 Ingress temp not available
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


# With current wordlists there are 25 million possible flags
def generate_unique_flag():
    adjectives_file = 'challenge_utils/wordlists/adjectives.txt'
    nouns_file = 'challenge_utils/wordlists/nouns.txt'

    # Load words from file
    def load_words(filename):
        with open(filename, 'r') as file:
            words = file.read().splitlines()
        return words

    # Load adjectives and nouns from wordlists
    adjectives = load_words(adjectives_file)
    nouns = load_words(nouns_file)

    # Generate a random word pair
    adjective = random.choice(adjectives)
    noun = random.choice(nouns)
    random_word_pair = f"{adjective}-{noun}"

    random_number = random.randint(1000, 9999)

    unique_flag = f"EDU-{{{random_word_pair}{random_number}}}"
    return unique_flag


def create_flag_secret(instance_name, flag):
    secret_name = f"flag-secret-{instance_name}"
    body = client.V1Secret(
        metadata=client.V1ObjectMeta(name=secret_name),
        string_data={"flag": flag}
    )
    core_api = client.CoreV1Api()
    core_api.create_namespaced_secret(namespace="default", body=body)
    return secret_name


def get_secret(secret_name, namespace='default'):
    """
    Retrieve a Kubernetes secret by name from the specified namespace.
    
    Args:
        secret_name (str): The name of the secret to retrieve
        namespace (str, optional): The Kubernetes namespace. Defaults to 'default'.
        
    Returns:
        V1Secret or None: The secret object if found, None otherwise
    """
    load_config()  # Load Kubernetes configuration

    # Validate the secret_name parameter
    if not secret_name:
        logging.error(f"Invalid secret name provided: secret_name is None")
        return None
        
    if not isinstance(secret_name, str):
        logging.error(f"Invalid secret name type: {type(secret_name).__name__}, expected string")
        return None
        
    if secret_name == "null" or secret_name.strip() == "":
        logging.error(f"Invalid secret name provided: '{secret_name}'")
        return None

    # Create an API client
    v1 = client.CoreV1Api()

    try:
        # Fetch the secret
        logging.info(f"Attempting to retrieve secret '{secret_name}' from namespace '{namespace}'")
        secret = v1.read_namespaced_secret(name=secret_name, namespace=namespace)
        logging.info(f"Successfully retrieved secret '{secret_name}'")
        return secret
    except client.ApiException as e:
        if e.status == 404:
            logging.warning(f"Secret '{secret_name}' not found in namespace '{namespace}'")
        else:
            logging.error(f"API exception when reading secret '{secret_name}': {e}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error when reading secret '{secret_name}': {e}")
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


def create_challenge_pod(user_id, challenge_image, yaml_path, run_as_root, apps_config, flag):
    logging.info("Starting create_challenge_pod")
    logging.debug(
        f"Received parameters: user_id={user_id}, challenge_image={challenge_image}, yaml_path={yaml_path}, run_as_root={run_as_root}")

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
    ingress_url = os.getenv("INGRESS_URL")
    ingress_spec['spec']['rules'][0]['host'] = f"{instance_name}.{ingress_url}"
    ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"

    # Dynamically set the challenge image
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'challenge-container':
            container['image'] = challenge_image

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


def create_pod_service_and_ingress(user_id, challenge_image, yaml_path, run_as_root, apps_config):
    logging.info("Starting create_pod_service_and_ingress")
    logging.debug(
        f"Received parameters: user_id={user_id}, challenge_image={challenge_image}, yaml_path={yaml_path}, run_as_root={run_as_root}")

    pod, service, ingress, secret_name = create_challenge_pod(user_id, challenge_image, yaml_path, run_as_root,
                                                              apps_config)

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
    ingress_url = os.getenv("INGRESS_URL")
    if not ingress_url:
        logging.error("INGRESS_URL environment variable is not set. This must be configured by the installer.")
        ingress_url = ""  # Empty string as fallback, but this should be caught by the installer
    challenge_url = f"https://{pod.metadata.name}.{ingress_url}"
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
    core_api.delete_namespaced_secret(  # Delete secret storing flag
        name=f"flag-secret-{pod_name}",
        namespace="default",
    )
    networking_v1 = client.NetworkingV1Api()
    networking_v1.delete_namespaced_ingress(
        name=f"ingress-{pod_name}",
        namespace="default",
    )

    # Get status of pod


def get_pod_status_logic(pod):
    if pod.metadata.deletion_timestamp:  # Work around for deleting status not showing up
        return 'deleting'
    elif pod.status.phase == 'Pending':
        return 'creating'
    elif pod.status.phase == 'Running':
        return 'active'
    elif pod.status.phase == 'Failed':
        return 'error'
    elif pod.status.phase == 'Succeeded':
        return 'deleting'
    else:
        return pod.status.phase


# Get KUBERNETES_HOST and KUBERNETES_SERVICE_ACCOUNT_TOKEN for terminal from ConfigMap
def get_credentials_for_terminal(self):
    try:
        core_api = client.CoreV1Api()
        config_map = core_api.read_namespaced_config_map(name="terminal-credentials", namespace="default")
        kubernetes_host = config_map.data["KUBERNETES_HOST"]
        kubernetes_service_account_token = config_map.data["KUBERNETES_SERVICE_ACCOUNT_TOKEN"]
        return kubernetes_host, kubernetes_service_account_token
    except Exception as e:
        logging.error(f"Error reading terminal credentials from ConfigMap: {e}")
        raise
