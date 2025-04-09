# Challenges.py
import logging
import os
import uuid
import json
import re
import random
import string
from abc import ABC, abstractmethod
from dotenv import load_dotenv
from kubernetes import client
from kubernetes.client import ApiException
import yaml
from challenge_utils.utils import generate_unique_flag, create_flag_secret, read_yaml_file, get_credentials_for_terminal
from challenge_utils.k8s_resources import sanitize_k8s_label, replace_template_variables, get_pod_status, \
    cleanup_resources_by_label, get_seccomp_profile_for_image
from challenge_utils.challenge_types import ChallengeType, normalize_challenge_type, get_handler_types
import base64

load_dotenv()  # Load environmental variables
url = os.getenv("INGRESS_URL")
if not url:
    logging.error("INGRESS_URL environment variable is not set. This must be configured by the installer.")
    url = ""  # Empty string as fallback, but this should be caught by the installer
logging.info(f"Using domain for challenge URLs: {url}")


# --- Base Handler and Registry --- #

class BaseChallengeHandler(ABC):
    """Abstract base class for challenge deployment handlers."""

    def __init__(self, user_id, cdf_data, competition_id, deployment_name):
        self.user_id = user_id
        self.cdf_data = cdf_data
        self.competition_id = competition_id
        self.instance_name = deployment_name
        self.resolved_variables = {}
        self.created_resources = []  # Keep track of created K8s resources for cleanup
        self.api_core_v1 = client.CoreV1Api()
        self.api_networking_v1 = client.NetworkingV1Api()
        self.api_apps_v1 = client.AppsV1Api()  # If needed for Deployments/StatefulSets
        # Add flag attributes
        self.flags = {}  # Dictionary to store flag values
        self.flag_secret_name = None  # Store flag secret name for easier access
        logging.info(f"Initialized handler for instance {self.instance_name}")

    @abstractmethod
    def deploy(self):
        """Creates all necessary Kubernetes resources for the challenge.

        Returns:
            dict: Information about the deployment (e.g., URLs, secret names).
        """
        pass

    @abstractmethod
    def cleanup(self):
        """Deletes all Kubernetes resources created by this handler instance.

        Returns:
            bool: True if cleanup was successful, False otherwise.
        """
        pass


class CTDBasedHandler(BaseChallengeHandler):
    """Handler that deploys challenges based on Challenge Type Definitions."""

    def __init__(self, user_id, cdf_data, competition_id, deployment_name):
        super().__init__(user_id, cdf_data, competition_id, deployment_name)
        self.challenge_type = cdf_data.get('metadata', {}).get('challenge_type')
        self.ctd_data = None
        self.type_config = cdf_data.get('typeConfig', {})
        
        # Get the domain from environment variable, with fallback
        self.domain = os.getenv("DOMAIN")
        if not self.domain:
            self.domain = os.getenv("INGRESS_URL")
            if not self.domain:
                logging.warning("Neither DOMAIN nor INGRESS_URL environment variable is set. Using default edurange.cloud")
                self.domain = "edurange.cloud"
            else:
                logging.info(f"Using INGRESS_URL as domain: {self.domain}")
        else:
            logging.info(f"Using DOMAIN environment variable: {self.domain}")

        # Load the CTD for this challenge type
        self._load_ctd()

    def _load_ctd(self):
        """Load the Challenge Type Definition for this challenge."""
        from challenge_utils.ctd_loader import load_ctd

        self.ctd_data = load_ctd(self.challenge_type)
        if not self.ctd_data:
            logging.error(f"Failed to load CTD for challenge type '{self.challenge_type}'")
            raise ValueError(f"Challenge type '{self.challenge_type}' is not supported")

    def _prepare_template_variables(self):
        """Prepare variables for template substitution."""
        from challenge_utils.utils import get_credentials_for_terminal
        from challenge_utils.challenge_types import ChallengeType

        # Generate a unique flag
        flag = generate_unique_flag()
        flag_secret_name = f"flag-secret-{self.instance_name}"

        # Store flag and flag_secret_name in the handler instance
        self.flags = {"FLAG_1": flag}
        self.flag_secret_name = flag_secret_name
        logging.info(f"Stored flag and flag_secret_name in handler instance: {flag_secret_name}")

        # Create the flag secret
        secret_obj = create_flag_secret(flag_secret_name, {"flag": flag}, self.instance_name)
        try:
            self.api_core_v1.create_namespaced_secret(namespace="default", body=secret_obj)
            logging.info(f"Created flag secret '{flag_secret_name}'")
        except Exception as e:
            logging.error(f"Error creating flag secret: {e}")
            raise

        # Generate database secret for SQL injection challenges
        db_secret_name = None
        if self.challenge_type == ChallengeType.SQL_INJECTION.value:
            db_secret_name = f"db-secret-{self.instance_name}"
            # Generate random passwords
            db_password = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
            db_root_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
            
            # Create database secret
            db_secret_obj = create_flag_secret(db_secret_name, {
                "password": db_password,
                "root_password": db_root_password
            }, self.instance_name)
            
            try:
                self.api_core_v1.create_namespaced_secret(namespace="default", body=db_secret_obj)
                logging.info(f"Created database secret '{db_secret_name}'")
            except Exception as e:
                logging.error(f"Error creating database secret: {e}")
                raise

        # Get Kubernetes credentials for terminal
        k8s_host, k8s_token = get_credentials_for_terminal(self)

        # Get the domain from class property
        domain = self.domain

        # Basic template variables
        variables = {
            "INSTANCE_NAME": self.instance_name,
            "DOMAIN": domain,
            # Add fully qualified domain for templates that use {{INSTANCE_NAME}}.{{DOMAIN}}
            "INSTANCE_NAME.DOMAIN": f"{self.instance_name}.{domain}",
            "USER_ID": self.user_id,
            "COMPETITION_ID": self.competition_id,
            "FLAG": flag,
            "FLAG_SECRET_NAME": flag_secret_name,
            "KUBERNETES_HOST": k8s_host,
            "KUBERNETES_TOKEN": k8s_token,
        }
        
        # Add database secret name if it exists
        if db_secret_name:
            variables["DB_SECRET_NAME"] = db_secret_name
            variables["RANDOM_PASSWORD"] = db_password
            variables["RANDOM_ROOT_PASSWORD"] = db_root_password

        # Generate apps config for WebOS
        apps_config = self._generate_webos_app_config()
        if apps_config:
            variables["APPS_CONFIG"] = json.dumps(apps_config)

        # Store variables in the class instance for later use
        self.resolved_variables = variables

        return variables

    def _generate_webos_app_config(self):
        """Generate WebOS app configuration based on CDF components."""
        apps_config = []
        questions = []

        logging.info(f"Generating WebOS app configuration for instance {self.instance_name}")

        # Process webosApp components from CDF
        for component in self.cdf_data.get('components', []):
            if component.get('type') == 'webosApp':
                app_id = component.get('id')
                logging.info(f"Processing webosApp component: {app_id}")
                app_config = self._process_webos_app(app_id, component.get('config', {}))
                if app_config:
                    apps_config.append(app_config)
                    logging.info(f"Added app config for {app_id}: {json.dumps(app_config)[:100]}...")
            elif component.get('type') == 'question':
                question_id = component.get('id')
                logging.info(f"Processing question component: {question_id}")
                question = self._process_question(question_id, component.get('config', {}))
                if question:
                    # Ensure content is not empty string, default to question ID if needed
                    if not question.get("content"):
                        question["content"] = f"Question: {question_id}"
                    questions.append(question)
                    logging.info(f"Added question: {question_id}")

        # Add challenge prompt app if there are questions
        if questions:
            logging.info(f"Challenge has {len(questions)} questions, creating challenge prompt app")
            flag_secret_name = f"flag-secret-{self.instance_name}"
            description = self.cdf_data.get('metadata', {}).get('description', '')
            challenge_name = self.cdf_data.get('metadata', {}).get('name', 'Unknown')

            # Get instructions using the existing method or fall back to description
            instructions = self._get_challenge_instructions()
            if not instructions:
                instructions = description

            prompt_app = {
                "id": "challenge-prompt",
                "icon": "./icons/prompt.svg",
                "title": f"Challenge: {challenge_name}",
                "width": 70,
                "height": 80,
                "screen": "displayChallengePrompt",
                "disabled": False,
                "favourite": True,
                "desktop_shortcut": True,
                "launch_on_startup": True,
                "description": description,  # Add description at root level
                "challenge": {
                    "type": "single",
                    "title": challenge_name,
                    "description": description,
                    "pages": [
                        {
                            "instructions": instructions,
                            "questions": questions
                        }
                    ]
                }
            }

            # Add flagSecretName only if it exists
            if flag_secret_name:
                prompt_app["challenge"]["flagSecretName"] = flag_secret_name

            apps_config.append(prompt_app)
            logging.info("Added challenge prompt app with questions")

        logging.info(f"Generated {len(apps_config)} app configurations for WebOS")
        logging.debug(f"Full apps config: {json.dumps(apps_config)}")

        return apps_config

    def _process_webos_app(self, app_id, config):
        """Process a webosApp component configuration."""
        # Implementation similar to DefaultCdfHandler._process_webos_app
        app_config = {
            "id": app_id,
            "icon": config.get("icon", "./icons/application.svg"),  # Always provide a default with correct path format
            "title": config.get("title", app_id),
            "width": config.get("width", 800),
            "height": config.get("height", 600),
            "screen": config.get("screen", "displayChrome"),  # Use string name that maps to a function in WebOS
            "disabled": config.get("disabled", False),
            "favourite": config.get("favourite", False),
            "desktop_shortcut": config.get("desktop_shortcut", True),
            "launch_on_startup": config.get("launch_on_startup", False)
        }

        # Move additional_config properties to root level
        additional_config = config.get("additional_config", {})
        if additional_config:
            for key, value in additional_config.items():
                app_config[key] = value

        # Add other configuration directly to root
        for key, value in config.items():
            if key not in ["icon", "title", "width", "height", "screen", "disabled", "favourite", "desktop_shortcut",
                           "launch_on_startup", "additional_config"]:
                app_config[key] = value

        return app_config

    def _process_question(self, question_id, config):
        """Process a question component configuration."""
        # Questions need to be aggregated in the challenge prompt app, not created as separate apps
        # Here we just create the question object that will be added to the challenge prompt
        question = {
            "id": question_id,
            "type": config.get("type", "text"),
            "content": config.get("prompt", config.get("text", "")),  # Use prompt or text as content
            "points": config.get("points", 1)
        }

        # For non-flag questions, include the answer
        if config.get("type") != "flag":
            question["answer"] = config.get("answer", "")

        return question

    def _get_challenge_instructions(self):
        """Extract and format challenge instructions from CDF."""
        # Look for instructions in components
        for component in self.cdf_data.get('components', []):
            if component.get('type') == 'webosApp' and component.get('id') == 'challenge-prompt':
                return component.get('config', {}).get('challenge', {}).get('instructions', '')

        # Fall back to metadata description if no explicit instructions
        return self.cdf_data.get('metadata', {}).get('description', '')

    def _apply_type_config(self, resources):
        """Apply challenge-specific configurations to the CTD template."""
        if not self.type_config:
            return resources

        # Get extension points from CTD
        extension_points = self.ctd_data.get('extensionPoints', {})

        for ext_key, ext_config in extension_points.items():
            if ext_key in self.type_config:
                # Find the target container and property
                container_name = ext_config.get('container')
                property_path = ext_config.get('property', '').split('.')

                for resource in resources:
                    if resource.kind == 'Pod':
                        for i, container in enumerate(resource.spec.containers):
                            if container.name == container_name:
                                # Apply the extension
                                self._apply_extension(container, property_path, self.type_config[ext_key])

        return resources

    def _apply_extension(self, container, property_path, value):
        """Apply an extension value to a container property."""
        if not property_path:
            return

        # Special case for apps config
        if '.'.join(property_path) == 'env.NEXT_PUBLIC_APPS_CONFIG':
            # Find the NEXT_PUBLIC_APPS_CONFIG env var and set its value to the APPS_CONFIG from resolved_variables
            for env_var in container.env:
                if env_var.name == 'NEXT_PUBLIC_APPS_CONFIG':
                    if 'APPS_CONFIG' in self.resolved_variables:
                        apps_config = self.resolved_variables['APPS_CONFIG']

                        # Ensure the apps config is a properly formatted JSON string
                        if not isinstance(apps_config, str):
                            logging.warning(
                                f"APPS_CONFIG is not a string, attempting to convert from type {type(apps_config)}")
                            try:
                                # If it's already a parsed object, convert it back to string
                                if isinstance(apps_config, (list, dict)):
                                    apps_config = json.dumps(apps_config)
                            except Exception as e:
                                logging.error(f"Failed to convert APPS_CONFIG to JSON string: {e}")
                                # Fallback to empty array
                                apps_config = '[]'

                        logging.info(f"Setting NEXT_PUBLIC_APPS_CONFIG for WebOS. Config length: {len(apps_config)}")
                        logging.info(f"Sample of apps config: {apps_config[:200]}...")

                        env_var.value = apps_config
                    else:
                        logging.warning(
                            "APPS_CONFIG not found in resolved variables, WebOS will start with default apps")
                        env_var.value = '[]'  # Empty array as fallback
                    return
            # If the env var wasn't found, log a warning
            logging.warning("NEXT_PUBLIC_APPS_CONFIG env var not found in container env list")
            return

        current = container
        for i, prop in enumerate(property_path):
            if i == len(property_path) - 1:
                # Last property in path, set the value
                if prop == 'image':
                    current.image = value
                elif prop == 'env':
                    # Handle env vars specially
                    for env_var in current.env:
                        if env_var.name == value.get('name'):
                            env_var.value = value.get('value')
                            return
                    # If not found, add new env var
                    current.env.append(client.V1EnvVar(
                        name=value.get('name'),
                        value=value.get('value')
                    ))
                # Add other property types as needed
            else:
                # Navigate the property path
                if hasattr(current, prop):
                    current = getattr(current, prop)
                else:
                    logging.warning(f"Property path '{'.'.join(property_path)}' not found in container")
                    return

    def _convert_ctd_to_k8s_resources(self, resolved_ctd):
        """Convert the resolved CTD into Kubernetes resources."""
        resources = []

        # Create Pod from template
        pod_template = resolved_ctd.get('podTemplate', {})
        if pod_template:
            pod = self._create_pod_from_template(pod_template)
            if pod:
                resources.append(pod)

        # Create Services
        for service_def in resolved_ctd.get('services', []):
            service = self._create_service_from_definition(service_def)
            if service:
                resources.append(service)

        # Create Ingresses
        for ingress_def in resolved_ctd.get('ingress', []):
            ingress = self._create_ingress_from_definition(ingress_def)
            if ingress:
                resources.append(ingress)

        return resources

    def _create_pod_from_template(self, pod_template):
        """Create a K8s Pod object from a template definition."""
        containers = []

        for container_def in pod_template.get('containers', []):
            container = client.V1Container(
                name=container_def.get('name'),
                image=container_def.get('image'),
                ports=[
                    client.V1ContainerPort(
                        container_port=port.get('containerPort'),
                        name=port.get('name'),
                        protocol=port.get('protocol', 'TCP')
                    ) for port in container_def.get('ports', [])
                ],
                env=[
                    client.V1EnvVar(
                        name=env.get('name'),
                        value=env.get('value') if 'value' in env else None,
                        value_from=self._parse_env_value_from(env.get('valueFrom')) if 'valueFrom' in env else None
                    ) for env in container_def.get('env', [])
                ],
                volume_mounts=[
                    client.V1VolumeMount(
                        name=mount.get('name'),
                        mount_path=mount.get('mountPath'),
                        read_only=mount.get('readOnly', False)
                    ) for mount in container_def.get('volumeMounts', [])
                ] if 'volumeMounts' in container_def else []
            )
            containers.append(container)

        volumes = [
            client.V1Volume(
                name=vol.get('name'),
                config_map=self._parse_volume_config_map(vol.get('configMap')) if 'configMap' in vol else None,
                secret=self._parse_volume_secret(vol.get('secret')) if 'secret' in vol else None,
                empty_dir={} if vol.get('emptyDir') else None
            ) for vol in pod_template.get('volumes', [])
        ] if 'volumes' in pod_template else []

        # Set container-level security contexts
        for container in containers:
            container.security_context = client.V1SecurityContext(
                seccomp_profile=client.V1SeccompProfile(
                    type="RuntimeDefault"  # Use the runtime default seccomp profile
                ),
                run_as_non_root=True,  # Security best practice
                run_as_user=1000,  # Run as UID 1000 (standard non-root user)
                run_as_group=1000,  # Run as GID 1000
                allow_privilege_escalation=False,  # Security best practice
                capabilities=client.V1Capabilities(
                    add=["CHOWN", "SETGID", "SETUID"]  # Minimal capabilities needed for Nginx
                )
            )

        # Set pod-level security context with filesystem permissions
        security_context = client.V1PodSecurityContext(
            seccomp_profile=client.V1SeccompProfile(
                type="RuntimeDefault"  # Use the runtime default seccomp profile
            ),
            fs_group=1000,  # Set filesystem group for pod
            run_as_user=1000,  # Run as UID 1000
            run_as_group=1000  # Run as GID 1000
        )

        pod = client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(
                name=self.instance_name,
                labels={
                    "app": "ctfchal",
                    "instance": self.instance_name,
                    "user": sanitize_k8s_label(self.user_id),
                    "competition_id": sanitize_k8s_label(self.competition_id),
                    "challenge_type": self.challenge_type,
                    "challenge_name": sanitize_k8s_label(self.cdf_data.get('metadata', {}).get('name', 'unknown'))
                }
            ),
            spec=client.V1PodSpec(
                containers=containers,
                volumes=volumes,
                security_context=security_context,
                restart_policy="Always",
                service_account_name="terminal-account"  # Ensure correct service account for terminal
            )
        )

        return pod

    def _parse_env_value_from(self, value_from):
        """Parse valueFrom for env vars."""
        if not value_from:
            return None

        if 'secretKeyRef' in value_from:
            secret_key_ref = value_from.get('secretKeyRef', {})
            # Check if the secret name contains a template variable that wasn't replaced
            secret_name = secret_key_ref.get('name', '')
            if '{{' in secret_name and '}}' in secret_name:
                # Use our utility function to replace template variables
                original_name = secret_name
                secret_name = replace_template_variables(secret_name, self.resolved_variables)
                if secret_name != original_name:
                    logging.info(f"Resolved secret name from template: {original_name} -> {secret_name}")

            return client.V1EnvVarSource(
                secret_key_ref=client.V1SecretKeySelector(
                    name=secret_name,  # Use the possibly resolved name
                    key=secret_key_ref.get('key')
                )
            )

        # Add other valueFrom types as needed
        return None

    def _parse_volume_config_map(self, config_map):
        """Parse configMap for volumes."""
        if not config_map:
            return None

        # Get config map name
        config_map_name = config_map.get('name', '')

        # Check if the config map name contains a template variable
        if '{{' in config_map_name and '}}' in config_map_name:
            # Use our utility function to replace template variables
            original_name = config_map_name
            config_map_name = replace_template_variables(config_map_name, self.resolved_variables)
            if config_map_name != original_name:
                logging.info(f"Resolved config map name from template: {original_name} -> {config_map_name}")

        return client.V1ConfigMapVolumeSource(
            name=config_map_name
        )

    def _parse_volume_secret(self, secret):
        """Parse secret for volumes."""
        if not secret:
            return None

        # Get secret name
        secret_name = secret.get('secretName', '')

        # Check if the secret name contains a template variable
        if '{{' in secret_name and '}}' in secret_name:
            # Use our utility function to replace template variables
            original_name = secret_name
            secret_name = replace_template_variables(secret_name, self.resolved_variables)
            if secret_name != original_name:
                logging.info(f"Resolved secret name from template: {original_name} -> {secret_name}")

        return client.V1SecretVolumeSource(
            secret_name=secret_name
        )

    def _create_service_from_definition(self, service_def):
        """Create a K8s Service from definition."""
        ports = []
        for port_def in service_def.get('ports', []):
            port = client.V1ServicePort(
                port=port_def.get('port'),
                target_port=port_def.get('targetPort'),
                name=port_def.get('name'),
                protocol=port_def.get('protocol', 'TCP')
            )
            ports.append(port)

        # Get the service name and check for unresolved template variables
        service_name = service_def.get('name', '')
        if '{{' in service_name and '}}' in service_name:
            # Use our utility function to replace template variables
            original_name = service_name
            service_name = replace_template_variables(service_name, self.resolved_variables)
            if service_name != original_name:
                logging.info(f"Resolved service name from template: {original_name} -> {service_name}")

        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(
                name=service_name,
                labels={
                    "app": "ctfchal",
                    "instance": self.instance_name,
                    "challenge_type": self.challenge_type
                }
            ),
            spec=client.V1ServiceSpec(
                selector={
                    "instance": self.instance_name
                },
                ports=ports,
                type="ClusterIP"
            )
        )

        return service

    def _create_ingress_from_definition(self, ingress_def):
        """Create a K8s Ingress from definition."""
        rules = []
        for rule_def in ingress_def.get('rules', []):
            # Check for template variables in the host
            host = rule_def.get('host', '')
            if '{{' in host and '}}' in host:
                original_host = host
                host = replace_template_variables(host, self.resolved_variables)
                if host != original_host:
                    logging.info(f"Resolved host from template: {original_host} -> {host}")

            http_paths = []
            for path_def in rule_def.get('http', {}).get('paths', []):
                # Check for template variables in service name
                backend_service_name = path_def.get('backend', {}).get('service', {}).get('name', '')
                if '{{' in backend_service_name and '}}' in backend_service_name:
                    original_service_name = backend_service_name
                    backend_service_name = replace_template_variables(backend_service_name, self.resolved_variables)
                    if backend_service_name != original_service_name:
                        logging.info(
                            f"Resolved backend service name from template: {original_service_name} -> {backend_service_name}")

                http_path = client.V1HTTPIngressPath(
                    path=path_def.get('path', '/'),
                    path_type=path_def.get('pathType', 'ImplementationSpecific'),
                    backend=client.V1IngressBackend(
                        service=client.V1IngressServiceBackend(
                            name=backend_service_name,
                            port=client.V1ServiceBackendPort(
                                number=path_def.get('backend', {}).get('service', {}).get('port', {}).get('number')
                            )
                        )
                    )
                )
                http_paths.append(http_path)

            rule = client.V1IngressRule(
                host=host,
                http=client.V1HTTPIngressRuleValue(
                    paths=http_paths
                )
            )
            rules.append(rule)

        tls = []
        for tls_def in ingress_def.get('tls', []):
            # Check for template variables in hosts
            hosts = []
            for host in tls_def.get('hosts', []):
                if '{{' in host and '}}' in host:
                    resolved_host = replace_template_variables(host, self.resolved_variables)
                    hosts.append(resolved_host)
                else:
                    hosts.append(host)

            tls_item = client.V1IngressTLS(
                hosts=hosts,
                secret_name=tls_def.get('secretName')
            )
            tls.append(tls_item)

        annotations = ingress_def.get('annotations', {})
        # Check for template variables in annotations
        for key, value in annotations.items():
            if isinstance(value, str) and '{{' in value and '}}' in value:
                annotations[key] = replace_template_variables(value, self.resolved_variables)
                logging.info(f"Resolved annotation value from template: {key}={value} -> {annotations[key]}")

        # Get the ingress name and check for unresolved template variables
        ingress_name = ingress_def.get('name', '')
        if '{{' in ingress_name and '}}' in ingress_name:
            original_name = ingress_name
            ingress_name = replace_template_variables(ingress_name, self.resolved_variables)
            if ingress_name != original_name:
                logging.info(f"Resolved ingress name from template: {original_name} -> {ingress_name}")

        ingress = client.V1Ingress(
            api_version="networking.k8s.io/v1",
            kind="Ingress",
            metadata=client.V1ObjectMeta(
                name=ingress_name,
                annotations=annotations,
                labels={
                    "app": "ctfchal",
                    "instance": self.instance_name,
                    "challenge_type": self.challenge_type
                }
            ),
            spec=client.V1IngressSpec(
                ingress_class_name="nginx",
                rules=rules,
                tls=tls
            )
        )

        return ingress

    def deploy(self):
        """Deploy the challenge based on the Challenge Type Definition."""
        try:
            # Step 1: Prepare variables for template substitution
            variables = self._prepare_template_variables()

            # Verify that resolved_variables is set and contains necessary values
            if not hasattr(self, 'resolved_variables') or not self.resolved_variables:
                logging.error("resolved_variables not set after calling _prepare_template_variables")
                self.resolved_variables = variables  # Set it directly as a fallback

            # Log the flag secret name for debugging
            flag_secret_name = self.resolved_variables.get('FLAG_SECRET_NAME', 'not-set')
            logging.info(f"Using flag secret name: {flag_secret_name} for instance {self.instance_name}")

            # Step 2: Resolve the CTD template with variables
            from challenge_utils.ctd_loader import resolve_ctd_template
            resolved_ctd = resolve_ctd_template(self.ctd_data, variables)

            # Log service and ingress names from CTD for debugging
            for service_def in resolved_ctd.get('services', []):
                logging.info(f"Service name in resolved CTD: {service_def.get('name')}")

            for ingress_def in resolved_ctd.get('ingress', []):
                logging.info(f"Ingress name in resolved CTD: {ingress_def.get('name')}")
                for rule in ingress_def.get('rules', []):
                    logging.info(f"Ingress host in resolved CTD: {rule.get('host')}")
                    for path in rule.get('http', {}).get('paths', []):
                        service_name = path.get('backend', {}).get('service', {}).get('name')
                        logging.info(f"  Backend service name in resolved CTD: {service_name}")

            # Step 3: Convert CTD to Kubernetes resources
            resources = self._convert_ctd_to_k8s_resources(resolved_ctd)

            # Log resource names for debugging
            for resource in resources:
                if resource.kind == "Service":
                    logging.info(f"Service resource name: {resource.metadata.name}")
                elif resource.kind == "Ingress":
                    logging.info(f"Ingress resource name: {resource.metadata.name}")
                    for rule in resource.spec.rules:
                        logging.info(f"Ingress rule host: {rule.host}")
                        for path in rule.http.paths:
                            logging.info(f"  Backend service name: {path.backend.service.name}")

            # Step 4: Apply type-specific configurations
            resources = self._apply_type_config(resources)

            # Step 5: Create resources in Kubernetes
            created_resources = []
            for resource in resources:
                try:
                    if resource.kind == "Pod":
                        # Log environment variables in challenge container for debugging
                        for container in resource.spec.containers:
                            if container.name == 'challenge-container':
                                logging.info(f"Container: {container.name} environment variables:")
                                for env in container.env:
                                    if env.value_from and env.value_from.secret_key_ref:
                                        logging.info(
                                            f"  {env.name}: secretKeyRef.name={env.value_from.secret_key_ref.name}, key={env.value_from.secret_key_ref.key}")
                                    else:
                                        logging.info(f"  {env.name}: {env.value}")

                        created = self.api_core_v1.create_namespaced_pod(namespace="default", body=resource)
                    elif resource.kind == "Service":
                        logging.info(f"Creating Service '{resource.metadata.name}'")
                        created = self.api_core_v1.create_namespaced_service(namespace="default", body=resource)
                    elif resource.kind == "Ingress":
                        logging.info(f"Creating Ingress '{resource.metadata.name}'")
                        created = self.api_networking_v1.create_namespaced_ingress(namespace="default", body=resource)
                    else:
                        logging.warning(f"Unknown resource kind: {resource.kind}")
                        continue

                    created_resources.append(created)
                    logging.info(f"Created {resource.kind} '{resource.metadata.name}'")
                except Exception as e:
                    logging.error(f"Error creating {resource.kind}: {e}")
                    # Attempt cleanup and raise exception
                    self.cleanup()
                    raise

            # Store created resources for potential cleanup
            self.created_resources = created_resources

            # Wait for resources to be ready
            logging.info(f"Waiting for challenge resources to be ready for instance {self.instance_name}")
            # Could implement resource status checks here

            # Calculate URLs using the class domain property
            domain = self.domain
            webos_url = f"https://{self.instance_name}.{domain}"
            
            # For web challenges, include the web-specific URL
            web_challenge_url = f"https://web-{self.instance_name}.{domain}"

            logging.info(f"Challenge deployed successfully for instance {self.instance_name}")
            logging.info(f"WebOS URL: {webos_url}")
            logging.info(f"Web Challenge URL: {web_challenge_url}")

            # Return all URLs - let the dashboard determine which to use as primary
            return {
                "success": True,
                "deployment_name": self.instance_name,
                "webosUrl": webos_url,  
                "webChallengeUrl": web_challenge_url,
                "flag_secret_name": self.flag_secret_name,
                "flags": self.flags,
                "status": "running"
            }

        except Exception as e:
            logging.exception(f"Error deploying challenge: {e}")
            self.cleanup()
            return {
                "success": False,
                "error": str(e)
            }

    def cleanup(self):
        """Clean up all resources created by this deployment."""
        logging.info(f"Cleaning up resources for instance {self.instance_name}")

        from challenge_utils.k8s_resources import cleanup_resources_by_label

        # Use our utility function to clean up all resources with the instance label
        result = cleanup_resources_by_label('instance', self.instance_name, 'default')

        if not result['success']:
            # Log any errors that occurred during cleanup
            for error in result['errors']:
                logging.error(f"Cleanup error: {error}")

        # Additional cleanup for resources that might not have the instance label
        try:
            # Delete the flag secret directly since it might not have the instance label
            flag_secret_name = f"flag-secret-{self.instance_name}"
            logging.info(f"Ensuring deletion of Secret {flag_secret_name}")
            try:
                self.api_core_v1.delete_namespaced_secret(
                    name=flag_secret_name,
                    namespace="default"
                )
            except client.exceptions.ApiException as e:
                if e.status != 404:  # Ignore if secret doesn't exist
                    logging.error(f"Error deleting Secret {flag_secret_name}: {e}")
        except Exception as e:
            logging.error(f"Error during additional cleanup: {e}")
            result['success'] = False

        return result['success']


# Registry mapping challenge_type strings to Handler classes
# This dictionary will be dynamically populated during import
CHALLENGE_HANDLERS = {}

# Register the CTDBasedHandler for all supported challenge types
for challenge_type in get_handler_types():
    CHALLENGE_HANDLERS[challenge_type] = CTDBasedHandler
    logging.info(f"Registered CTDBasedHandler for challenge type: {challenge_type}")

# Allow plugins to register additional handlers
logging.info(f"Challenge handler types registered: {', '.join(CHALLENGE_HANDLERS.keys())}")
