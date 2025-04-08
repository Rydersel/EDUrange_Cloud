"""
Kubernetes resource management utilities for EDURange challenges.
This module contains common functions for creating, managing, and cleaning up
Kubernetes resources used by the EDURange challenge system.
"""

import logging
import re
import os
from kubernetes import client
from kubernetes.client.rest import ApiException
from kubernetes.stream import stream

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
        str: One of 'creating', 'active', 'error', 'deleting'
    """
    if pod.metadata.deletion_timestamp:  # Work around for deleting status not showing up
        return 'deleting'
    elif pod.status.phase == 'Pending':
        return 'creating'
    elif pod.status.phase == 'Running':
        return 'active'
    elif pod.status.phase == 'Failed':
        return 'error'
    elif pod.status.phase == 'Succeeded':
        return 'deleting'
    else:
        return pod.status.phase.lower()

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
        image_name (str): Full image name (e.g., registry.rydersel.cloud/webos)
        
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