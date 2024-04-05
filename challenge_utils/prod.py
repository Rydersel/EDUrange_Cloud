from kubernetes import client, config
import time
import uuid

def load_config():
    config.load_kube_config()


def wait_for_loadbalancer_ip(api, service_name, namespace="default", retry_interval=10, timeout=300):
    start_time = time.time()
    while time.time() - start_time < timeout:
        service = api.read_namespaced_service(name=service_name, namespace=namespace)
        if service.status.load_balancer.ingress is not None:
            return service.status.load_balancer.ingress[0].ip
        print(f"Waiting for LoadBalancer IP for service '{service_name}'...")  # Add logging or feedback
        time.sleep(retry_interval)
    raise TimeoutError("Timeout waiting for LoadBalancer IP")


def create_challenge_deployment(user_id,image):
    # Replace underscores with hyphens in user_id and ensure lowercase
    sanitized_user_id = user_id.replace("_", "-").lower()
    deployment_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:8]}".lower()

    container_port = 5000  # MUST MATCH PORT CHAL CONTAINER LISTENS ON

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
                            image=image,  #chal input
                            ports=[client.V1ContainerPort(container_port=container_port)]
                        )
                    ]
                )
            )
        )
    )

    # Create the deployment in Kubernetes
    api = client.AppsV1Api()
    api.create_namespaced_deployment(
        body=deployment,
        namespace="default"
    )

    # Create a Kubernetes service
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
        # Wait for LoadBalancer IP (with retries and timeout)
        external_ip = wait_for_loadbalancer_ip(core_api, deployment_name)
        challenge_url = f"http://{external_ip}"
    except TimeoutError:
        # Handle timeout error (e.g., inform the user, clean up resources)
        print("Timeout waiting for LoadBalancer IP. Cleaning up resources...")
        # Add logic to delete deployment and service if needed
        # ...
        raise  # Re-raise the error to stop execution

    return deployment_name, challenge_url

def delete_challenge_deployment(deployment_name):
    # delete user challenge
    api = client.AppsV1Api()
    api.delete_namespaced_deployment(
        name=deployment_name,
        namespace="default",  # Specify your namespace if different
        body=client.V1DeleteOptions(propagation_policy='Foreground')
    )
