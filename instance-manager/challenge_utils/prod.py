from kubernetes import client, config
import time
import uuid
import hashlib

def load_config():
    config.load_kube_config()  # Ensure your kubeconfig is set up to point to your GKE cluster

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

def create_webos_deployment(user_id, image):
    flag = generate_unique_flag(user_id)
    secret_name = create_flag_secret(user_id, flag)
    sanitized_user_id = user_id.replace("_", "-").lower()
    deployment_name = f"ctfchal-webos-{sanitized_user_id}-{str(uuid.uuid4())[:8]}".lower()
    container_port = 6000

    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"user": sanitized_user_id}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"user": sanitized_user_id}),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=deployment_name,
                            image=image,
                            ports=[client.V1ContainerPort(container_port=container_port)],
                            env=[
                                client.V1EnvVar(
                                    name="FLAG",
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name=secret_name,
                                            key="flag"
                                        )
                                    )
                                )
                            ]
                        )
                    ]
                )
            )
        )
    )

    api = client.AppsV1Api()
    api.create_namespaced_deployment(body=deployment, namespace="default")

    service = client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1ServiceSpec(
            selector={"user": sanitized_user_id},
            ports=[client.V1ServicePort(port=80, target_port=container_port)],
            type="LoadBalancer"
        )
    )

    core_api = client.CoreV1Api()
    core_api.create_namespaced_service(namespace="default", body=service)

    try:
        external_ip = wait_for_loadbalancer_ip(core_api, deployment_name)
        challenge_url = f"http://{external_ip}"
    except TimeoutError:
        print("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        delete_challenge_deployment(deployment_name)
        raise

    return deployment_name, challenge_url

def create_challenge_deployment(user_id, image):
    flag = generate_unique_flag(user_id)
    secret_name = create_flag_secret(user_id, flag)
    sanitized_user_id = user_id.replace("_", "-").lower()
    deployment_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:8]}".lower()
    container_port = 5000

    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"user": sanitized_user_id}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"user": sanitized_user_id}),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=deployment_name,
                            image=image,
                            ports=[client.V1ContainerPort(container_port=container_port)],
                            env=[
                                client.V1EnvVar(
                                    name="FLAG",
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name=secret_name,
                                            key="flag"
                                        )
                                    )
                                )
                            ]
                        )
                    ]
                )
            )
        )
    )

    api = client.AppsV1Api()
    api.create_namespaced_deployment(body=deployment, namespace="default")

    service = client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1ServiceSpec(
            selector={"user": sanitized_user_id},
            ports=[client.V1ServicePort(port=80, target_port=container_port)],
            type="LoadBalancer"
        )
    )

    core_api = client.CoreV1Api()
    core_api.create_namespaced_service(namespace="default", body=service)

    try:
        external_ip = wait_for_loadbalancer_ip(core_api, deployment_name)
        challenge_url = f"http://{external_ip}"
    except TimeoutError:
        print("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        delete_challenge_deployment(deployment_name)
        raise

    return deployment_name, challenge_url

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
