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
    # config.load_kube_config()
    config.load_incluster_config()


def read_yaml_file(yaml_path):
    try:
        with open(yaml_path, 'r') as file:
            documents = list(yaml.safe_load_all(file))
        logging.info("Successfully loaded YAML file")
        return documents
    except Exception as e:
        logging.error(f"Error loading YAML file: {e}")
        raise


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


#  -------------------- Challenge Deployment  --------------------



def construct_challenge_deployment(pod_spec, instance_name, sanitized_user_id, challenge_image, secret_name, run_as_root):
    pod_spec['metadata']['name'] = instance_name
    pod_spec['metadata']['labels']['user'] = sanitized_user_id
    pod_spec['spec']['containers'][0]['image'] = challenge_image
    pod_spec['spec']['containers'][0]['securityContext']['runAsUser'] = 0 if run_as_root else 1000

    pod_spec['spec']['containers'][0]['env'] = [
        client.V1EnvVar(
            name='FLAG',
            value_from=client.V1EnvVarSource(
                secret_key_ref=client.V1SecretKeySelector(
                    name=secret_name,
                    key='flag'
                )
            )
        )
    ]

    # Add CHALLENGE_CONTAINER_NAME environment variable to the bridge container
    challenge_container_name = pod_spec['spec']['containers'][0]['name']
    pod_spec['spec']['containers'][1]['env'].append({
        'name': 'CHALLENGE_CONTAINER_NAME',
        'value': challenge_container_name
    })

    logging.info("Modified pod spec")
    logging.debug(f"Modified pod spec: {pod_spec}")

    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=pod_spec['metadata']['name']),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels=pod_spec['metadata']['labels']
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels=pod_spec['metadata']['labels']),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=pod_spec['spec']['containers'][0]['name'],
                            image=pod_spec['spec']['containers'][0]['image'],
                            ports=[client.V1ContainerPort(
                                container_port=pod_spec['spec']['containers'][0]['ports'][0]['containerPort'],
                                name=pod_spec['spec']['containers'][0]['ports'][0]['name'])],
                            env=pod_spec['spec']['containers'][0]['env'],
                            security_context=client.V1SecurityContext(
                                run_as_user=pod_spec['spec']['containers'][0]['securityContext']['runAsUser'],
                                privileged=pod_spec['spec']['containers'][0]['securityContext']['privileged']
                            )
                        ),
                        client.V1Container(
                            name=pod_spec['spec']['containers'][1]['name'],
                            image=pod_spec['spec']['containers'][1]['image'],
                            ports=[client.V1ContainerPort(
                                container_port=pod_spec['spec']['containers'][1]['ports'][0]['containerPort'],
                                name=pod_spec['spec']['containers'][1]['ports'][0]['name'])],
                            env=[
                                client.V1EnvVar(
                                    name=env['name'],
                                    value=env.get('value'),
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name=env['valueFrom']['secretKeyRef']['name'],
                                            key=env['valueFrom']['secretKeyRef']['key']
                                        )
                                    ) if 'valueFrom' in env else None
                                ) for env in pod_spec['spec']['containers'][1]['env']
                            ]
                        )
                    ]
                )
            )
        )
    )

    logging.info("Constructed Kubernetes Deployment object")
    return deployment


def construct_challenge_service(service_spec, instance_name, sanitized_user_id):
    service_spec['metadata']['name'] = instance_name
    service_spec['spec']['selector']['user'] = sanitized_user_id
    # Set the service type to LoadBalancer
    service_spec['spec']['type'] = 'LoadBalancer'

    logging.info("Modified service spec")
    logging.debug(f"Modified service spec: {service_spec}")

    service = client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=service_spec['metadata']['name']),
        spec=client.V1ServiceSpec(
            selector=service_spec['spec']['selector'],
            ports=[client.V1ServicePort(protocol=service_spec['spec']['ports'][0]['protocol'],
                                        port=service_spec['spec']['ports'][0]['port'],
                                        target_port=service_spec['spec']['ports'][0]['targetPort'])],
            type=service_spec['spec']['type']  # LoadBalancer
        )
    )

    logging.info("Constructed Kubernetes Service object")
    return service


def create_challenge_deployment(user_id, challenge_image, yaml_path, run_as_root):
    logging.info("Starting create_challenge_deployment")
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

    deployment = construct_challenge_deployment(pod_spec, instance_name, sanitized_user_id, challenge_image,
                                                secret_name, run_as_root)
    service = construct_challenge_service(service_spec, instance_name, sanitized_user_id)

    try:
        api = client.AppsV1Api()
        api.create_namespaced_deployment(body=deployment, namespace="default")
        logging.info("Deployment created successfully")
    except Exception as e:
        logging.error(f"Error creating deployment: {e}")
        raise

    try:
        core_api = client.CoreV1Api()
        core_api.create_namespaced_service(namespace="default", body=service)
        logging.info("Service created successfully")
    except Exception as e:
        logging.error(f"Error creating service: {e}")
        raise

    logging.info(f"Creating challenge {instance_name} for user {user_id} with flag {flag}")

    # Create the Vertical Pod Autoscaler
    vpa_spec = {
        "apiVersion": "autoscaling.k8s.io/v1",
        "kind": "VerticalPodAutoscaler",
        "metadata": {
            "name": f"vpa-{instance_name}"
        },
        "spec": {
            "targetRef": {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "name": instance_name
            },
            "updatePolicy": {
                "updateMode": "Auto"
            }
        }
    }

    try:
        vpa = client.CustomObjectsApi()
        vpa.create_namespaced_custom_object(
            group="autoscaling.k8s.io",
            version="v1",
            namespace="default",
            plural="verticalpodautoscalers",
            body=vpa_spec
        )
        logging.info("VPA created successfully")
    except Exception as e:
        logging.error(f"Error creating VPA: {e}")
        raise
    try:
        logging.info("Attempting to assign LoadBalancer IP to challenge")
        external_ip = wait_for_loadbalancer_ip(core_api, instance_name)
        challenge_url = f"http://{external_ip}"
        logging.info(f"Assigned LoadBalancer IP: {external_ip}")
    except TimeoutError:
        logging.error("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        delete_challenge_deployment(instance_name)
        raise

    return instance_name, challenge_url


def delete_challenge_deployment(deployment_name):
    api = client.AppsV1Api()
    api.delete_namespaced_deployment(
        name=deployment_name,
        namespace="default",
        body=client.V1DeleteOptions(propagation_policy='Foreground')
    )
    core_api = client.CoreV1Api()
    core_api.delete_namespaced_service(
        name=deployment_name,
        namespace="default",
    )


#  -------------------- Web OS  --------------------

def construct_webos_deployment(pod_spec, instance_name, sanitized_user_id, webos_image):
    pod_spec['metadata']['name'] = instance_name
    pod_spec['metadata']['labels']['user'] = sanitized_user_id
    pod_spec['spec']['containers'][0]['image'] = webos_image
    pod_spec['spec']['containers'][0]['securityContext']['runAsUser'] = 1000
    pod_spec['spec']['containers'][0]['securityContext']['runAsGroup'] = 1000
    pod_spec['spec']['securityContext'] = {
        'fsGroup': 1000
    }

    logging.info("Modified pod spec for WebOS")
    logging.debug(f"Modified pod spec: {pod_spec}")

    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=pod_spec['metadata']['name']),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels=pod_spec['metadata']['labels']
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels=pod_spec['metadata']['labels']),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=pod_spec['spec']['containers'][0]['name'],
                            image=pod_spec['spec']['containers'][0]['image'],
                            ports=[client.V1ContainerPort(
                                container_port=pod_spec['spec']['containers'][0]['ports'][0]['containerPort'],
                                name=pod_spec['spec']['containers'][0]['ports'][0]['name']
                            )],
                            security_context=client.V1SecurityContext(
                                run_as_user=pod_spec['spec']['containers'][0]['securityContext']['runAsUser'],
                                run_as_group=pod_spec['spec']['containers'][0]['securityContext']['runAsGroup']
                            )
                        )
                    ],
                    security_context=client.V1PodSecurityContext(
                        fs_group=pod_spec['spec']['securityContext']['fsGroup']
                    )
                )
            )
        )
    )
    logging.info("Constructed Kubernetes Deployment object for WebOS")
    return deployment


def create_webos(user_id):
    logging.info("Starting create_webos")
    logging.debug(f"Received parameter: user_id={user_id}")

    core_api = client.CoreV1Api()
    apps_api = client.AppsV1Api()

    sanitized_user_id = user_id.replace("_", "-").lower()
    deployment_name = f"webos-{sanitized_user_id}"

    # Define deployment spec
    pod_spec = {
        "metadata": {
            "name": deployment_name,
            "labels": {
                "user": sanitized_user_id
            }
        },
        "spec": {
            "containers": [
                {
                    "name": "webos",
                    "image": "gcr.io/edurangectf/webos",
                    "ports": [{"containerPort": 80, "name": "http"}],
                    "securityContext": {
                        "runAsUser": 0
                    }
                }
            ]
        }
    }
    deployment = construct_webos_deployment(pod_spec, deployment_name, sanitized_user_id, "gcr.io/edurangectf/webos")

    # Define service spec
    service_spec = {
        "metadata": {
            "name": deployment_name
        },
        "spec": {
            "selector": {
                "user": sanitized_user_id
            },
            "ports": [
                {
                    "protocol": "TCP",
                    "port": 80,
                    "targetPort": 3000
                }
            ],
            "type": "LoadBalancer"
        }
    }
    service = construct_challenge_service(service_spec, deployment_name, sanitized_user_id)

    # Create the deployment
    try:
        apps_api.create_namespaced_deployment(body=deployment, namespace="default")
        logging.info("WebOS deployment created successfully")
    except Exception as e:
        logging.error(f"Error creating WebOS deployment: {e}")
        raise

    # Create the service
    try:
        core_api.create_namespaced_service(namespace="default", body=service)
        logging.info("WebOS service created successfully")
    except Exception as e:
        logging.error(f"Error creating WebOS service: {e}")
        raise

    # Wait for LoadBalancer IP
    try:
        logging.info("Attempting to assign LoadBalancer IP to WebOS")
        external_ip = wait_for_loadbalancer_ip(core_api, deployment_name)
        logging.info(f"Assigned LoadBalancer IP: {external_ip}")
    except TimeoutError:
        logging.error("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        delete_challenge_deployment(deployment_name)
        raise

    return external_ip
