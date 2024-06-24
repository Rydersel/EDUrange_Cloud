import logging
import yaml
from kubernetes import client, config
import time
import uuid
import hashlib

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_config():
    config.load_incluster_config()

def generate_unique_flag(user_id):
    secret_salt = "test123"
    return f"CTF{{{hashlib.sha256((user_id + secret_salt).encode()).hexdigest()}}}"

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

def wait_for_loadbalancer_ip(api, service_name, namespace="default", retry_interval=10, timeout=300):
    start_time = time.time()
    while time.time() - start_time < timeout:
        service = api.read_namespaced_service(name=service_name, namespace=namespace)
        if service.status.load_balancer.ingress is not None and len(service.status.load_balancer.ingress) > 0:
            return service.status.load_balancer.ingress[0].ip
        print(f"Waiting for LoadBalancer IP for service '{service_name}'...")
        time.sleep(retry_interval)
    raise TimeoutError("Timeout waiting for LoadBalancer IP")

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

    pod_spec['metadata']['name'] = instance_name  # Set the instance name here
    service_spec['metadata']['name'] = f"service-{instance_name}"

    # Dynamically set the challenge image
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'challenge-container':
            container['image'] = challenge_image

    # Ensure no duplicate "webos" container
    existing_container_names = [container['name'] for container in pod_spec['spec']['containers']]
    if "webos" not in existing_container_names:
        pod_spec['spec']['containers'].append({
            "name": "webos",
            "image": "gcr.io/edurangectf/webos:latest",
            "ports": [{"containerPort": 3000, "name": "http"}],
            "env": [
                {"name": "CHALLENGE_API_URL", "value": "http://localhost:5000/execute"},
                {"name": "CHALLENGE_POD_NAME", "value": instance_name}  # Pass the pod name to the environment
            ]
        })

    # Add CHALLENGE_POD_NAME environment variable to the bridge container
    for container in pod_spec['spec']['containers']:
        if container['name'] == 'bridge':
            container['env'].append({"name": "CHALLENGE_POD_NAME", "value": instance_name})


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
            type="LoadBalancer"
        )
    )

    logging.info("Constructed Kubernetes Pod and Service objects")

    return pod, service

def create_pod_and_service(user_id, challenge_image, yaml_path, run_as_root):
    logging.info("Starting create_pod_and_service")
    logging.debug(f"Received parameters: user_id={user_id}, challenge_image={challenge_image}, yaml_path={yaml_path}, run_as_root={run_as_root}")

    pod, service = create_challenge_pod(user_id, challenge_image, yaml_path, run_as_root)

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

    logging.info(f"Creating challenge {pod.metadata.name} for user {user_id}")

    try:
        logging.info("Attempting to assign LoadBalancer IP to challenge")
        external_ip = wait_for_loadbalancer_ip(core_api, service.metadata.name)
        challenge_url = f"http://{external_ip}"
        logging.info(f"Assigned LoadBalancer IP: {external_ip}")
    except TimeoutError:
        logging.error("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        delete_challenge_pod(pod.metadata.name)
        raise

    return pod.metadata.name, challenge_url

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
