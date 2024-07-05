import logging
import uuid
from kubernetes import client
from challenge_utils.utils import generate_unique_flag, create_flag_secret, read_yaml_file


# Alot of code repitition here, will fix later

class FullOsChallenge:
    def __init__(self, user_id, challenge_image, yaml_path, run_as_root, apps_config):
        self.user_id = user_id
        self.challenge_image = challenge_image
        self.yaml_path = yaml_path
        self.run_as_root = run_as_root
        self.apps_config = apps_config

    def create_pod_service_and_ingress(self):
        logging.info("Starting create_pod_service_and_ingress")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}, run_as_root={self.run_as_root}")

        pod, service, ingress, secret_name = self.create_challenge_pod()

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

        logging.info(f"Creating challenge {pod.metadata.name} for user {self.user_id}")

        challenge_url = f"http://{pod.metadata.name}.rydersel.cloud"
        logging.info(f"Assigned challenge URL: {challenge_url}")

        return pod.metadata.name, challenge_url, secret_name

    def create_challenge_pod(self):
        logging.info("Starting create_challenge_pod")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}, run_as_root={self.run_as_root}")

        flag = generate_unique_flag(self.user_id)
        secret_name = create_flag_secret(self.user_id, flag)
        sanitized_user_id = self.user_id.replace("_", "-").lower()
        instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()

        logging.info("Generated instance name and sanitized user ID")
        logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

        documents = read_yaml_file(self.yaml_path)
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
                container['image'] = self.challenge_image

        # Add CHALLENGE_POD_NAME environment variable to the bridge container
        for container in pod_spec['spec']['containers']:
            if container['name'] == 'bridge':
                container['env'].append({"name": "CHALLENGE_POD_NAME", "value": instance_name})

        # Add FLAG_SECRET_NAME environment variable to all containers
        for container in pod_spec['spec']['containers']:
            if container['name'] == 'bridge':
                container['env'].append({"name": "flag_secret_name", "value": secret_name})
                container['env'].append({"name": "NEXT_PUBLIC_APPS_CONFIG", "value": self.apps_config})

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


class WebChallenge:
    def __init__(self, user_id, challenge_image, yaml_path, apps_config):
        self.user_id = user_id
        self.challenge_image = challenge_image
        self.yaml_path = yaml_path
        self.apps_config = apps_config

    def create_pod_service_and_ingress(self):
        logging.info("Starting create_pod_service_and_ingress")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}")

        pod, service, ingress, secret_name = self.create_challenge_pod()

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

        logging.info(f"Creating challenge {pod.metadata.name} for user {self.user_id}")

        challenge_url = f"http://{pod.metadata.name}.rydersel.cloud"
        logging.info(f"Assigned challenge URL: {challenge_url}")

        return pod.metadata.name, challenge_url, secret_name

    def create_challenge_pod(self):
        logging.info("Starting create_challenge_pod")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}")

        flag = generate_unique_flag(self.user_id)
        secret_name = create_flag_secret(self.user_id, flag)
        sanitized_user_id = self.user_id.replace("_", "-").lower()
        instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()

        logging.info("Generated instance name and sanitized user ID")
        logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

        documents = read_yaml_file(self.yaml_path)
        pod_spec = documents[0]
        service_spec = documents[1]
        ingress_spec = documents[2]

        pod_spec['metadata']['name'] = instance_name  # Set the instance name here
        service_spec['metadata']['name'] = f"service-{instance_name}"
        ingress_spec['metadata']['name'] = f"ingress-{instance_name}"
        ingress_spec['spec']['rules'][0]['host'] = f"{instance_name}.rydersel.cloud"
        ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"

        # Add FLAG_SECRET_NAME environment variable to all containers
        for container in pod_spec['spec']['containers']:
            if container['name'] == 'bridge':
                container['env'].append({"name": "flag_secret_name", "value": secret_name})
                container['env'].append({"name": "NEXT_PUBLIC_APPS_CONFIG", "value": self.apps_config})

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
