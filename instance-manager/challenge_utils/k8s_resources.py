"""
Kubernetes resource management utilities for EDURange challenges.
This module contains common functions for creating, managing, and cleaning up
Kubernetes resources used by the EDURange challenge system.
"""

import logging
import re
import os
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from kubernetes.stream import stream
from kubernetes.config import load_kube_config, load_incluster_config, ConfigException

def sanitize_k8s_label(value):
    """
    Sanitize a string for use as a Kubernetes label value.

    Args:
        value: The raw value to sanitize

    Returns:
        A sanitized string suitable for use as a Kubernetes label value
    """
    # Replace invalid chars with dashes
    sanitized = re.sub(r'[^a-zA-Z0-9._-]', '-', str(value))

    # Ensure the value doesn't start or end with a special char
    sanitized = re.sub(r'^[^a-zA-Z0-9]', '', sanitized)
    sanitized = re.sub(r'[^a-zA-Z0-9]$', '', sanitized)

    # Truncate to 63 chars (K8s limit)
    if len(sanitized) > 63:
        sanitized = sanitized[:63]

    # Default if the result is empty
    if not sanitized:
        sanitized = "unknown"

    logging.debug(f"Sanitized label value: '{value}' → '{sanitized}'")
    return sanitized

def replace_template_variables(template_string, variables_map):
    """
    Replace template variables in a string.

    Args:
        template_string: The string containing template variables like {{VAR_NAME}}
        variables_map: Dictionary mapping variable names to their values

    Returns:
        The string with variables replaced
    """
    if not isinstance(template_string, str):
        return template_string

    # Pre-process for common patterns like {{INSTANCE_NAME}}.{{DOMAIN}}
    # First look for this specific pattern and replace it
    if "{{INSTANCE_NAME}}.{{DOMAIN}}" in template_string:
        if "INSTANCE_NAME.DOMAIN" in variables_map:
            template_string = template_string.replace(
                "{{INSTANCE_NAME}}.{{DOMAIN}}",
                str(variables_map["INSTANCE_NAME.DOMAIN"])
            )
        elif "INSTANCE_NAME" in variables_map and "DOMAIN" in variables_map:
            # Fallback to joining individual variables
            joined_value = f"{variables_map['INSTANCE_NAME']}.{variables_map['DOMAIN']}"
            template_string = template_string.replace(
                "{{INSTANCE_NAME}}.{{DOMAIN}}",
                joined_value
            )

    # Now process any remaining template variables with the standard pattern
    def replace_var(match):
        var_name = match.group(1).strip()
        if var_name in variables_map:
            return str(variables_map[var_name])
        else:
            logging.warning(f"Template variable {var_name} not found in variables map")
            return match.group(0)  # Return the original template string

    # Replace all occurrences of standard template variables
    pattern = r"{{([^{}]+)}}"
    return re.sub(pattern, replace_var, template_string)

def cleanup_resources_by_label(label_key, label_value, namespace="default"):
    """
    Cleanup all Kubernetes resources matching a label selector.

    Args:
        label_key: The label key to match (e.g., 'app')
        label_value: The label value to match
        namespace: The Kubernetes namespace

    Returns:
        dict: Status information about the cleanup
    """
    label_selector = f"{label_key}={label_value}"
    success = True
    deleted_kinds = set()
    deletion_errors = []

    try:
        api_core_v1 = client.CoreV1Api()
        api_networking_v1 = client.NetworkingV1Api()
        api_apps_v1 = client.AppsV1Api()  # For Deployments/StatefulSets/etc

        # Define deletion order and functions
        resource_finders = [
            (api_networking_v1.list_namespaced_ingress, api_networking_v1.delete_namespaced_ingress, "Ingress"),
            (api_core_v1.list_namespaced_service, api_core_v1.delete_namespaced_service, "Service"),
            (api_core_v1.list_namespaced_pod, api_core_v1.delete_namespaced_pod, "Pod"),
            (api_core_v1.list_namespaced_config_map, api_core_v1.delete_namespaced_config_map, "ConfigMap"),
            (api_core_v1.list_namespaced_secret, api_core_v1.delete_namespaced_secret, "Secret"),
            (api_apps_v1.list_namespaced_deployment, api_apps_v1.delete_namespaced_deployment, "Deployment"),
            (api_apps_v1.list_namespaced_stateful_set, api_apps_v1.delete_namespaced_stateful_set, "StatefulSet"),
        ]

        for list_func, delete_func, kind in resource_finders:
            try:
                resources = list_func(namespace=namespace, label_selector=label_selector)
                if resources.items:
                    logging.info(f"Found {len(resources.items)} {kind}(s) with label '{label_selector}' to delete.")
                    deleted_kinds.add(kind)
                    for resource in resources.items:
                        res_name = resource.metadata.name
                        try:
                            logging.info(f"Deleting {kind} '{res_name}'...")
                            # Use foreground propagation for dependent resources
                            delete_options = client.V1DeleteOptions(propagation_policy='Foreground')
                            delete_func(name=res_name, namespace=namespace, body=delete_options)
                            logging.info(f"Successfully initiated deletion for {kind} '{res_name}'.")
                        except ApiException as e:
                            if e.status == 404:
                                logging.warning(f"{kind} '{res_name}' not found during deletion (already deleted?).")
                            else:
                                error_msg = f"Error deleting {kind} '{res_name}': {e.reason} ({e.status}) - {e.body}"
                                logging.error(error_msg)
                                deletion_errors.append(error_msg)
                                success = False
                        except Exception as e:
                            error_msg = f"Unexpected error deleting {kind} '{res_name}': {e}"
                            logging.error(error_msg)
                            deletion_errors.append(error_msg)
                            success = False
                else:
                    logging.info(f"No {kind}(s) found with label '{label_selector}'.")

            except ApiException as e:
                logging.error(f"Error listing {kind}s with label '{label_selector}': {e.reason}")
                # Don't mark as failure if listing fails, maybe resource type doesn't exist? Or RBAC issue?
            except Exception as e:
                logging.error(f"Unexpected error listing {kind}s: {e}")
                # Don't mark as failure here either

    except Exception as e:
        error_msg = f"Unexpected error during cleanup process for '{label_value}': {e}"
        logging.exception(error_msg)
        deletion_errors.append(error_msg)
        success = False

    return {
        "success": success,
        "deleted_kinds": list(deleted_kinds),
        "errors": deletion_errors
    }

def get_pod_status(pod):
    """
    Get the status of a pod in a standard format.

    Args:
        pod: A V1Pod object

    Returns:
        str: One of 'CREATING', 'ACTIVE', 'TERMINATING', 'ERROR'
    """
    if pod.metadata.deletion_timestamp:  # Work around for deleting status not showing up
        return 'TERMINATING'
    elif pod.status.phase == 'Pending':
        return 'CREATING'
    elif pod.status.phase == 'Running':
        return 'ACTIVE'
    elif pod.status.phase == 'Failed':
        return 'ERROR'
    elif pod.status.phase == 'Succeeded':
        return 'ACTIVE'
    else:
        return 'ERROR'  # Default to ERROR for unknown states

def execute_in_pod(pod_name, namespace, command, container=None):
    """
    Execute a command inside a pod and return the result.

    Args:
        pod_name: Name of the pod
        namespace: Kubernetes namespace
        command: Command to execute (as a list)
        container: Container name (optional)

    Returns:
        str: Command output
    """
    v1 = client.CoreV1Api()

    exec_command = ["/bin/sh", "-c", command] if isinstance(command, str) else command

    try:
        kwargs = {
            'name': pod_name,
            'namespace': namespace,
            'command': exec_command,
            'stderr': True,
            'stdin': False,
            'stdout': True,
            'tty': False
        }

        if container:
            kwargs['container'] = container

        return stream(v1.connect_get_namespaced_pod_exec, **kwargs)
    except Exception as e:
        logging.error(f"Error executing command in pod '{pod_name}': {e}")
        raise

def get_seccomp_profile_for_image(image_name):
    """
    Check if a seccomp profile exists for the given image.

    Args:
        image_name (str): Full image name (e.g., registry.edurange.cloud/edurange/webos)

    Returns:
        str: Seccomp profile name in Kubernetes format
    """
    # Extract the image name without registry and tag
    image_parts = image_name.split('/')
    base_image = image_parts[-1].split(':')[0]

    # Check in the seccomp profiles directory
    seccomp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'seccomp_profiles')
    profile_path = os.path.join(seccomp_dir, f"{base_image}.json")

    if os.path.exists(profile_path):
        logging.info(f"Found seccomp profile for {image_name}")
        # Return the profile in Kubernetes format
        return f"runtime/default"

    logging.info(f"No seccomp profile found for {image_name}")
    return None

def list_pods(namespace="default", label_selector=None):
    """
    List all pods in a namespace, optionally filtered by label selector.

    Args:
        namespace (str): Kubernetes namespace
        label_selector (str): Optional label selector to filter pods

    Returns:
        list: List of V1Pod objects
    """
    logging.info(f"Listing pods in namespace '{namespace}' with label selector: {label_selector}")
    try:
        v1 = client.CoreV1Api()
        logging.info("Successfully created Kubernetes API client")

        if label_selector:
            logging.info(f"Listing pods with label selector: {label_selector}")
            pods = v1.list_namespaced_pod(namespace=namespace, label_selector=label_selector)
        else:
            logging.info("Listing all pods in namespace")
            pods = v1.list_namespaced_pod(namespace=namespace)

        logging.info(f"Found {len(pods.items)} pods")
        for pod in pods.items:
            logging.info(f"Pod: {pod.metadata.name} - Labels: {pod.metadata.labels}")
        return pods.items

    except ApiException as e:
        logging.error(f"Kubernetes API error listing pods in namespace {namespace}: {e.status} - {e.reason}")
        if hasattr(e, 'body'):
            logging.error(f"API response body: {e.body}")
        return []
    except Exception as e:
        logging.error(f"Unexpected error listing pods: {str(e)}")
        return []

def list_pods_by_label(label_key, label_value, namespace="default"):
    """
    List pods with a specific label

    Args:
        label_key (str): The label key to match
        label_value (str): The label value to match
        namespace (str): The Kubernetes namespace

    Returns:
        list: List of V1Pod objects matching the label
    """
    try:
        v1 = client.CoreV1Api()
        label_selector = f"{label_key}={label_value}"
        pods = v1.list_namespaced_pod(namespace=namespace, label_selector=label_selector)
        return pods.items
    except ApiException as e:
        logging.error(f"API error listing pods by label: {e}")
        return []
    except Exception as e:
        logging.error(f"Error listing pods by label: {e}")
        return []

def delete_pod_force(pod_name, namespace="default"):
    """
    Force delete a pod with 0 grace period

    Args:
        pod_name (str): The name of the pod to delete
        namespace (str): The Kubernetes namespace

    Returns:
        bool: True if successful, False otherwise

    Raises:
        ApiException: If API call fails
    """
    try:
        v1 = client.CoreV1Api()
        # Set grace period to 0 for immediate deletion
        delete_options = client.V1DeleteOptions(grace_period_seconds=0)
        v1.delete_namespaced_pod(name=pod_name, namespace=namespace, body=delete_options)
        logging.info(f"Force deleted pod {pod_name}")
        return True
    except ApiException as e:
        if e.status == 404:
            # Pod already gone, consider success
            return True
        logging.error(f"API error force deleting pod {pod_name}: {e}")
        raise
    except Exception as e:
        logging.error(f"Error force deleting pod {pod_name}: {e}")
        raise

def create_service(name, namespace, app_label, selector, ports, service_type="ClusterIP", annotations=None):
    """
    Create a Kubernetes service.

    Args:
        name (str): Service name
        namespace (str): Kubernetes namespace
        app_label (str): Application label for service metadata
        selector (dict): Labels to select the pods to target 
        ports (list): List of dicts with port configuration (port, target_port, protocol)
        service_type (str): Service type (ClusterIP, NodePort, LoadBalancer)
        annotations (dict): Optional annotations for the service

    Returns:
        object: Created service object
    
    Raises:
        ApiException: If API call fails
    """
    try:
        v1 = client.CoreV1Api()
        
        # Prepare ports list
        service_ports = []
        for port_config in ports:
            port = port_config.get("port")
            target_port = port_config.get("target_port", port)
            protocol = port_config.get("protocol", "TCP")
            name = port_config.get("name", f"port-{port}")
            
            service_ports.append(
                client.V1ServicePort(
                    port=port,
                    target_port=target_port,
                    protocol=protocol,
                    name=name
                )
            )
        
        # Prepare service spec
        service_spec = client.V1ServiceSpec(
            selector=selector,
            ports=service_ports,
            type=service_type
        )
        
        # Prepare metadata
        metadata = client.V1ObjectMeta(
            name=name,
            namespace=namespace,
            labels={"app": app_label}
        )
        
        # Add annotations if provided
        if annotations:
            metadata.annotations = annotations
        
        # Create service body
        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=metadata,
            spec=service_spec
        )
        
        # Create the service
        created_service = v1.create_namespaced_service(
            namespace=namespace,
            body=service
        )
        
        logging.info(f"Created service {name} in namespace {namespace}")
        return created_service
        
    except ApiException as e:
        logging.error(f"API error creating service {name}: {e}")
        raise
    except Exception as e:
        logging.error(f"Error creating service {name}: {e}")
        raise

def create_ingress(name, namespace, app_label, rules, annotations=None, tls=None):
    """
    Create a Kubernetes ingress resource.

    Args:
        name (str): Ingress name
        namespace (str): Kubernetes namespace
        app_label (str): Application label
        rules (list): List of ingress rules, each containing host and list of paths
        annotations (dict): Optional annotations for the ingress
        tls (list): Optional TLS configuration

    Returns:
        object: Created ingress object
    
    Raises:
        ApiException: If API call fails
    """
    try:
        networking_v1 = client.NetworkingV1Api()
        
        # Prepare metadata
        metadata = client.V1ObjectMeta(
            name=name,
            namespace=namespace,
            labels={"app": app_label}
        )
        
        # Add annotations if provided
        if annotations:
            metadata.annotations = annotations
        
        # Prepare ingress rules
        ingress_rules = []
        for rule in rules:
            host = rule.get("host")
            paths = rule.get("paths", [])
            
            http_paths = []
            for path_config in paths:
                path = path_config.get("path", "/")
                path_type = path_config.get("path_type", "Prefix")
                service_name = path_config.get("service_name")
                service_port = path_config.get("service_port")
                
                # Create backend
                backend = client.V1IngressBackend(
                    service=client.V1IngressServiceBackend(
                        name=service_name,
                        port=client.V1ServiceBackendPort(
                            number=service_port
                        )
                    )
                )
                
                # Create HTTP path
                http_path = client.V1HTTPIngressPath(
                    path=path,
                    path_type=path_type,
                    backend=backend
                )
                
                http_paths.append(http_path)
            
            # Create the rule with host and paths
            ingress_rule = client.V1IngressRule(
                host=host,
                http=client.V1HTTPIngressRuleValue(
                    paths=http_paths
                )
            )
            
            ingress_rules.append(ingress_rule)
        
        # Create ingress spec
        spec = client.V1IngressSpec(
            rules=ingress_rules
        )
        
        # Add TLS if provided
        if tls:
            spec.tls = tls
        
        # Create ingress body
        ingress = client.V1Ingress(
            api_version="networking.k8s.io/v1",
            kind="Ingress",
            metadata=metadata,
            spec=spec
        )
        
        # Create the ingress
        created_ingress = networking_v1.create_namespaced_ingress(
            namespace=namespace,
            body=ingress
        )
        
        logging.info(f"Created ingress {name} in namespace {namespace}")
        return created_ingress
        
    except ApiException as e:
        logging.error(f"API error creating ingress {name}: {e}")
        raise
    except Exception as e:
        logging.error(f"Error creating ingress {name}: {e}")
        raise

def create_k8s_client_from_config(config_file=None, context=None):
    """
    Create Kubernetes client from a config file or use in-cluster config.

    Args:
        config_file (str): Path to kubeconfig file (None for in-cluster config)
        context (str): The context to use from the config file

    Returns:
        object: Configured Kubernetes client
    """
    try:
        if config_file:
            # Load from specified kubeconfig file
            logging.info(f"Loading Kubernetes client from config file: {config_file}")
            load_kube_config(config_file=config_file, context=context)
        else:
            # Try loading in-cluster config, fall back to default kubeconfig
            try:
                logging.info("Attempting to load in-cluster configuration")
                load_incluster_config()
            except ConfigException:
                logging.info("Failed to load in-cluster config, falling back to default kubeconfig")
                load_kube_config(context=context)
        
        # Return core API client
        return client.CoreV1Api()
    except Exception as e:
        logging.error(f"Error creating Kubernetes client: {e}")
        raise

def get_k8s_clients():
    """
    Get a set of commonly used Kubernetes API clients.

    Returns:
        dict: Dictionary containing various Kubernetes API clients
    """
    return {
        "core": client.CoreV1Api(),
        "apps": client.AppsV1Api(),
        "networking": client.NetworkingV1Api(),
        "batch": client.BatchV1Api(),
        "rbac": client.RbacAuthorizationV1Api(),
        "custom": client.CustomObjectsApi()
    }

def delete_resources(resources_list, namespace="default"):
    """
    Delete multiple Kubernetes resources.

    Args:
        resources_list (list): List of dicts with resource details to delete
            Each dict should contain:
            - kind: Resource kind (Pod, Service, Deployment, etc.)
            - name: Resource name
            - api_group: Optional API group for the resource
        namespace (str): Kubernetes namespace

    Returns:
        dict: Results of deletion operations
    """
    results = {
        "success": [],
        "failed": []
    }
    
    clients = get_k8s_clients()
    
    for resource in resources_list:
        kind = resource.get("kind")
        name = resource.get("name")
        
        if not kind or not name:
            results["failed"].append({
                "resource": resource,
                "error": "Missing required kind or name"
            })
            continue
            
        try:
            logging.info(f"Deleting {kind} {name} in namespace {namespace}")
            
            # Handle different resource types
            if kind.lower() == "pod":
                clients["core"].delete_namespaced_pod(name=name, namespace=namespace)
            elif kind.lower() == "service":
                clients["core"].delete_namespaced_service(name=name, namespace=namespace)
            elif kind.lower() == "deployment":
                clients["apps"].delete_namespaced_deployment(name=name, namespace=namespace)
            elif kind.lower() == "statefulset":
                clients["apps"].delete_namespaced_stateful_set(name=name, namespace=namespace)
            elif kind.lower() == "daemonset":
                clients["apps"].delete_namespaced_daemon_set(name=name, namespace=namespace)
            elif kind.lower() == "job":
                clients["batch"].delete_namespaced_job(name=name, namespace=namespace)
            elif kind.lower() == "ingress":
                clients["networking"].delete_namespaced_ingress(name=name, namespace=namespace)
            elif kind.lower() == "configmap":
                clients["core"].delete_namespaced_config_map(name=name, namespace=namespace)
            elif kind.lower() == "secret":
                clients["core"].delete_namespaced_secret(name=name, namespace=namespace)
            elif kind.lower() == "pvc" or kind.lower() == "persistentvolumeclaim":
                clients["core"].delete_namespaced_persistent_volume_claim(name=name, namespace=namespace)
            else:
                results["failed"].append({
                    "resource": resource,
                    "error": f"Unsupported resource kind: {kind}"
                })
                continue
                
            results["success"].append({
                "kind": kind,
                "name": name
            })
            
        except ApiException as e:
            if e.status == 404:
                # Resource not found, consider as success
                logging.warning(f"Resource {kind}/{name} not found, already deleted")
                results["success"].append({
                    "kind": kind,
                    "name": name,
                    "note": "Resource not found (already deleted)"
                })
            else:
                logging.error(f"API error deleting {kind}/{name}: {e}")
                results["failed"].append({
                    "resource": resource,
                    "error": f"API error: {str(e)}"
                })
        except Exception as e:
            logging.error(f"Error deleting {kind}/{name}: {e}")
            results["failed"].append({
                "resource": resource,
                "error": str(e)
            })
    
    return results

def create_network_policy_from_definition(network_policy_def, instance_name, resolved_variables):
    """
    Create a Kubernetes NetworkPolicy from a CTD network policy definition.

    Args:
        network_policy_def (dict): Network policy definition from CTD
        instance_name (str): Instance name for labels and naming
        resolved_variables (dict): Dictionary of resolved template variables

    Returns:
        object: Created NetworkPolicy object or None if definition is invalid
    
    Raises:
        ApiException: If API call fails
    """
    try:
        # Validate required fields
        if not isinstance(network_policy_def, dict):
            logging.error(f"Invalid network_policy_def format: Expected dict, got {type(network_policy_def)}")
            return None
        
        name_template = network_policy_def.get('name', f"np-{instance_name}")
        if not name_template:
            logging.error("Network policy definition missing required 'name'")
            return None
            
        # Resolve name and labels
        name = replace_template_variables(name_template, resolved_variables)
        labels = {
            "app": "ctfchal",
            "instance": instance_name
        }
        # Add additional labels from definition, resolving templates
        for key, value in network_policy_def.get('labels', {}).items():
            resolved_value = replace_template_variables(str(value), resolved_variables)
            labels[sanitize_k8s_label(key)] = sanitize_k8s_label(resolved_value)

        # Prepare metadata
        metadata = client.V1ObjectMeta(
            name=name,
            namespace=network_policy_def.get('namespace', 'default'),
            labels=labels
        )
        
        # Parse pod selector - resolve templates
        pod_selector_template = network_policy_def.get('podSelector')
        if not pod_selector_template or not isinstance(pod_selector_template.get('matchLabels'), dict):
            logging.error(f"Invalid or missing podSelector/matchLabels in network policy {name}")
            return None # Pod selector with matchLabels is required
            
        resolved_pod_selector_labels = {
            sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(str(v), resolved_variables)) 
            for k, v in pod_selector_template['matchLabels'].items()
        }
        pod_selector = client.V1LabelSelector(match_labels=resolved_pod_selector_labels)
        
        # Parse ingress rules
        ingress_rules = []
        for rule_template in network_policy_def.get('ingress', []):
            ingress_rule = client.V1NetworkPolicyIngressRule()
            # Parse 'from' rules
            if 'from' in rule_template:
                from_peers = []
                for peer_template in rule_template['from']:
                    network_peer = client.V1NetworkPolicyPeer()
                    if 'podSelector' in peer_template and isinstance(peer_template['podSelector'].get('matchLabels'), dict):
                        resolved_peer_labels = {
                            sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(str(v), resolved_variables)) 
                            for k, v in peer_template['podSelector']['matchLabels'].items()
                        }
                        # IMPORTANT FIX: Ensure matchLabels is a dict
                        network_peer.pod_selector = client.V1LabelSelector(match_labels=resolved_peer_labels)
                    # Add namespaceSelector and ipBlock parsing if needed
                    if 'namespaceSelector' in peer_template and isinstance(peer_template['namespaceSelector'].get('matchLabels'), dict):
                        resolved_ns_labels = {
                            sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(str(v), resolved_variables))
                            for k,v in peer_template['namespaceSelector']['matchLabels'].items()
                        }
                        network_peer.namespace_selector = client.V1LabelSelector(match_labels=resolved_ns_labels)
                    if 'ipBlock' in peer_template:
                         block_cidr = replace_template_variables(str(peer_template['ipBlock'].get('cidr')), resolved_variables)
                         block_except = [replace_template_variables(str(ex), resolved_variables) for ex in peer_template['ipBlock'].get('except', [])]
                         network_peer.ip_block = client.V1IPBlock(cidr=block_cidr, except_=block_except)
                         
                    from_peers.append(network_peer)
                ingress_rule._from = from_peers # Use underscore for reserved keyword
            # Parse ports
            if 'ports' in rule_template:
                ports = [
                    client.V1NetworkPolicyPort(port=p.get('port'), protocol=p.get('protocol', 'TCP'))
                    for p in rule_template['ports'] if isinstance(p, dict) and 'port' in p
                ]
                ingress_rule.ports = ports
            ingress_rules.append(ingress_rule)
        
        # Parse egress rules (similar structure to ingress)
        egress_rules = []
        for rule_template in network_policy_def.get('egress', []):
            egress_rule = client.V1NetworkPolicyEgressRule()
            if 'to' in rule_template:
                to_peers = []
                for peer_template in rule_template['to']:
                     network_peer = client.V1NetworkPolicyPeer()
                     if 'podSelector' in peer_template and isinstance(peer_template['podSelector'].get('matchLabels'), dict):
                        resolved_peer_labels = {
                            sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(str(v), resolved_variables))
                            for k, v in peer_template['podSelector']['matchLabels'].items()
                        }
                        network_peer.pod_selector = client.V1LabelSelector(match_labels=resolved_peer_labels)
                     # Add namespaceSelector and ipBlock parsing if needed
                     if 'namespaceSelector' in peer_template and isinstance(peer_template['namespaceSelector'].get('matchLabels'), dict):
                        resolved_ns_labels = {
                            sanitize_k8s_label(k): sanitize_k8s_label(replace_template_variables(str(v), resolved_variables))
                            for k,v in peer_template['namespaceSelector']['matchLabels'].items()
                        }
                        network_peer.namespace_selector = client.V1LabelSelector(match_labels=resolved_ns_labels)
                     if 'ipBlock' in peer_template:
                         block_cidr = replace_template_variables(str(peer_template['ipBlock'].get('cidr')), resolved_variables)
                         block_except = [replace_template_variables(str(ex), resolved_variables) for ex in peer_template['ipBlock'].get('except', [])]
                         network_peer.ip_block = client.V1IPBlock(cidr=block_cidr, except_=block_except)
                         
                     to_peers.append(network_peer)
                egress_rule.to = to_peers
            if 'ports' in rule_template:
                ports = [
                    client.V1NetworkPolicyPort(port=p.get('port'), protocol=p.get('protocol', 'TCP'))
                    for p in rule_template['ports'] if isinstance(p, dict) and 'port' in p
                ]
                egress_rule.ports = ports
            egress_rules.append(egress_rule)
        
        # Create network policy spec
        spec = client.V1NetworkPolicySpec(
            pod_selector=pod_selector,
            policy_types=network_policy_def.get('policyTypes', ['Ingress']),
            ingress=ingress_rules if ingress_rules else None,
            egress=egress_rules if egress_rules else None
        )
        
        # Create network policy object
        network_policy = client.V1NetworkPolicy(
            api_version="networking.k8s.io/v1",
            kind="NetworkPolicy",
            metadata=metadata,
            spec=spec
        )
        
        logging.info(f"Generated NetworkPolicy object {name}")
        return network_policy
        
    except Exception as e:
        logging.error(f"Error generating NetworkPolicy object {network_policy_def.get('name', 'unknown')}: {e}")
        # Log the problematic definition for debugging
        logging.debug(f"Problematic NetworkPolicy Definition: {network_policy_def}")
        raise # Re-raise the exception to be caught by the caller
