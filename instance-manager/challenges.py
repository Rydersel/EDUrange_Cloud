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
    cleanup_resources_by_label, get_seccomp_profile_for_image, create_network_policy_from_definition
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
                logging.warning(
                    "Neither DOMAIN nor INGRESS_URL environment variable is set. Using default edurange.cloud")
                self.domain = "edurange.cloud"
            else:
                logging.info(f"Using INGRESS_URL as domain: {self.domain}")
        else:
            logging.info(f"Using DOMAIN environment variable: {self.domain}")
            
        # Debug: Log registry URL from environment
        self.registry_url = os.getenv("REGISTRY_URL")
        if self.registry_url:
            logging.info(f"[REGISTRY DEBUG] Using REGISTRY_URL: {self.registry_url}")
        else:
            logging.warning("[REGISTRY DEBUG] REGISTRY_URL environment variable is not set")

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
        if not self.type_config: # self.type_config comes from the challenge CDF
            logging.info("[DEBUG] _apply_type_config: No typeConfig provided in challenge CDF, skipping override application.")
            return resources

        # Get extension points from CTD (self.ctd_data comes from the default CTD file)
        extension_points = self.ctd_data.get('extensionPoints', {})
        logging.info(f"[DEBUG] _apply_type_config: Found {len(extension_points)} extension points defined in base CTD: {list(extension_points.keys())}")
        logging.info(f"[DEBUG] _apply_type_config: Challenge CDF typeConfig content: {self.type_config}")

        # Loop through the extension points defined in the BASE CTD
        applied_override = False
        for ext_key, ext_config in extension_points.items():
            # Check if the challenge CDF's typeConfig PROVIDES a value for this extension point
            logging.debug(f"[DEBUG] _apply_type_config: Checking extension point '{ext_key}'")
            if ext_key in self.type_config:
                override_value = self.type_config[ext_key]
                logging.info(f"[DEBUG] _apply_type_config: Found override for '{ext_key}' in typeConfig. Value: '{override_value}'")
                applied_override = True
                
                # Get the target container and property path from the BASE CTD's ext_config
                container_name = ext_config.get('container')
                property_path = ext_config.get('property', '').split('.')
                logging.debug(f"  Target container: '{container_name}', property path: {property_path}")

                if not container_name or not property_path or property_path == ['']:
                    logging.warning(f"  Skipping override for '{ext_key}' due to invalid container/property definition in base CTD extensionPoint.")
                    continue

                # Find the corresponding resource (Pod) in the generated list
                resource_found = False
                for resource in resources:
                    if resource.kind == 'Pod':
                        resource_found = True
                        container_found = False
                        # Find the target container within the Pod
                        if hasattr(resource.spec, 'containers') and resource.spec.containers:
                            for i, container in enumerate(resource.spec.containers):
                                if container.name == container_name:
                                    container_found = True
                                    logging.info(f"  Applying override for '{ext_key}' to container '{container_name}' in Pod '{resource.metadata.name}'")
                                    # Apply the extension using the VALUE from the challenge CDF's typeConfig
                                    self._apply_extension(container, property_path, override_value) # Pass the override value
                                    break # Found the container, move to next resource/extension point
                        if not container_found:
                            logging.warning(f"  Target container '{container_name}' not found in Pod '{resource.metadata.name}' spec.containers")
                if not resource_found:
                    logging.warning(f"  No Pod resources found in the list to apply override for '{ext_key}'")
            else:
                logging.debug(f"[DEBUG] _apply_type_config: No override found for '{ext_key}' in typeConfig.")
                
        if not applied_override:
            logging.info("[DEBUG] _apply_type_config: No matching extension points found between base CTD and challenge typeConfig. No overrides applied.")

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

        # --- Simplified handling for direct properties like 'image' --- 
        if len(property_path) == 1:
            prop = property_path[0]
            if prop == 'image':
                original_image = container.image if hasattr(container, 'image') else 'N/A'
                logging.info(f"[DEBUG] Applying image override: Container '{container.name}' image changing from '{original_image}' to '{value}'")
                container.image = value
                return # Handled
            elif prop == 'env':
                # Handle env vars specially
                if not isinstance(value, dict) or 'name' not in value:
                    logging.warning(f"Invalid env value format for extension: {value}")
                    return
                env_name_to_set = value.get('name')
                env_value_to_set = value.get('value')
                
                env_found = False
                if container.env: # Check if env list exists
                    for env_var in container.env:
                        if env_var.name == env_name_to_set:
                            logging.info(f"[DEBUG] Updating env var '{env_name_to_set}' in container '{container.name}' to value '{env_value_to_set}'")
                            env_var.value = env_value_to_set
                            env_found = True
                            break
                else: # Initialize env list if it doesn't exist
                    container.env = []
                    
                # If not found, add new env var
                if not env_found:
                    logging.info(f"[DEBUG] Adding new env var '{env_name_to_set}' with value '{env_value_to_set}' to container '{container.name}'")
                    container.env.append(client.V1EnvVar(
                        name=env_name_to_set,
                        value=env_value_to_set
                    ))
                return # Handled
            # Add other direct properties here if needed

        # --- Original logic for nested properties (keep as fallback if needed) --- 
        # current = container
        # for i, prop in enumerate(property_path):
        #     if i == len(property_path) - 1:
        #         # Last property in path, set the value
        #         # (Original logic for nested setting - might be needed for complex cases)
        #         # if hasattr(current, prop):
        #         #     setattr(current, prop, value)
        #         # else:
        #         #     logging.warning(f"Cannot set unknown property '{prop}' on {type(current)}")
        #         pass # Covered by simplified logic above for now
        #     else:
        #         # Navigate the property path
        #         if hasattr(current, prop):
        #             current = getattr(current, prop)
        #         else:
        #             logging.warning(f"Property path '{'.'.join(property_path)}' not found in container")
        #             return
        logging.warning(f"Unhandled property path in _apply_extension: {property_path}")

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
                
        # Create NetworkPolicies
        for policy_def in resolved_ctd.get('networkPolicies', []):
            try:
                network_policy = create_network_policy_from_definition(policy_def, self.instance_name)
                if network_policy:
                    resources.append(network_policy)
                    logging.info(f"Created NetworkPolicy from CTD for instance {self.instance_name}")
            except Exception as e:
                logging.error(f"Error creating NetworkPolicy from CTD: {e}")
                # Non-fatal - continue without network policy if it fails

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
                        # Resolve direct value if present
                        value=replace_template_variables(str(env.get('value')), self.resolved_variables) if 'value' in env else None,
                        # Resolve valueFrom if present (delegated to helper)
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

        # Check if pod has a security override in typeConfig
        security_override = self.type_config.get('securityContext', {})
        pod_security_override = security_override.get('pod', {})
        default_container_override = security_override.get('container', {})
        
        # Set container-level security contexts with possible overrides
        for idx, container in enumerate(containers):
            container_def = pod_template.get('containers', [])[idx]
            # Get container-specific security context override if present
            container_security = container_def.get('securityContext', {})
            
            # Merge the overrides with defaults, with container-specific overrides taking precedence
            run_as_non_root = container_security.get('runAsNonRoot', 
                             default_container_override.get('runAsNonRoot', True))
            
            run_as_user = container_security.get('runAsUser', 
                         default_container_override.get('runAsUser', 1000))
            
            run_as_group = container_security.get('runAsGroup', 
                          default_container_override.get('runAsGroup', 1000))
            
            allow_privilege_escalation = container_security.get('allowPrivilegeEscalation', 
                                                                default_container_override.get(
                                                                    'allowPrivilegeEscalation', False))
            
            # Only add capabilities if specified in config
            capabilities = None
            if 'capabilities' in container_security or 'capabilities' in default_container_override:
                capabilities_add = container_security.get('capabilities', {}).get('add', 
                                                                                  default_container_override.get(
                                                                                      'capabilities', {}).get('add',
                                                                                                              ["CHOWN",
                                                                                                               "SETGID",
                                                                                                               "SETUID"]))
                capabilities = client.V1Capabilities(add=capabilities_add)
            
            # Set security context with resolved values
            container.security_context = client.V1SecurityContext(
                seccomp_profile=client.V1SeccompProfile(
                    type="RuntimeDefault"  # Use the runtime default seccomp profile
                ),
                run_as_non_root=run_as_non_root,
                run_as_user=run_as_user,
                run_as_group=run_as_group,
                allow_privilege_escalation=allow_privilege_escalation,
                capabilities=capabilities
            )
            
            logging.info(f"Container {container.name} security context: "
                        f"runAsNonRoot={run_as_non_root}, "
                        f"runAsUser={run_as_user}, "
                        f"allowPrivilegeEscalation={allow_privilege_escalation}")

        # Set pod-level security context with possible overrides
        fs_group = pod_security_override.get('fsGroup', 1000)
        pod_run_as_user = pod_security_override.get('runAsUser', 1000)
        pod_run_as_group = pod_security_override.get('runAsGroup', 1000)
        
        security_context = client.V1PodSecurityContext(
            seccomp_profile=client.V1SeccompProfile(
                type="RuntimeDefault"  # Use the runtime default seccomp profile
            ),
            fs_group=fs_group,
            run_as_user=pod_run_as_user,
            run_as_group=pod_run_as_group
        )
        
        logging.info(
            f"Pod security context: fsGroup={fs_group}, runAsUser={pod_run_as_user}, runAsGroup={pod_run_as_group}")

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
        
        # Add annotations for HTTP/2 support
        if 'nginx.ingress.kubernetes.io/backend-protocol' not in annotations:
            annotations['nginx.ingress.kubernetes.io/backend-protocol'] = 'HTTP'
            
        # Remove websocket annotation as it conflicts with HTTP/2
        if 'nginx.ingress.kubernetes.io/websocket-services' in annotations:
            annotations.pop('nginx.ingress.kubernetes.io/websocket-services', None)
            
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
        """Deploy the challenge using the CTD template."""
        try:
            instance_name = self.instance_name
            logging.info(f"Deploying challenge for instance: {instance_name}")
            
            # Debug: Check registry values in environment at deployment time
            self._debug_registry_config()
            
            # Prepare variables for template substitution
            template_vars = self._prepare_template_variables()
            
            # Debug: Log template variables
            logging.info(f"[REGISTRY DEBUG] Template variables: {template_vars}")

            # Get Challenge Type Definition and resolve templates
            from challenge_utils.ctd_loader import resolve_ctd_template
            resolved_ctd = resolve_ctd_template(self.ctd_data, template_vars)
            
            # Debug: Log resolved CTD registry references
            self._debug_registry_references(resolved_ctd)

            # Create Kubernetes resources from the resolved CTD
            resources = self._convert_ctd_to_k8s_resources(resolved_ctd)
            logging.info(f"Created {len(resources)} resource definitions")

            # Apply type-specific configuration to resources
            resources = self._apply_type_config(resources)
            
            # Debug: Check final resource image references 
            self._debug_resource_images(resources)

            # Create Kubernetes resources
            created_resources = []
            for resource in resources:
                kind = resource.kind
                logging.info(f"Creating {kind} for instance {instance_name}")
                
                try:
                    # Logic to create different types of resources
                    if kind == "Pod":
                        # Debug: Check Pod container images before creation
                        for i, container in enumerate(resource.spec.containers):
                            logging.info(
                                f"[REGISTRY DEBUG] Final Pod container {i} ({container.name}): image = {container.image}")
                        
                        # Create Pod
                        self.api_core_v1.create_namespaced_pod(
                            namespace="default",
                            body=resource
                        )
                        created_resources.append({"kind": "Pod", "name": resource.metadata.name})
                    elif kind == "Service":
                        # Create Service
                        self.api_core_v1.create_namespaced_service(
                            namespace="default",
                            body=resource
                        )
                        created_resources.append({"kind": "Service", "name": resource.metadata.name})
                    elif kind == "Ingress":
                        # Create Ingress
                        self.api_networking_v1.create_namespaced_ingress(
                            namespace="default",
                            body=resource
                        )
                        created_resources.append({"kind": "Ingress", "name": resource.metadata.name})
                    elif kind == "NetworkPolicy":
                        # Create NetworkPolicy
                        self.api_networking_v1.create_namespaced_network_policy(
                            namespace="default",
                            body=resource
                        )
                        created_resources.append({"kind": "NetworkPolicy", "name": resource.metadata.name})
                        logging.info(f"Created NetworkPolicy {resource.metadata.name}")
                    else:
                        logging.warning(f"Unsupported resource kind: {kind}")
                        continue
                        
                    logging.info(f"Created {kind} {resource.metadata.name}")
                    
                except Exception as e:
                    logging.error(f"Error creating {kind}: {e}")
                    # Clean up previously created resources
                    self.cleanup()
                    return {
                        "success": False, 
                        "error": f"Failed to create {kind}: {str(e)}"
                    }

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

    def _debug_registry_config(self):
        """Debug helper to check registry configuration"""
        logging.info("[REGISTRY DEBUG] ============ Registry Configuration Debug ============")
        
        # Check environment variables
        registry_url = os.getenv("REGISTRY_URL")
        logging.info(f"[REGISTRY DEBUG] REGISTRY_URL env: {registry_url}")
        
        # Check webos-environment ConfigMap
        try:
            configmap = self.api_core_v1.read_namespaced_config_map(
                name="webos-environment",
                namespace="default"
            )
            if configmap and configmap.data:
                if "REGISTRY_URL" in configmap.data:
                    logging.info(
                        f"[REGISTRY DEBUG] webos-environment ConfigMap REGISTRY_URL: {configmap.data['REGISTRY_URL']}")
                else:
                    logging.info("[REGISTRY DEBUG] webos-environment ConfigMap exists but doesn't contain REGISTRY_URL")
        except Exception as e:
            logging.info(f"[REGISTRY DEBUG] Error getting webos-environment ConfigMap: {e}")
        
        # Check which registry values will be respected
        registry_to_use = registry_url or "registry.edurange.cloud/edurange"
        logging.info(f"[REGISTRY DEBUG] Registry URL that will be used: {registry_to_use}")
        logging.info("[REGISTRY DEBUG] =====================================================")
    
    def _debug_registry_references(self, ctd_data):
        """Debug helper to check registry URLs in CTD data"""
        logging.info("[REGISTRY DEBUG] ============ CTD Registry References ============")
        
        # Check pods
        if 'podTemplate' in ctd_data and 'containers' in ctd_data['podTemplate']:
            for i, container in enumerate(ctd_data['podTemplate']['containers']):
                if 'image' in container:
                    logging.info(
                        f"[REGISTRY DEBUG] Container {i} ({container.get('name', 'unnamed')}): image = {container['image']}")
        
        # Check extension points
        if 'extensionPoints' in ctd_data:
            for ext_name, ext_config in ctd_data['extensionPoints'].items():
                logging.info(f"[REGISTRY DEBUG] Extension point: {ext_name}, config: {ext_config}")
        
        logging.info("[REGISTRY DEBUG] ================================================")
    
    def _debug_resource_images(self, resources):
        """Debug helper to check images in k8s resources"""
        logging.info("[REGISTRY DEBUG] ============ K8S Resource Images ============")
        
        for resource in resources:
            if hasattr(resource, 'kind') and resource.kind == 'Pod':
                if hasattr(resource.spec, 'containers'):
                    for i, container in enumerate(resource.spec.containers):
                        if hasattr(container, 'image'):
                            logging.info(
                                f"[REGISTRY DEBUG] Pod {resource.metadata.name} container {i} ({container.name}): image = {container.image}")
        
        logging.info("[REGISTRY DEBUG] =============================================")


# Registry mapping challenge_type strings to Handler classes
# This dictionary will be dynamically populated during import
CHALLENGE_HANDLERS = {}


# Create RedBlueHandler specialized for red-blue challenges
class RedBlueHandler(CTDBasedHandler):
    """Handler for Red-Blue challenges with shared defender containers."""

    def __init__(self, user_id, cdf_data, competition_id, deployment_name):
        super().__init__(user_id, cdf_data, competition_id, deployment_name)
        self.defender_name = f"defense-{competition_id}"
        self.defender_service_name = f"defense-service-{competition_id}"
        self.defender_exists = self._check_defender_exists()
        logging.info(f"RedBlueHandler initialized for instance {deployment_name}, competition {competition_id}")
        logging.info(f"Defender pod exists: {self.defender_exists}")

    def _check_defender_exists(self):
        """Check if the shared defender pod already exists for this competition."""
        try:
            pod = self.api_core_v1.read_namespaced_pod(
                name=self.defender_name,
                namespace="default"
            )
            if pod.status.phase == 'Running':
                logging.info(f"Defender pod {self.defender_name} exists and is running")
                return True
            elif pod.status.phase == 'Pending':
                logging.info(f"Defender pod {self.defender_name} exists but is still in Pending state")
                return True
            else:
                logging.warning(f"Defender pod {self.defender_name} exists but is in state: {pod.status.phase}")
                return False
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logging.info(f"Defender pod {self.defender_name} does not exist")
                return False
            else:
                logging.error(f"Error checking defender pod: {e}")
                return False

    def _prepare_template_variables(self):
        """Prepare variables for template substitution including defender-specific ones."""
        variables = super()._prepare_template_variables()

        # Add variables specific to the RedBlue challenge type
        variables["DEFENDER_NAME"] = self.defender_name
        variables["DEFENDER_SERVICE_NAME"] = self.defender_service_name
        variables["DEFENDER_EXISTS"] = str(self.defender_exists).lower()

        return variables

    def _deploy_defender_if_needed(self):
        """Deploy the defender pod, service, and ingress if they don't already exist, applying typeConfig overrides."""
        if self.defender_exists:
            logging.info(f"Shared defender pod {self.defender_name} already exists, skipping creation")
            return True

        try:
            logging.info(f"Creating shared defender resources for competition {self.competition_id}")

            # Get the defender template from the loaded and resolved CTD data
            if 'defenderTemplate' not in self.ctd_data:
                logging.error("defenderTemplate section missing from CTD")
                return False
            
            defender_template = self.ctd_data['defenderTemplate']
            defender_resources_to_create = [] # List to hold generated K8s objects before applying typeConfig
            
            # --- Generate defender pod object --- 
            if 'pod' in defender_template:
                pod_spec_template = defender_template['pod']
                resolved_pod_name = replace_template_variables(pod_spec_template.get('name', self.defender_name), self.resolved_variables)
                resolved_pod_labels = {
                    sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(v, self.resolved_variables)) 
                    for k, v in pod_spec_template.get('labels', {}).items()
                }
                resolved_containers = []
                for container_template in pod_spec_template.get('containers', []):
                    resolved_image = replace_template_variables(container_template.get('image'), self.resolved_variables)
                    resolved_env = []
                    for env_template in container_template.get('env', []):
                        value = env_template.get('value')
                        value_from = env_template.get('valueFrom')
                        resolved_value = replace_template_variables(value, self.resolved_variables) if value else None
                        resolved_value_from = self._parse_env_value_from(replace_template_variables(value_from, self.resolved_variables)) if value_from else None
                        resolved_env.append(client.V1EnvVar(name=env_template.get('name'), value=resolved_value, value_from=resolved_value_from))
                    resolved_containers.append(client.V1Container(
                        name=container_template.get('name'),
                        image=resolved_image,
                        ports=[client.V1ContainerPort(container_port=p.get('containerPort'), name=p.get('name'), protocol=p.get('protocol', 'TCP')) for p in container_template.get('ports', [])],
                        env=resolved_env
                    ))
                pod = client.V1Pod(
                    api_version="v1", kind="Pod",
                    metadata=client.V1ObjectMeta(name=resolved_pod_name, labels=resolved_pod_labels),
                    spec=client.V1PodSpec(containers=resolved_containers, restart_policy="Always")
                )
                defender_resources_to_create.append(pod)
            
            # --- Generate service object --- 
            if 'service' in defender_template:
                service_spec_template = defender_template['service']
                resolved_service_name = replace_template_variables(service_spec_template.get('name', self.defender_service_name), self.resolved_variables)
                resolved_service_labels = {sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(v, self.resolved_variables)) for k, v in service_spec_template.get('labels', {}).items()}
                service = client.V1Service(
                    api_version="v1", kind="Service",
                    metadata=client.V1ObjectMeta(name=resolved_service_name, labels=resolved_service_labels),
                    spec=client.V1ServiceSpec(
                        selector=resolved_pod_labels, # Selects the defender pod using its resolved labels
                        ports=[client.V1ServicePort(port=p.get('port'), target_port=p.get('targetPort'), name=p.get('name'), protocol=p.get('protocol', 'TCP')) for p in service_spec_template.get('ports', [])],
                        type="ClusterIP"
                    )
                )
                defender_resources_to_create.append(service)
            
            # --- Generate ingress object --- 
            if 'ingress' in defender_template:
                ingress_spec_template = defender_template['ingress']
                resolved_ingress_name = replace_template_variables(ingress_spec_template.get('name', f"defender-ingress-{self.competition_id}"), self.resolved_variables)
                resolved_ingress_labels = {sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(v, self.resolved_variables)) for k, v in ingress_spec_template.get('labels', {}).items()}
                resolved_rules = []
                for rule_template in ingress_spec_template.get('rules', []):
                    resolved_host = replace_template_variables(rule_template.get('host', ''), self.resolved_variables)
                    http_paths = []
                    for path_template in rule_template.get('http', {}).get('paths', []):
                        backend_service_name = replace_template_variables(path_template.get('backend', {}).get('service', {}).get('name', ''), self.resolved_variables)
                        backend_port_number = path_template.get('backend', {}).get('service', {}).get('port', {}).get('number')
                        http_paths.append(client.V1HTTPIngressPath(
                            path=path_template.get('path', '/'), path_type=path_template.get('pathType', 'ImplementationSpecific'),
                            backend=client.V1IngressBackend(service=client.V1IngressServiceBackend(name=backend_service_name, port=client.V1ServiceBackendPort(number=backend_port_number)))
                        ))
                    resolved_rules.append(client.V1IngressRule(host=resolved_host, http=client.V1HTTPIngressRuleValue(paths=http_paths)))
                resolved_tls = []
                for tls_template in ingress_spec_template.get('tls', []):
                    resolved_tls_hosts = [replace_template_variables(h, self.resolved_variables) for h in tls_template.get('hosts', [])]
                    resolved_secret_name = replace_template_variables(tls_template.get('secretName', ''), self.resolved_variables)
                    resolved_tls.append(client.V1IngressTLS(hosts=resolved_tls_hosts, secret_name=resolved_secret_name))
                ingress = client.V1Ingress(
                    api_version="networking.k8s.io/v1", kind="Ingress",
                    metadata=client.V1ObjectMeta(name=resolved_ingress_name, labels=resolved_ingress_labels, annotations={
                        "nginx.ingress.kubernetes.io/use-regex": "true",
                        "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600",
                        "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600",
                        "nginx.ingress.kubernetes.io/proxy-connect-timeout": "3600"
                    }),
                    spec=client.V1IngressSpec(ingress_class_name="nginx", rules=resolved_rules, tls=resolved_tls)
                )
                defender_resources_to_create.append(ingress)

            # --- Apply typeConfig overrides --- 
            # Apply overrides BEFORE creating the resources in K8s
            logging.info(f"Applying typeConfig overrides to {len(defender_resources_to_create)} defender resources.")
            logging.info(f"[DEBUG] typeConfig before applying: {self.type_config}") 
            modified_defender_resources = self._apply_type_config(defender_resources_to_create) # Use the base class method
            
            # ----> ADD LOGGING HERE <----
            logging.info(f"[DEBUG] Checking defender resources after applying typeConfig:")
            for res in modified_defender_resources:
                if hasattr(res, 'kind') and res.kind == 'Pod' and hasattr(res.spec, 'containers'):
                    for cont in res.spec.containers:
                        if cont.name == 'defense-container':
                            logging.info(f"  [DEBUG] Defender Pod '{res.metadata.name}' -> Container '{cont.name}' -> Image: {cont.image}")
            
            # --- Create resources in Kubernetes --- 
            for resource in modified_defender_resources:
                kind = resource.kind
                name = resource.metadata.name
                try:
                    if kind == "Pod":
                        self.api_core_v1.create_namespaced_pod(namespace="default", body=resource)
                        logging.info(f"Created defender pod {name}")
                    elif kind == "Service":
                        self.api_core_v1.create_namespaced_service(namespace="default", body=resource)
                        logging.info(f"Created defender service {name}")
                    elif kind == "Ingress":
                        self.api_networking_v1.create_namespaced_ingress(namespace="default", body=resource)
                        logging.info(f"Created defender ingress {name}")
                    # Add other defender resource types if needed
                except client.exceptions.ApiException as e:
                    if e.status == 409: # Conflict - resource already exists
                        logging.warning(f"Defender resource {kind} {name} already exists, skipping creation.")
                    else:
                        logging.error(f"Error creating defender resource {kind} {name}: {e}")
                        raise # Re-raise other API errors
                except Exception as e:
                     logging.error(f"Unexpected error creating defender resource {kind} {name}: {e}")
                     raise

            # Mark defender as existing now
            self.defender_exists = True
            return True
        except Exception as e:
            logging.error(f"Error deploying defender resources: {e}")
            # Attempt cleanup of any partially created defender resources
            try:
                from challenge_utils.k8s_resources import cleanup_resources_by_label
                # Be careful with cleanup - only target specific resources if possible
                # Using competition_id label might be too broad if other things use it
                logging.warning(f"Attempting cleanup of potentially partial defender resources for competition {self.competition_id}")
                # Consider a more targeted cleanup if necessary
                # cleanup_resources_by_label('competition_id', sanitize_k8s_label(self.competition_id), 'default', roles=['defender']) # Original attempt - risky?
            except Exception as cleanup_e:
                logging.error(f"Error cleaning up partial defender resources: {cleanup_e}")
            return False

    def deploy(self):
        """Deploy the challenge with shared defender."""
        try:
            # --- Step 1: Prepare variables --- 
            # This needs to happen before defender deployment to resolve names/labels
            template_vars = self._prepare_template_variables()
            logging.info(f"Prepared template variables for RedBlueHandler deployment")

            # --- Step 2: Deploy defender resources if needed --- 
            if not self._deploy_defender_if_needed():
                # Error logged within the function
                return {
                    "success": False,
                    "error": "Failed to deploy shared defender resources"
                }
            
            # --- Step 3: Deploy attacker-specific resources using base class logic --- 
            # (Adapted from CTDBasedHandler.deploy, skipping variable prep)
            instance_name = self.instance_name
            logging.info(f"Deploying attacker resources for instance: {instance_name}")

            # Get Challenge Type Definition (already loaded in self.ctd_data)
            # Use the resolved variables (self.resolved_variables) which were prepared in Step 1
            from challenge_utils.ctd_loader import resolve_ctd_template # Still needed for parsing template within _convert method
            
            # Create Kubernetes resource objects for the attacker based on the MAIN CTD template sections
            # (podTemplate, services, ingress) - defenderTemplate is handled separately.
            attacker_resource_definitions = self._convert_ctd_to_k8s_resources(self.ctd_data) 
            logging.info(f"Generated {len(attacker_resource_definitions)} K8s objects for attacker instance based on CTD templates.")
            
            # Log images BEFORE applying typeConfig
            logging.info("[DEBUG] Attacker resources BEFORE typeConfig apply:")
            self._debug_resource_images(attacker_resource_definitions)

            # Apply type-specific configuration FROM THE CHALLENGE CDF (self.type_config) to these objects
            logging.info(f"[DEBUG] Applying typeConfig to attacker resources: {self.type_config}")
            attacker_resources_modified = self._apply_type_config(attacker_resource_definitions)
            logging.info(f"Applied typeConfig to {len(attacker_resources_modified)} attacker resources.")
            
            # Log images AFTER applying typeConfig
            logging.info("[DEBUG] Attacker resources AFTER typeConfig apply:")
            self._debug_resource_images(attacker_resources_modified)

            # Create Kubernetes resources for the attacker instance
            created_resources = []
            for resource in attacker_resources_modified: # Use the modified list
                kind = resource.kind
                try:
                    # Logic to create different types of resources
                    if kind == "Pod":
                        # Make sure not to recreate the defender pod if it exists
                        if hasattr(resource.metadata, 'labels') and resource.metadata.labels.get('role') == 'defender':
                           logging.info(f"Skipping creation of defender object {kind} {resource.metadata.name} during attacker deployment")
                           continue 
                        if hasattr(resource.metadata, 'name') and resource.metadata.name == self.defender_name:
                           logging.info(f"Skipping creation of defender pod {self.defender_name} by name match")
                           continue 
                        
                        # Debug: Check Pod container images before creation (should reflect override now)
                        logging.info(f"Creating Pod {resource.metadata.name} for attacker instance.")
                        for i, container in enumerate(resource.spec.containers):
                            logging.info(f"  Container {i} ({container.name}): image = {container.image}")
                        
                        self.api_core_v1.create_namespaced_pod(namespace="default", body=resource)
                        created_resources.append({"kind": "Pod", "name": resource.metadata.name})
                    elif kind == "Service":
                         # Make sure not to recreate the defender service if it exists
                        if hasattr(resource.metadata, 'labels') and resource.metadata.labels.get('role') == 'defender':
                           logging.info(f"Skipping creation of defender object {kind} {resource.metadata.name} during attacker deployment")
                           continue
                        if hasattr(resource.metadata, 'name') and resource.metadata.name == self.defender_service_name:
                           logging.info(f"Skipping creation of defender service {self.defender_service_name} by name match")
                           continue
                           
                        logging.info(f"Creating Service {resource.metadata.name} for attacker instance.")
                        self.api_core_v1.create_namespaced_service(namespace="default", body=resource)
                        created_resources.append({"kind": "Service", "name": resource.metadata.name})
                    elif kind == "Ingress":
                        # Make sure not to recreate the defender ingress if it exists
                        defender_ingress_name = replace_template_variables(f"defender-ingress-{self.competition_id}", self.resolved_variables)
                        if hasattr(resource.metadata, 'labels') and resource.metadata.labels.get('role') == 'defender':
                            logging.info(f"Skipping creation of defender object {kind} {resource.metadata.name} during attacker deployment")
                            continue
                        if hasattr(resource.metadata, 'name') and resource.metadata.name == defender_ingress_name:
                           logging.info(f"Skipping creation of defender ingress {defender_ingress_name} by name match")
                           continue
                           
                        logging.info(f"Creating Ingress {resource.metadata.name} for attacker instance.")
                        self.api_networking_v1.create_namespaced_ingress(namespace="default", body=resource)
                        created_resources.append({"kind": "Ingress", "name": resource.metadata.name})
                    elif kind == "NetworkPolicy":
                        # Network policies might need special handling or be competition-wide
                        # Check if the policy already exists before creating?
                        policy_name = resource.metadata.name
                        try:
                            self.api_networking_v1.read_namespaced_network_policy(name=policy_name, namespace="default")
                            logging.info(f"NetworkPolicy {policy_name} already exists, skipping creation.")
                        except client.exceptions.ApiException as e:
                            if e.status == 404:
                                logging.info(f"Creating NetworkPolicy {policy_name}")
                                self.api_networking_v1.create_namespaced_network_policy(namespace="default", body=resource)
                                created_resources.append({"kind": "NetworkPolicy", "name": policy_name})
                            else:
                                logging.error(f"API error checking NetworkPolicy {policy_name}: {e}")
                                raise # Re-raise other API errors
                    else:
                        logging.warning(f"Unsupported resource kind during attacker deployment: {kind}")
                        continue
                except Exception as e:
                    logging.error(f"Error creating {kind} for attacker instance: {e}")
                    # Clean up attacker resources if creation fails
                    self.cleanup() # Use the RedBlueHandler cleanup which preserves defender
                    return {
                        "success": False, 
                        "error": f"Failed to create {kind} for attacker: {str(e)}"
                    }

            # Store created resources for potential cleanup
            self.created_resources.extend(created_resources) # Use extend to add to existing list

            # Wait for resources to be ready
            logging.info(f"Waiting for attacker resources to be ready for instance {self.instance_name}")
            # Could implement resource status checks here

            # Calculate URLs
            domain = self.domain
            webos_url = f"https://{self.instance_name}.{domain}"
            web_challenge_url = None # RedBlue might not have a specific web challenge URL
            defender_url = f"https://defense-{self.competition_id}.{domain}"
            
            logging.info(f"RedBlue Challenge deployed successfully for instance {self.instance_name}")
            logging.info(f"WebOS URL: {webos_url}")
            logging.info(f"Defender URL: {defender_url}")
            
            return {
                "success": True,
                "deployment_name": self.instance_name,
                "webosUrl": webos_url,  
                "webChallengeUrl": web_challenge_url, # May be null for RedBlue
                "defenderUrl": defender_url, # Add defender URL
                "flag_secret_name": self.flag_secret_name,
                "flags": self.flags,
                "status": "running"
            }

        except Exception as e:
            logging.exception(f"Error in RedBlueHandler.deploy: {e}")
            # Attempt cleanup
            self.cleanup()
            return {
                "success": False,
                "error": str(e)
            }

    def cleanup(self):
        """Clean up resources but preserve the shared defender."""
        try:
            # Only clean up attacker-specific resources, not the shared defender
            from challenge_utils.k8s_resources import cleanup_resources_by_label

            # Use label selector to only clean up this specific instance
            result = cleanup_resources_by_label('instance', self.instance_name, 'default')

            logging.info(f"Cleaned up attacker resources for instance {self.instance_name}")
            logging.info(f"Preserved shared defender {self.defender_name} for competition {self.competition_id}")

            if not result['success']:
                # Log any errors that occurred during cleanup
                for error in result['errors']:
                    logging.error(f"Cleanup error: {error}")

            return result['success']
        except Exception as e:
            logging.error(f"Error during RedBlueHandler cleanup: {e}")
            return False


# Register the RedBlueHandler for the "redblue" challenge type
CHALLENGE_HANDLERS["redblue"] = RedBlueHandler
logging.info("Registered RedBlueHandler for challenge type: redblue")

# Register the CTDBasedHandler for all supported challenge types except redblue
for challenge_type in get_handler_types():
    if challenge_type != "redblue" and challenge_type not in CHALLENGE_HANDLERS:
        CHALLENGE_HANDLERS[challenge_type] = CTDBasedHandler
        logging.info(f"Registered CTDBasedHandler for challenge type: {challenge_type}")

# Allow plugins to register additional handlers
logging.info(f"Challenge handler types registered: {', '.join(CHALLENGE_HANDLERS.keys())}")
