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
load_dotenv()  # Load environment variables


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


def create_flag_secret(secret_name: str, flag_data: dict, owner_instance_name: str) -> client.V1Secret:
    """Creates a V1Secret object definition holding flag data.

    Args:
        secret_name: The desired name for the Kubernetes secret.
        flag_data: A dictionary where keys are flag names (like env var names)
                   and values are the actual flag strings.
        owner_instance_name: The base instance name of the challenge for labeling.

    Returns:
        A V1Secret object definition.
    """
    # Ensure flag data values are strings
    string_data = {k: str(v) for k, v in flag_data.items()}

    # Define standard labels for cleanup/discovery
    labels = {
        "app": owner_instance_name
    }

    secret_definition = client.V1Secret(
        api_version="v1",
        kind="Secret",
        metadata=client.V1ObjectMeta(name=secret_name, labels=labels),
        string_data=string_data # Use string_data for automatic base64 encoding by client
    )
    # No API call here, just return the definition
    logging.info(f"Defined V1Secret object '{secret_name}' for instance '{owner_instance_name}'")
    return secret_definition


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
