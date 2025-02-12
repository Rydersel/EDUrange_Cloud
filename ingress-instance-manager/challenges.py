# Challenges.py
import logging
import os
import uuid
import json
from dotenv import load_dotenv
from kubernetes import client
from challenge_utils.utils import generate_unique_flag, create_flag_secret, read_yaml_file, get_credentials_for_terminal

load_dotenv()  # Load environmental variables
url = os.getenv("INGRESS_URL")


def transform_app_config(app_config):
    """Transform app config from database format to WebOS format."""
    transformed = {
        "id": app_config["appId"],
        "icon": app_config["icon"],
        "title": app_config["title"],
        "width": app_config["width"],
        "height": app_config["height"],
        "screen": app_config["screen"],
        "disabled": app_config["disabled"],
        "favourite": app_config["favourite"],
        "desktop_shortcut": app_config["desktop_shortcut"],
        "launch_on_startup": app_config["launch_on_startup"]
    }

    # Handle additional_config
    if app_config.get("additional_config"):
        # If additional_config is a string, parse it
        if isinstance(app_config["additional_config"], str):
            additional_config = json.loads(app_config["additional_config"])
        else:
            additional_config = app_config["additional_config"]
        
        # Add each key from additional_config directly to the root
        for key, value in additional_config.items():
            transformed[key] = value

    return transformed


class FullOsChallenge:
    def __init__(self, user_id, challenge_image, yaml_path, run_as_root, apps_config, competition_id):
        self.user_id = user_id
        self.challenge_image = challenge_image
        self.yaml_path = yaml_path
        self.run_as_root = run_as_root
        self.apps_config = apps_config
        self.competition_id = competition_id
        self.KUBERNETES_HOST, self.KUBERNETES_SERVICE_ACCOUNT_TOKEN = get_credentials_for_terminal(self)

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

        challenge_url = f"https://{pod.metadata.name}.{url}"
        terminal_url = f"https://terminal-{pod.metadata.name}.{url}"
        logging.info(f"Assigned challenge URL: {challenge_url}")
        logging.info(f"Assigned terminal URL: {terminal_url}")

        return pod.metadata.name, challenge_url, terminal_url, secret_name

    def create_challenge_pod(self):
        logging.info("Starting create_challenge_pod")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}, run_as_root={self.run_as_root}")

        flag = generate_unique_flag()
        sanitized_user_id = self.user_id.replace("_", "-").lower()
        instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()
        secret_name = create_flag_secret(instance_name, flag)
        logging.info("Generated instance name and sanitized user ID")
        logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

        documents = read_yaml_file(self.yaml_path)
        pod_spec = documents[0]
        service_spec = documents[1]
        ingress_spec = documents[2]

        pod_spec['metadata']['name'] = instance_name
        pod_spec['metadata']['labels']['app'] = instance_name
        pod_spec['metadata']['labels']['user'] = sanitized_user_id
        pod_spec['metadata']['labels']['competition_id'] = self.competition_id

        service_spec['metadata']['name'] = f"service-{instance_name}"
        service_spec['spec']['selector']['app'] = instance_name
        ingress_spec['metadata']['name'] = f"ingress-{instance_name}"
        ingress_spec['spec']['rules'][0]['host'] = f"{instance_name}.{url}"
        ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"
        ingress_spec['spec']['rules'].append({
            "host": f"terminal-{instance_name}.{url}",
            "http": {
                "paths": [{
                    "path": "/",
                    "pathType": "ImplementationSpecific",
                    "backend": {
                        "service": {
                            "name": f"service-{instance_name}",
                            "port": {
                                "number": 3001
                            }
                        }
                    }
                }]
            }
        })

        # Add the TLS section to use the wildcard certificate
        ingress_spec['spec']['tls'] = [{
            "hosts": [
                f"{instance_name}.{url}",
                f"terminal-{instance_name}.{url}"
            ],
            "secretName": "wildcard-domain-certificate-prod"
        }]

        # Dynamically set the challenge image
        for container in pod_spec['spec']['containers']:
            if container['name'] == 'challenge-container':
                container['image'] = self.challenge_image
                container['env'].append({"name": "FLAG", "value": flag})

            elif container['name'] == 'webos':
                # Pass through the apps config without transformation
                container['env'] = [
                    {"name": "NEXT_PUBLIC_POD_NAME", "value": instance_name},
                    {"name": "NEXT_PUBLIC_APPS_CONFIG", "value": self.apps_config},  # Pass through directly
                    {"name": "NEXT_PUBLIC_CHALLENGE_POD_NAME", "value": instance_name},
                    {"name": "NEXT_PUBLIC_CHALLENGE_API_URL", "value": "http://localhost:5000/execute"},
                    {"name": "NEXT_PUBLIC_TERMINAL_URL", "value": f"https://terminal-{instance_name}.{url}"},
                    {"name": "NEXT_PUBLIC_CHALLENGE_URL", "value": f"https://{instance_name}.{url}"}
                ]

            elif container['name'] == 'bridge':
                container['env'].append({"name": "flag_secret_name", "value": secret_name})
                container['env'].append({"name": "NEXT_PUBLIC_APPS_CONFIG", "value": self.apps_config})
                container['env'].append({"name": "CHALLENGE_POD_NAME", "value": instance_name})

            if container['name'] == 'terminal':
                container['env'] = [
                    {"name": "CONTAINER_NAME",
                     "value": "challenge-container"},
                    {"name": "POD_NAME",
                     "value": instance_name},
                    {"name": "KUBERNETES_HOST",
                     "value": self.KUBERNETES_HOST},
                    {"name": "KUBERNETES_NAMESPACE", "value": "default"},
                    {"name": "KUBERNETES_SERVICE_ACCOUNT_TOKEN",
                     "value": self.KUBERNETES_SERVICE_ACCOUNT_TOKEN},
                ]

        pod = client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(name=instance_name, labels={"app": instance_name, "user": sanitized_user_id}),
            spec=pod_spec['spec']
        )

        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(name=service_spec['metadata']['name']),
            spec=client.V1ServiceSpec(
                selector={"app": instance_name, "user": sanitized_user_id},
                ports=[
                    client.V1ServicePort(protocol="TCP", port=80, target_port=3000, name="webos-http"),
                    client.V1ServicePort(protocol="TCP", port=3001, target_port=3001, name="terminal-http")
                ],
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
    def __init__(self, user_id, challenge_image, yaml_path, apps_config, competition_id):
        self.user_id = user_id
        self.challenge_image = challenge_image
        self.yaml_path = yaml_path
        self.apps_config = apps_config
        self.competition_id = competition_id
        self.KUBERNETES_HOST, self.KUBERNETES_SERVICE_ACCOUNT_TOKEN = get_credentials_for_terminal(self)

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

        challenge_url = f"http://terminal-{pod.metadata.name}.{url}"
        logging.info(f"Assigned challenge URL: {challenge_url}")

        return pod.metadata.name, challenge_url, secret_name

    def create_challenge_pod(self):
        logging.info("Starting create_challenge_pod for WebChallenge")
        logging.debug(f"Received parameters: user_id={self.user_id}, challenge_image={self.challenge_image}, yaml_path={self.yaml_path}")

        flag = generate_unique_flag()
        sanitized_user_id = self.user_id.replace("_", "-").lower()
        instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()
        secret_name = create_flag_secret(instance_name, flag)
        logging.info("Generated instance name and sanitized user ID")
        logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

        documents = read_yaml_file(self.yaml_path)
        pod_spec = documents[0]
        service_spec = documents[1]
        ingress_spec = documents[2]

        pod_spec['metadata']['name'] = instance_name
        pod_spec['metadata']['labels']['app'] = instance_name
        pod_spec['metadata']['labels']['user'] = sanitized_user_id
        pod_spec['metadata']['labels']['competition_id'] = self.competition_id  # Add competition ID to labels
        service_spec['metadata']['name'] = f"service-{instance_name}"
        service_spec['spec']['selector']['app'] = instance_name
        ingress_spec['metadata']['name'] = f"ingress-{instance_name}"
        ingress_spec['spec']['rules'][0]['host'] = f"terminal-{instance_name}.{url}"
        ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"
        ingress_spec['spec']['rules'][0]['http']['paths'].append({
            "path": "/terminal",
            "pathType": "ImplementationSpecific",
            "backend": {
                "service": {
                    "name": f"service-{instance_name}",
                    "port": {
                        "number": 3001
                    }
                }
            }
        })

        for container in pod_spec['spec']['containers']:
            if container['name'] == 'bridge':
                container['env'].append({"name": "flag_secret_name", "value": secret_name})

                # Update the NEXT_PUBLIC_APPS_CONFIG with the correct flag secret name
                updated_apps_config = json.loads(self.apps_config)
                for app in updated_apps_config:
                    if app["id"] == "challenge-prompt" and "challenge" in app:
                        app["challenge"]["flagSecretName"] = secret_name
                updated_apps_config_str = json.dumps(updated_apps_config)

                container['env'].append({"name": "NEXT_PUBLIC_APPS_CONFIG", "value": updated_apps_config_str})

        pod = client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(name=instance_name, labels={"app": instance_name, "user": sanitized_user_id}),
            spec=pod_spec['spec']
        )

        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(name=service_spec['metadata']['name']),
            spec=client.V1ServiceSpec(
                selector={"app": instance_name, "user": sanitized_user_id},
                ports=[
                    client.V1ServicePort(protocol="TCP", port=80, target_port=3000, name="webos-http"),
                    client.V1ServicePort(protocol="TCP", port=3001, target_port=3001, name="terminal-http")
                ],
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
        logging.info(ingress)

        return pod, service, ingress, secret_name


class MetasploitChallenge:
    def __init__(self, user_id, attack_image, defence_image, yaml_path, apps_config, competition_id):
        self.user_id = user_id
        self.attack_image = attack_image
        self.defence_image = defence_image
        self.yaml_path = yaml_path
        self.apps_config = apps_config
        self.competition_id = competition_id
        self.KUBERNETES_HOST, self.KUBERNETES_SERVICE_ACCOUNT_TOKEN = get_credentials_for_terminal(self)

    def create_pod_service_and_ingress(self):
        logging.info("Starting create_pod_service_and_ingress for Metasploit Challenge")
        logging.debug(
            f"Received parameters: user_id={self.user_id}, attack_image={self.attack_image}, defence_image={self.defence_image}, yaml_path={self.yaml_path}")

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

        logging.info(f"Creating Metasploit challenge {pod.metadata.name} for user {self.user_id}")

        challenge_url = f"https://{pod.metadata.name}.{url}"
        terminal_url = f"https://terminal-{pod.metadata.name}.{url}"
        logging.info(f"Assigned challenge URL: {challenge_url}")
        logging.info(f"Assigned terminal URL: {terminal_url}")

        return pod.metadata.name, challenge_url, terminal_url, secret_name

    def create_challenge_pod(self):
        logging.info("Starting create_challenge_pod for MetasploitChallenge")
        logging.debug(f"Received parameters: user_id={self.user_id}, attack_image={self.attack_image}, defence_image={self.defence_image}, yaml_path={self.yaml_path}")

        flag = generate_unique_flag()
        sanitized_user_id = self.user_id.replace("_", "-").lower()
        instance_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:4]}".lower()
        secret_name = create_flag_secret(instance_name, flag)
        logging.info("Generated instance name and sanitized user ID")
        logging.info(f"Instance name: {instance_name}, Sanitized user ID: {sanitized_user_id}")

        documents = read_yaml_file(self.yaml_path)
        pod_spec = documents[0]
        service_spec = documents[1]
        ingress_spec = documents[2]

        pod_spec['metadata']['name'] = instance_name
        pod_spec['metadata']['labels']['app'] = instance_name
        pod_spec['metadata']['labels']['user'] = sanitized_user_id
        pod_spec['metadata']['labels']['competition_id'] = self.competition_id  # Add competition ID to labels
        service_spec['metadata']['name'] = f"service-{instance_name}"
        service_spec['spec']['selector']['app'] = instance_name
        ingress_spec['metadata']['name'] = f"ingress-{instance_name}"
        ingress_spec['spec']['rules'][0]['host'] = f"{instance_name}.{url}"
        ingress_spec['spec']['rules'][0]['http']['paths'][0]['backend']['service']['name'] = f"service-{instance_name}"
        ingress_spec['spec']['rules'].append({
            "host": f"terminal-{instance_name}.{url}",
            "http": {
                "paths": [{
                    "path": "/",
                    "pathType": "ImplementationSpecific",
                    "backend": {
                        "service": {
                            "name": f"service-{instance_name}",
                            "port": {
                                "number": 3001
                            }
                        }
                    }
                }]
            }
        })

        ingress_spec['spec']['tls'] = [{
            "hosts": [
                f"{instance_name}.{url}",
                f"terminal-{instance_name}.{url}"
            ],
            "secretName": "wildcard-domain-certificate-prod"
        }]

        for container in pod_spec['spec']['containers']:
            if container['name'] == 'attack-container':
                container['image'] = self.attack_image
            elif container['name'] == 'defence-container':
                container['image'] = self.defence_image
                container['env'].append({"name": "FLAG", "value": flag})
            elif container['name'] == 'bridge':
                container['env'].append({"name": "flag_secret_name", "value": secret_name})
                container['env'].append({"name": "ATTACK_CONTAINER_NAME", "value": "attack-container"})
                container['env'].append({"name": "DEFENCE_CONTAINER_NAME", "value": "defence-container"})

                updated_apps_config = json.loads(self.apps_config)
                for app in updated_apps_config:
                    if app["id"] == "challenge-prompt" and "challenge" in app:
                        app["challenge"]["flagSecretName"] = secret_name
                updated_apps_config_str = json.dumps(updated_apps_config)

                container['env'].append({"name": "NEXT_PUBLIC_APPS_CONFIG", "value": updated_apps_config_str})
                container['env'].append({"name": "CHALLENGE_POD_NAME", "value": instance_name})

            if container['name'] == 'terminal':
                container['env'] = [
                    {"name": "CONTAINER_NAME", "value": "attack-container"},
                    {"name": "POD_NAME", "value": instance_name},
                    {"name": "KUBERNETES_HOST", "value": self.KUBERNETES_HOST},
                    {"name": "KUBERNETES_NAMESPACE", "value": "default"},
                    {"name": "KUBERNETES_SERVICE_ACCOUNT_TOKEN", "value": self.KUBERNETES_SERVICE_ACCOUNT_TOKEN},
                ]

        pod = client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(name=instance_name, labels={"app": instance_name, "user": sanitized_user_id}),
            spec=pod_spec['spec']
        )

        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(name=service_spec['metadata']['name']),
            spec=client.V1ServiceSpec(
                selector={"app": instance_name, "user": sanitized_user_id},
                ports=[
                    client.V1ServicePort(protocol="TCP", port=80, target_port=3000, name="webos-http"),
                    client.V1ServicePort(protocol="TCP", port=3001, target_port=3001, name="terminal-http")
                ],
                type="ClusterIP"
            )
        )

        ingress = client.V1Ingress(
            api_version="networking.k8s.io/v1",
            kind="Ingress",
            metadata=client.V1ObjectMeta(name=ingress_spec['metadata']['name'],
                                         annotations=ingress_spec['metadata'].get('annotations', {})),
            spec=ingress_spec['spec']
        )

        logging.info("Constructed Kubernetes Pod, Service, and Ingress objects for Metasploit Challenge")

        return pod, service, ingress, secret_name
