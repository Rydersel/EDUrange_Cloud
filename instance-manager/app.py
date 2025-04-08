import sys
import traceback
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from kubernetes import client, config
from kubernetes.stream import stream
from kubernetes.client.rest import ApiException
from kubernetes.client import models
import logging
import json
import yaml
import os
import time
import re
import base64
import jsonschema  # For CDF validation
from datetime import datetime, timedelta
from dotenv import load_dotenv
from challenge_utils.utils import load_config, get_secret, decode_secret_data
from challenge_utils.cdf_parser import load_cdf, validate_cdf, load_schema
from challenge_utils.k8s_resources import (
    cleanup_resources_by_label, 
    get_pod_status, 
    execute_in_pod, 
    list_pods as k8s_list_pods,
    list_pods_by_label,
    delete_pod_force
)
from challenges import CHALLENGE_HANDLERS, BaseChallengeHandler, CTDBasedHandler
from challenge_utils.validators import (
    validate_instance_name, validate_challenge_type, validate_namespace,
    validate_command, validate_request_json, validate_pod_name,
    validate_container_name, validate_parameters
)
from challenge_utils.challenge_types import (
    normalize_challenge_type, get_all_challenge_types, is_valid_ctd_type
)
from challenge_utils.ctd_loader import CTD_DIR, CTD_SCHEMA, _ctd_cache  # Import CTD loader components
import threading
import requests
import zipfile
import io
import shutil
import tempfile
import werkzeug.utils

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [IM] - %(levelname)s - %(message)s'
)

app = Flask(__name__)
CORS(app)

load_config()  # Initialize Kubernetes client configuration
load_dotenv()  # Load environment variables
url = os.getenv("INGRESS_URL")

@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        # First validate that we have a valid JSON request with all required fields
        json_data = request.json
        logging.info(f"Received start-challenge request with keys: {list(json_data.keys() if json_data else [])}")
        
        validation_result, error_message = validate_request_json(json_data, ['user_id', 'cdf_content', 'competition_id', 'deployment_name'])
        if not validation_result:
            logging.error(f"Request validation failed: {error_message}")
            return jsonify({"error": error_message}), 400
            
        user_id = json_data['user_id']
        cdf_content_str = json_data['cdf_content']
        competition_id = json_data['competition_id']
        deployment_name = json_data['deployment_name']

        logging.info(f"Processing challenge deployment request: user_id={user_id}, competition_id={competition_id}, deployment_name={deployment_name}")

        # Validate the deployment name format
        validation_result, error_message = validate_instance_name(deployment_name)
        if not validation_result:
            logging.error(f"Invalid deployment_name received: {deployment_name} - {error_message}")
            return jsonify({"error": f"Invalid deployment_name: {error_message}"}), 400

    except Exception as e:
        logging.error(f"Error processing request JSON: {e}")
        return jsonify({"error": f"Invalid request format: {e}"}), 400

    try:
        # Log CDF content length for debugging
        logging.info(f"CDF content length: {len(cdf_content_str)} characters")
        
        # Try to load and parse the CDF
        try:
            # If cdf_content_str is already a dict, use it directly
            if isinstance(cdf_content_str, dict):
                cdf_data = cdf_content_str
                logging.info("Using CDF data directly from request")
            else:
                # Otherwise try to parse it as JSON or YAML
                cdf_data = load_cdf(cdf_content_str)
            logging.info(f"Successfully loaded CDF data with keys: {list(cdf_data.keys())}")
        except Exception as e:
            logging.error(f"Failed to parse CDF content: {str(e)}")
            logging.debug(f"CDF content excerpt: {str(cdf_content_str)[:500]}...")
            return jsonify({"error": f"Failed to parse CDF content: {str(e)}"}), 400
        
        # Validate the CDF structure against schema
        try:
            validate_cdf(cdf_data)
            logging.info("CDF schema validation passed")
        except Exception as e:
            logging.error(f"CDF validation failed: {str(e)}")
            return jsonify({"error": f"CDF validation failed: {str(e)}"}), 400

        challenge_type = cdf_data.get('metadata', {}).get('challenge_type')
        if not challenge_type:
            logging.error("Missing challenge_type in CDF metadata")
            return jsonify({"error": "Missing challenge_type in CDF metadata"}), 400
            
        # Validate the challenge type
        validation_result, error_message = validate_challenge_type(challenge_type)
        if not validation_result:
            logging.warning(f"Challenge type validation issue: {error_message}")
            return jsonify({"error": f"Invalid challenge type: {error_message}"}), 400
            
        # Normalize the challenge type
        original_type = challenge_type
        challenge_type = normalize_challenge_type(challenge_type)
        if challenge_type != original_type:
            logging.info(f"Normalized challenge type from '{original_type}' to '{challenge_type}'")
            # Update the challenge type in the CDF data
            cdf_data['metadata']['challenge_type'] = challenge_type

        # Check if we have a handler for this challenge type
        HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
        if not HandlerClass:
            logging.error(f"Unsupported challenge type: {challenge_type}")
            available_types = list(CHALLENGE_HANDLERS.keys())
            logging.error(f"Available challenge types: {available_types}")
            return jsonify({"error": f"Unsupported challenge type: {challenge_type}. Available types: {available_types}"}), 400

        logging.info(f"Instantiating handler {HandlerClass.__name__} for type {challenge_type}")
        handler_instance = HandlerClass(user_id, cdf_data, competition_id, deployment_name)

        # Log type config if available
        if 'typeConfig' in cdf_data:
            logging.info(f"Type config keys: {list(cdf_data['typeConfig'].keys())}")

        # Log components summary
        components = cdf_data.get('components', [])
        component_types = [comp.get('type') for comp in components]
        logging.info(f"CDF contains {len(components)} components: {component_types}")

        # Deploy the challenge
        logging.info(f"Starting deployment for instance {deployment_name}")
        deployment_info = handler_instance.deploy()

        log_deployment_name = deployment_info.get('deployment_name', deployment_name)

        if deployment_info.get("success"):
            logging.info(f"Deployment successful for instance {log_deployment_name}")
            
            # Make sure flags are included in the response
            if 'flags' not in deployment_info and hasattr(handler_instance, 'flags'):
                deployment_info['flags'] = handler_instance.flags
                logging.info(f"Added flags to response: {handler_instance.flags}")

            # Make sure flag_secret_name is included in the response
            if 'flag_secret_name' not in deployment_info and hasattr(handler_instance, 'flag_secret_name'):
                deployment_info['flag_secret_name'] = handler_instance.flag_secret_name
                logging.info(f"Added flag_secret_name to response: {handler_instance.flag_secret_name}")
                
            return jsonify(deployment_info), 200
        else:
            logging.error(f"Deployment failed for {log_deployment_name}: {deployment_info.get('error')}")
            return jsonify({"error": deployment_info.get('error', "Deployment failed internally")}), 500

    except (ValueError, jsonschema.ValidationError) as e:
        logging.error(f"CDF Loading/Validation Error: {e}")
        return jsonify({"error": f"Invalid CDF content: {e}"}), 400
    except Exception as e:
        stack_trace = traceback.format_exc()
        logging.exception(f"Unexpected error during challenge start: {e}")
        logging.error(f"Stack trace: {stack_trace}")
        if 'handler_instance' in locals() and isinstance(handler_instance, BaseChallengeHandler):
             try:
                 handler_instance.cleanup()
             except Exception as cleanup_e:
                 logging.error(f"Failed during cleanup after error: {cleanup_e}")
        return jsonify({"error": f"An internal error occurred while starting the challenge: {str(e)}"}), 500

@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    try:
        # Validate request JSON
        json_data = request.json
        validation_result, error_message = validate_request_json(json_data, ['deployment_name'])
        if not validation_result:
            return jsonify({"error": error_message}), 400
            
        pod_name = json_data['deployment_name']
        namespace = json_data.get('namespace', 'default')
        
        # Validate the deployment name
        validation_result, error_message = validate_instance_name(pod_name)
        if not validation_result:
            logging.error(f"Invalid pod_name received: {pod_name} - {error_message}")
            return jsonify({"error": f"Invalid pod_name: {error_message}"}), 400

    except Exception as e:
        logging.error(f"Error processing request JSON: {e}")
        return jsonify({"error": f"Invalid request format: {e}"}), 400

    logging.info(f"Received request to end challenge pod: {pod_name}")
    
    # Perform the deletion immediately (no background thread)
    try:
        delete_challenge_pod(pod_name, namespace)
        return jsonify({
            "success": True, 
            "message": f"Termination of {pod_name} completed",
            "status": "terminated"
        }), 200
    except Exception as e:
        logging.error(f"Error terminating pod {pod_name}: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "message": f"Failed to terminate {pod_name}"
        }), 500

def delete_challenge_pod(pod_name, namespace="default"):
    """Delete a challenge pod and its associated resources"""
    logging.info(f"Deleting challenge pod: {pod_name} in namespace {namespace}")
    
    try:
        # Get the Kubernetes API clients
        core_api = client.CoreV1Api()
        networking_v1 = client.NetworkingV1Api()
        
        # Delete pod
        try:
            core_api.delete_namespaced_pod(
                name=pod_name,
                namespace=namespace,
                body=client.V1DeleteOptions(propagation_policy='Foreground')
            )
            logging.info(f"Successfully deleted pod {pod_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting pod {pod_name}: {e}")
                raise
        
        # Delete service
        try:
            service_name = pod_name  # Just pod_name, not service-{pod_name}
            core_api.delete_namespaced_service(
                name=service_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted service {service_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting service {service_name}: {e}")
        
        # Delete flag secret
        try:
            secret_name = f"flag-secret-{pod_name}"
            core_api.delete_namespaced_secret(
                name=secret_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted secret {secret_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting secret {secret_name}: {e}")
        
        # Delete ingress
        try:
            ingress_name = pod_name  # Just pod_name, not ingress-{pod_name}
            networking_v1.delete_namespaced_ingress(
                name=ingress_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted ingress {ingress_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting ingress {ingress_name}: {e}")
        
        logging.info(f"Successfully terminated all resources for pod {pod_name}")
        return True
    except Exception as e:
        logging.error(f"Error in delete_challenge_pod: {e}")
        raise

@app.route('/api/list-challenge-pods', methods=['GET'])
def list_challenge_pods():
    logging.info("Received request to list challenge pods")
    try:
        # Get all pods with the challenge label
        pods = list_challenge_pods_with_label()
        logging.info(f"Retrieved {len(pods)} total pods from Kubernetes")
        
        challenge_pods = []
        
        for pod in pods:
            logging.info(f"Processing pod: {pod.metadata.name}")
            try:
                status = get_pod_status(pod)
                logging.info(f"Pod {pod.metadata.name} status: {status}")
                
                # Extract metadata using correct label keys
                user_id = pod.metadata.labels.get('user', 'unknown')
                competition_id = pod.metadata.labels.get('competition_id', 'unknown')
                challenge_type = pod.metadata.labels.get('challenge_type', 'unknown')
                challenge_name = pod.metadata.labels.get('challenge_name', 'unknown')
                
                logging.info(f"Pod {pod.metadata.name} metadata - user_id: {user_id}, competition_id: {competition_id}, type: {challenge_type}, name: {challenge_name}")

                # Get the instance name from pod name or label
                instance_name = pod.metadata.name
                
                # Get domain with fallback from env vars
                domain = os.getenv("DOMAIN")
                if not domain:
                    domain = os.getenv("INGRESS_URL", "edurange.cloud")
                    logging.info(f"DOMAIN not set, using INGRESS_URL: {domain}")
                
                logging.info(f"Using domain for URLs: {domain}")

                # Build URLs using external domain instead of pod IP
                webos_url = f"https://{instance_name}.{domain}"
                # For non-web challenges, terminal URL is the same as the main domain
                web_console_url = f"https://{instance_name}.{domain}" if challenge_type != 'web' else None
                web_challenge_url = f"https://web-{instance_name}.{domain}" if challenge_type == 'web' else None
                
                urls = {
                    'terminal': web_console_url,
                    'challenge': web_challenge_url
                }
                
                pod_info = {
                    'name': pod.metadata.name,
                    'status': status,
                    'user_id': user_id,
                    'competition_id': competition_id,
                    'challenge_type': challenge_type,
                    'challenge_name': challenge_name,
                    'urls': urls,
                    'webosUrl': webos_url,  # Add the webosUrl explicitly for backwards compatibility
                    'webConsoleUrl': web_console_url,  # Add webConsoleUrl explicitly for backwards compatibility
                }
                challenge_pods.append(pod_info)
                logging.info(f"Added pod info to response: {pod_info}")
                
            except Exception as e:
                logging.error(f"Error processing pod {pod.metadata.name}: {str(e)}")
                continue

        logging.info(f"Returning {len(challenge_pods)} challenge pods")
        return jsonify({'challenge_pods': challenge_pods})
        
    except Exception as e:
        logging.error(f"Error in list-challenge-pods endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-secret', methods=['POST'])
def get_secret_value():
    try:
        # Validate the request JSON
        json_data = request.json
        validation_result, error_message = validate_request_json(json_data, ['secret_name'])
        if not validation_result:
            logging.error(error_message)
            return jsonify({"error": error_message, "secret_value": "null"}), 400

        secret_name = json_data.get('secret_name')
        namespace = json_data.get('namespace', 'default')
        
        # Validate parameters
        validation_results = validate_parameters({
            'namespace': (validate_namespace, namespace)
        })
        
        # Check if namespace is valid
        namespace_valid, namespace_error = validation_results['namespace']
        if not namespace_valid:
            return jsonify({"error": f"Invalid namespace: {namespace_error}", "secret_value": "null"}), 400
        
        # Validate that secret_name is not empty or invalid
        if not secret_name or not secret_name.strip():
            logging.warning(f"Empty or whitespace-only secret_name provided: '{secret_name}'")
            return jsonify({"error": "Invalid secret name (empty or whitespace)", "secret_value": "null"}), 400

        secret_name = secret_name.strip()

        logging.info(f"Getting secret: '{secret_name}' in namespace '{namespace}'")

    except Exception as e:
        logging.error(f"Error processing request: {str(e)}")
        return jsonify({"error": f"Error processing request: {str(e)}", "secret_value": "null"}), 400

    # Try list of possible secret names
    potential_secret_names = [secret_name]

    # First, try direct lookup
    secret = get_secret(secret_name, namespace)

    # If not found, try different naming patterns
    if not secret:
        logging.info(f"Secret {secret_name} not found directly, trying variations")

        # Extract pod ID if it's in 'flag-secret-{podid}' format
        if secret_name.startswith('flag-secret-'):
            pod_id = secret_name[len('flag-secret-'):]
            logging.info(f"Extracted pod ID from secret name: {pod_id}")

            # Add alternative names to try
            potential_secret_names.extend([
                f"ctfchal-{pod_id}",  # Legacy format
                f"flag-{pod_id}"      # Alternative format
            ])
        # Extract pod ID if it's in 'ctfchal-{podid}' format
        elif secret_name.startswith('ctfchal-'):
            pod_id = secret_name[len('ctfchal-'):]
            logging.info(f"Extracted pod ID from ctfchal name: {pod_id}")

            # Add alternative names to try
            potential_secret_names.extend([
                f"flag-secret-{pod_id}",  # New format
                f"flag-{pod_id}"          # Alternative format
            ])

        # Try all potential names
        for name in potential_secret_names[1:]:  # Skip the first one as we already tried it
            logging.info(f"Trying alternative secret name: {name}")
            secret = get_secret(name, namespace)
            if secret:
                logging.info(f"Found secret using alternative name: {name}")
                break

    # If we found a secret, process and return its value
    if secret:
        try:
            logging.info(f"Successfully retrieved secret")
            logging.info(f"Secret data keys: {list(secret.data.keys()) if hasattr(secret, 'data') and secret.data else 'No data'}")

            decoded_data = decode_secret_data(secret)
            logging.info(f"Decoded data keys: {list(decoded_data.keys()) if decoded_data else 'No decoded data'}")

            # First check for a 'flag' key
            if decoded_data and 'flag' in decoded_data:
                secret_value = decoded_data.get('flag')
                logging.info(f"Found flag key in secret data, returning value (length: {len(secret_value)})")
                return jsonify({"secret_value": secret_value})

            # If 'flag' key doesn't exist, return the first value as fallback
            if decoded_data and len(decoded_data) > 0:
                first_key = list(decoded_data.keys())[0]
                secret_value = decoded_data.get(first_key)
                logging.info(f"No 'flag' key found, using first key '{first_key}' as fallback (length: {len(secret_value)})")
                return jsonify({"secret_value": secret_value})

            logging.warning(f"Secret exists but contains no usable data")
        except Exception as e:
            logging.error(f"Error decoding secret data: {str(e)}")
            return jsonify({"error": f"Error decoding secret data: {str(e)}", "secret_value": "null"}), 500

    # If we still don't have a secret, try to find it in the pod
    pod_id = None

    # Try to extract pod ID from various formats
    if secret_name.startswith('flag-secret-'):
        pod_id = secret_name[len('flag-secret-'):]
    elif secret_name.startswith('ctfchal-'):
        pod_id = secret_name[len('ctfchal-'):]

    if pod_id:
        logging.info(f"Checking pod {pod_id} for FLAG environment variable")
        try:
            v1 = client.CoreV1Api()
            pod = v1.read_namespaced_pod(name=pod_id, namespace=namespace)

            # Check all containers in the pod for the FLAG
            for container in pod.spec.containers:
                if container.name == 'challenge-container':
                    logging.info(f"Found challenge-container in pod {pod_id}")

                    # First check for directly set FLAG value
                    for env in container.env:
                        if env.name == 'FLAG' and env.value:
                            logging.info(f"Found direct FLAG env var in challenge-container for pod {pod_id}")
                            return jsonify({"secret_value": env.value})

                    # Then check for valueFrom references
                    for env in container.env:
                        if env.name == 'FLAG' and env.value_from and env.value_from.secret_key_ref:
                            ref_secret_name = env.value_from.secret_key_ref.name
                            ref_key = env.value_from.secret_key_ref.key
                            logging.info(f"Found FLAG env var with secretKeyRef: name={ref_secret_name}, key={ref_key}")

                            # Get the referenced secret
                            try:
                                ref_secret = get_secret(ref_secret_name, namespace)
                                if ref_secret:
                                    ref_decoded = decode_secret_data(ref_secret)
                                    if ref_decoded and ref_key in ref_decoded:
                                        secret_value = ref_decoded[ref_key]
                                        logging.info(f"Retrieved FLAG value from referenced secret (length: {len(secret_value)})")
                                        return jsonify({"secret_value": secret_value})
                            except Exception as e:
                                logging.error(f"Error retrieving referenced secret: {str(e)}")

                # Check the webos container for FLAG_SECRET_NAME
                if container.name == 'webos':
                    for env in container.env:
                        if env.name == 'FLAG_SECRET_NAME' and env.value:
                            alt_secret_name = env.value
                            logging.info(f"Found FLAG_SECRET_NAME in webos container: {alt_secret_name}")

                            # Try to get this secret
                            try:
                                alt_secret = get_secret(alt_secret_name, namespace)
                                if alt_secret:
                                    alt_decoded = decode_secret_data(alt_secret)
                                    if alt_decoded and 'flag' in alt_decoded:
                                        secret_value = alt_decoded['flag']
                                        logging.info(f"Retrieved flag from webos FLAG_SECRET_NAME (length: {len(secret_value)})")
                                        return jsonify({"secret_value": secret_value})
                                    elif alt_decoded and len(alt_decoded) > 0:
                                        first_key = list(alt_decoded.keys())[0]
                                        secret_value = alt_decoded[first_key]
                                        logging.info(f"No 'flag' key found in webos secret, using first key '{first_key}' as fallback")
                                        return jsonify({"secret_value": secret_value})
                            except Exception as e:
                                logging.error(f"Error retrieving webos-referenced secret: {str(e)}")

        except Exception as pod_error:
            logging.error(f"Error checking pod {pod_id} for FLAG env var: {pod_error}")

    # If we get here, we couldn't find the flag anywhere
    logging.warning(f"Secret {secret_name} not found after trying multiple approaches")
    return jsonify({"error": f"Secret {secret_name} not found in namespace {namespace}", "secret_value": "null"}), 404

@app.route('/api/get-pod-status', methods=['GET'])
def get_pod_status_endpoint():
    """
    Get the status of a pod by name.
    Returns the pod status, uptime, and other metadata.
    """
    from datetime import timezone
    
    try:
        pod_name = request.args.get('pod_name')
        namespace = request.args.get('namespace', 'default')
        
        # Validate parameters
        validation_results = validate_parameters({
            'pod_name': (validate_pod_name, pod_name),
            'namespace': (validate_namespace, namespace)
        })
        
        # Check if pod_name is valid
        pod_name_valid, pod_name_error = validation_results['pod_name']
        if not pod_name_valid:
            return jsonify({"error": f"Invalid pod_name: {pod_name_error}"}), 400
            
        # Check if namespace is valid
        namespace_valid, namespace_error = validation_results['namespace']
        if not namespace_valid:
            return jsonify({"error": f"Invalid namespace: {namespace_error}"}), 400

        v1 = client.CoreV1Api()
        
        try:
            pod = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return jsonify({"error": "Pod not found", "status": "not_found"}), 404
            else:
                logging.error(f"API error reading pod: {e}")
                return jsonify({"error": f"API error: {e.reason}", "status": "error"}), 500
        
        # Get standardized status using our utility
        status = get_pod_status(pod)
        
        # Calculate uptime if the pod is running
        uptime = None
        if pod.status.container_statuses and pod.status.container_statuses[0].state.running:
            start_time = pod.status.container_statuses[0].state.running.started_at
            if start_time:
                now = datetime.now(timezone.utc)
                uptime = int((now - start_time).total_seconds())
        
        # Get container details
        containers = []
        if pod.spec.containers:
            for container in pod.spec.containers:
                container_status = next((cs for cs in pod.status.container_statuses if cs.name == container.name), None)
                
                container_info = {
                    "name": container.name,
                    "image": container.image,
                    "ready": container_status.ready if container_status else False,
                    "restartCount": container_status.restart_count if container_status else 0,
                    "state": "unknown"
                }
                
                if container_status:
                    if container_status.state.running:
                        container_info["state"] = "running"
                    elif container_status.state.waiting:
                        container_info["state"] = "waiting"
                        container_info["reason"] = container_status.state.waiting.reason
                    elif container_status.state.terminated:
                        container_info["state"] = "terminated"
                        container_info["reason"] = container_status.state.terminated.reason
                        container_info["exitCode"] = container_status.state.terminated.exit_code
                
                containers.append(container_info)
        
        # Prepare response
        response = {
            "name": pod_name,
            "status": status,
            "uptime": uptime,
            "labels": pod.metadata.labels,
            "containers": containers,
            "node": pod.spec.node_name,
            "podIP": pod.status.pod_ip,
            "creationTimestamp": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        logging.exception(f"Error getting pod status: {e}")
        return jsonify({"error": f"Error getting pod status: {str(e)}"}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint that checks the status of the instance manager.
    Also provides information about database and cert-manager if requested.
    """
    try:
        import datetime
        import time
        import os
        from datetime import timezone

        try:
            import psutil
            process = psutil.Process(os.getpid())
            process_start_time = datetime.datetime.fromtimestamp(process.create_time(), tz=timezone.utc)

            now = datetime.datetime.now(timezone.utc)
            uptime_delta = now - process_start_time

            days = uptime_delta.days
            hours, remainder = divmod(uptime_delta.seconds, 3600)
            minutes, seconds = divmod(remainder, 60)

            if days > 0:
                uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
            elif hours > 0:
                uptime_str = f"{hours} hours, {minutes} minutes"
            else:
                uptime_str = f"{minutes} minutes"

            last_restart = process_start_time.strftime("%Y-%m-%d %H:%M:%S")

            logging.info(f"Calculated uptime: {uptime_str}, last restart: {last_restart}")
        except Exception as e:
            logging.error(f"Error getting uptime: {e}")
            uptime_str = "unknown"
            last_restart = "unknown"

        instance_manager_status = {
            "status": "ok",
            "uptime": uptime_str,
            "version": "1.0.0",
            "last_restart": last_restart
        }

        check_components = request.args.get('check_components', 'false').lower() == 'true'

        if check_components:
            database_status = check_pod_health('postgres')
            db_controller_status = check_pod_health('database-controller')
            cert_manager_status = check_pod_health('cert-manager')

            database_info = {
                "status": database_status["status"] if isinstance(database_status, dict) and "status" in database_status else "error",
                "uptime": database_status["uptime"] if isinstance(database_status, dict) and "uptime" in database_status else "unknown",
                "last_restart": database_status["last_restart"] if isinstance(database_status, dict) and "last_restart" in database_status else "unknown",
                "controller": db_controller_status
            }

            cert_manager_info = cert_manager_status if isinstance(cert_manager_status, dict) else {"status": "error", "uptime": "unknown", "last_restart": "unknown"}

            return jsonify({
                "instance_manager": instance_manager_status,
                "database": database_info,
                "cert_manager": cert_manager_info
            }), 200

        return jsonify(instance_manager_status), 200
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500

def check_pod_health(pod_name_prefix):
    """
    Check the health of a pod by its name prefix.
    Returns pod health information including status, uptime, and last restart.
    """
    try:
        v1 = client.CoreV1Api()

        namespace = 'cert-manager' if pod_name_prefix == 'cert-manager' else 'default'

        pods = v1.list_namespaced_pod(namespace=namespace)

        for pod in pods.items:
            if pod.metadata.name.startswith(pod_name_prefix):
                if pod.status.phase == 'Running':
                    container_statuses = pod.status.container_statuses

                    start_time = pod.status.start_time
                    if start_time:
                        import datetime
                        from datetime import timezone

                        now = datetime.datetime.now(timezone.utc)
                        uptime_delta = now - start_time

                        days = uptime_delta.days
                        hours, remainder = divmod(uptime_delta.seconds, 3600)
                        minutes, seconds = divmod(remainder, 60)

                        if days > 0:
                            uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
                        elif hours > 0:
                            uptime_str = f"{hours} hours, {minutes} minutes"
                        else:
                            uptime_str = f"{minutes} minutes"

                        last_restart = start_time.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        uptime_str = "unknown"
                        last_restart = "unknown"

                    if container_statuses:
                        if pod_name_prefix == 'database-controller':
                            api_container_ready = False
                            sync_container_ready = False

                            for container in container_statuses:
                                if container.name == 'database-api' and container.ready:
                                    api_container_ready = True
                                if container.name == 'database-sync' and container.ready:
                                    sync_container_ready = True

                            try:
                                postgres_pods = v1.list_namespaced_pod(namespace='default', label_selector='app=postgres')
                                connection_count = 0

                                if postgres_pods.items:
                                    logging.info(f"Found {len(postgres_pods.items)} PostgreSQL pods, using: {postgres_pods.items[0].metadata.name}")
                                            
                                    # Simplified connection count check
                                    try:
                                        command = "psql -U postgres -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        conn_result = execute_in_pod(
                                            postgres_pods.items[0].metadata.name,
                                            'default', 
                                            command
                                        )
                                        
                                        if conn_result.strip():
                                            import re
                                            numbers = re.findall(r'\d+', conn_result.strip())
                                            if numbers:
                                                try:
                                                    connection_count = int(numbers[0])
                                                    logging.info(f"PostgreSQL connections: {connection_count}")
                                                except ValueError:
                                                    logging.error(f"Could not parse connection count: {conn_result.strip()}")
                                    except Exception as e:
                                        logging.error(f"Error getting database connection count: {e}")
                                        # Fall back to process count as a rough estimate
                                        try:
                                            command = "ps aux | grep -v grep | grep 'postgres' | wc -l"
                                            proc_result = execute_in_pod(
                                                postgres_pods.items[0].metadata.name,
                                                'default',
                                                command
                                            )
                                            if proc_result.strip():
                                                try:
                                                    connection_count = int(proc_result.strip()) - 1  # Subtract 1 for the postgres main process
                                                    if connection_count < 0:
                                                        connection_count = 0
                                                    logging.info(f"Estimated PostgreSQL connections from process count: {connection_count}")
                                                except ValueError:
                                                    logging.error(f"Could not parse process count: {proc_result.strip()}")
                                        except Exception as proc_e:
                                            logging.error(f"Error estimating connections from process count: {proc_e}")

                                else:
                                    logging.warning("No PostgreSQL pods found with label app=postgres")
                                    connection_count = 0
                            except Exception as e:
                                logging.error(f"Error getting database connection count: {e}")
                                connection_count = 0

                            return {
                                "api": "ok" if api_container_ready else "error",
                                "sync": "ok" if sync_container_ready else "error",
                                "uptime": uptime_str,
                                "last_restart": last_restart,
                                "connections": connection_count
                            }
                        elif pod_name_prefix == 'cert-manager':
                            try:
                                api_instance = client.CustomObjectsApi()

                                try:
                                    certificates = api_instance.list_cluster_custom_object(
                                        group="cert-manager.io",
                                        version="v1",
                                        plural="certificates"
                                    )

                                    total_certs = len(certificates.get('items', []))
                                    valid_certs = 0
                                    expiring_soon_certs = 0
                                    expired_certs = 0

                                    for cert in certificates.get('items', []):
                                        status = cert.get('status', {})
                                        conditions = status.get('conditions', [])

                                        is_ready = False
                                        for condition in conditions:
                                            if condition.get('type') == 'Ready' and condition.get('status') == 'True':
                                                is_ready = True
                                                break

                                        if is_ready:
                                            not_after = status.get('notAfter')
                                            if not_after:
                                                try:
                                                    from datetime import datetime, timezone, timedelta
                                                    expiry_date = datetime.strptime(not_after, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                                                    now = datetime.now(timezone.utc)

                                                    if expiry_date < now:
                                                        expired_certs += 1
                                                    elif expiry_date < now + timedelta(days=30):
                                                        expiring_soon_certs += 1
                                                    else:
                                                        valid_certs += 1
                                                except Exception as e:
                                                    logging.error(f"Error parsing certificate expiry: {e}")
                                                    valid_certs += 1
                                            else:
                                                valid_certs += 1
                                        else:
                                            expired_certs += 1
                                except client.exceptions.ApiException as e:
                                    logging.warning(f"Permission error accessing certificates: {e}. Using default values.")
                                    valid_certs = 0
                                    expiring_soon_certs = 0
                                    expired_certs = 0
                                    total_certs = 0

                            except Exception as e:
                                logging.error(f"Error getting certificate counts: {e}")
                                valid_certs = 0
                                expiring_soon_certs = 0
                                expired_certs = 0
                                total_certs = 0

                            all_ready = all(status.ready for status in container_statuses)
                            if all_ready:
                                return {
                                    "status": "ok",
                                    "uptime": uptime_str,
                                    "last_restart": last_restart,
                                    "certificates": {
                                        "valid": valid_certs,
                                        "expiringSoon": expiring_soon_certs,
                                        "expired": expired_certs,
                                        "total": total_certs
                                    }
                                }
                        else:
                            all_ready = all(status.ready for status in container_statuses)
                            if all_ready:
                                return {
                                    "status": "ok",
                                    "uptime": uptime_str,
                                    "last_restart": last_restart
                                }

        if pod_name_prefix == 'database-controller':
            return {
                "api": "error",
                "sync": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "connections": 0
            }
        elif pod_name_prefix == 'cert-manager':
            return {
                "status": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "certificates": {
                    "valid": 0,
                    "expiringSoon": 0,
                    "expired": 0,
                    "total": 0
                }
            }
        return {
            "status": "error",
            "uptime": "unknown",
            "last_restart": "unknown"
        }
    except Exception as e:
        logging.error(f"Error checking pod health for {pod_name_prefix}: {e}")
        if pod_name_prefix == 'database-controller':
            return {
                "api": "error",
                "sync": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "connections": 0
            }
        elif pod_name_prefix == 'cert-manager':
            return {
                "status": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "certificates": {
                    "valid": 0,
                    "expiringSoon": 0,
                    "expired": 0,
                    "total": 0
                }
            }
        return {
            "status": "error",
            "uptime": "unknown",
            "last_restart": "unknown"
        }

@app.route('/api/restart', methods=['POST'])
def restart_deployment():
    """
    Restart a Kubernetes deployment.
    Currently only supports restarting the instance-manager deployment.
    """
    try:
        deployment_name = request.json.get('deployment')

        if not deployment_name:
            return jsonify({"error": "deployment name is required"}), 400

        if deployment_name != 'instance-manager':
            return jsonify({"error": "unauthorized deployment restart attempt"}), 403

        apps_v1 = client.AppsV1Api()

        deployment = apps_v1.read_namespaced_deployment(
            name=deployment_name,
            namespace='default'
        )

        if deployment.spec.template.metadata is None:
            deployment.spec.template.metadata = client.V1ObjectMeta()

        if deployment.spec.template.metadata.annotations is None:
            deployment.spec.template.metadata.annotations = {}

        import datetime
        restart_time = datetime.datetime.now().isoformat()
        deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = restart_time

        apps_v1.patch_namespaced_deployment(
            name=deployment_name,
            namespace='default',
            body=deployment
        )

        return jsonify({
            "success": True,
            "message": f"Deployment {deployment_name} restart initiated at {restart_time}",
            "deployment": deployment_name
        })

    except client.exceptions.ApiException as e:
        logging.error(f"Kubernetes API error: {e}")
        return jsonify({"error": f"Kubernetes API error: {e}"}), 500
    except Exception as e:
        logging.error(f"Error restarting deployment: {e}")
        return jsonify({"error": f"Error restarting deployment: {e}"}), 500

@app.route('/api/pgbouncer/stats', methods=['GET'])
def pgbouncer_stats():
    """
    Get PgBouncer connection pool statistics.
    Returns information about the PgBouncer service and its current connection pools.
    """
    try:
        v1 = client.CoreV1Api()
        pods = v1.list_namespaced_pod(namespace='default', label_selector='app=pgbouncer')

        if not pods.items:
            logging.warning("No PgBouncer pods found")
            return jsonify({
                "status": "error",
                "message": "No PgBouncer pods found"
            }), 404

        pod = pods.items[0]
        pod_status = pod.status.phase

        creation_time = pod.metadata.creation_timestamp
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        uptime_delta = now - creation_time

        days = uptime_delta.days
        hours, remainder = divmod(uptime_delta.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if days > 0:
            uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
        elif hours > 0:
            uptime_str = f"{hours} hours, {minutes} minutes"
        else:
            uptime_str = f"{minutes} minutes"

        try:
            exec_command = "pgbouncer --version"
            version_resp = execute_in_pod(
                pod.metadata.name,
                'default',
                exec_command
            )
            version = version_resp.strip()
        except Exception as e:
            logging.error(f"Error getting PgBouncer version: {e}")
            version = "PgBouncer"

        # Simplified availability check
        try:
            # Check if the PgBouncer is responding on its TCP port
            tcp_command = "nc -z localhost 6432 && echo 'ok' || echo 'error'"
            tcp_result = execute_in_pod(
                pod.metadata.name,
                'default',
                tcp_command
            )
            pgbouncer_status = "ok" if "ok" in tcp_result.lower() else "error"
            logging.info(f"PgBouncer status check: {pgbouncer_status}")
        except Exception as e:
            logging.error(f"Error checking PgBouncer availability: {e}")
            pgbouncer_status = "error"

        return jsonify({
            "status": pgbouncer_status if pod_status == "Running" else "error",
            "version": version,
            "uptime": uptime_str,
            "pod_status": pod_status,
            "message": "Unable to retrieve detailed PgBouncer stats. Authentication failed. Make sure the pgbouncer-admin-credentials secret exists and contains valid credentials. If missing, reinstall PgBouncer using the edurange-installer.",
            "connections": {
                "active": 0,
                "waiting": 0,
                "idle": 0,
                "max_clients": 1000
            },
            "pools": []
        }), 200

    except Exception as e:
        logging.error(f"Error fetching PgBouncer stats: {e}")
        return jsonify({
            "status": "error",
            "message": f"Error fetching PgBouncer stats: {str(e)}"
        }), 500

@app.route('/api/schema', methods=['GET'])
def get_schema():
    """
    Returns the current CDF schema as JSON.
    This endpoint allows other services to fetch the latest schema definition.
    """
    try:
        schema = load_schema()
        if not schema:
            return jsonify({"error": "Failed to load schema"}), 500

        return jsonify(schema), 200
    except Exception as e:
        logging.error(f"Error returning schema: {e}")
        return jsonify({"error": f"Internal error: {str(e)}"}), 500

@app.route('/api/schema/ctd', methods=['GET'])
def get_ctd_schema():
    """Return the CTD schema."""
    from challenge_utils.ctd_loader import get_ctd_schema
    schema = get_ctd_schema()
    if schema:
        return jsonify(schema), 200
    else:
        return jsonify({"error": "CTD schema not available"}), 500

@app.route('/api/challenge-types', methods=['GET'])
def list_challenge_types():
    """
    List all available challenge types.
    Returns both standard types and any custom types found in CTD files.
    """
    challenge_types = get_all_challenge_types()
    return jsonify({"challenge_types": challenge_types}), 200

@app.route('/api/verify-type', methods=['POST'])
def verify_challenge_type():
    """Verify if a challenge type is installed and valid."""
    try:
        data = request.get_json()
        if not data or 'challenge_type' not in data:
            return jsonify({'error': 'Missing challenge_type parameter'}), 400

        challenge_type = data['challenge_type']
        normalized_type = normalize_challenge_type(challenge_type)
        
        # Check if the type is valid and has a CTD file
        is_valid, error_msg = validate_challenge_type(normalized_type)
        if not is_valid:
            return jsonify({
                'isInstalled': False,
                'error': error_msg or 'Invalid challenge type'
            }), 400

        # Check if the type has a valid CTD file
        is_installed = is_valid_ctd_type(normalized_type)
        
        return jsonify({
            'isInstalled': is_installed,
            'normalizedType': normalized_type
        })

    except Exception as e:
        app.logger.error(f"Error verifying challenge type: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/install-type', methods=['POST'])
def install_challenge_type():
    """Install a challenge type."""
    try:
        data = request.get_json()
        if not data or 'challenge_type' not in data:
            return jsonify({'error': 'Missing challenge_type parameter'}), 400

        challenge_type = data['challenge_type']
        normalized_type = normalize_challenge_type(challenge_type)
        
        # Validate the challenge type
        is_valid, error_msg = validate_challenge_type(normalized_type)
        if not is_valid:
            return jsonify({'error': error_msg or 'Invalid challenge type'}), 400

        # Check if already installed
        if is_valid_ctd_type(normalized_type):
            return jsonify({
                'message': f'Challenge type {normalized_type} is already installed',
                'alreadyInstalled': True
            })

        # TODO: Implement actual installation logic here
        # This would involve:
        # 1. Downloading/copying the CTD file to the challenge_types directory
        # 2. Validating the CTD file structure
        # 3. Setting up any necessary resources for the challenge type
        
        return jsonify({
            'message': f'Challenge type {normalized_type} installation not implemented yet',
            'error': 'Installation not implemented'
        }), 501

    except Exception as e:
        app.logger.error(f"Error installing challenge type: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Helper function to list challenge pods
def list_challenge_pods_with_label():
    """List all challenge pods in the default namespace.
    
    Returns:
        List of Kubernetes Pod objects with challenge labels
    """
    try:
        v1 = client.CoreV1Api()
        label_key = os.getenv("CHALLENGE_POD_LABEL_KEY", "app")
        label_value = os.getenv("CHALLENGE_POD_LABEL_VALUE", "ctfchal")
        label_selector = f"{label_key}={label_value}"
        logging.info(f"Using label selector: {label_selector}")
        
        pods = v1.list_namespaced_pod(namespace="default", label_selector=label_selector, watch=False)
        
        if not pods or not pods.items:
            logging.info("No challenge pods found")
            return []
            
        logging.info(f"Found {len(pods.items)} challenge pods")
        return pods.items
    except Exception as e:
        logging.exception(f"Error listing pods: {e}")
        return []

@app.route('/api/upload-ctd', methods=['POST'])
def upload_ctd():
    """
    Endpoint to handle uploading of Challenge Type Definition (CTD) files.
    
    Accepts:
    - POST request with a file upload named 'file'
    - Optional 'type' parameter specifying that this is a CTD upload
    
    Returns:
    - JSON response with info about the uploaded CTD
    """
    try:
        # Check if file is in the request
        if 'file' not in request.files:
            logging.error("No file part in request")
            return jsonify({"error": "No file part in request"}), 400
            
        file = request.files['file']
        
        if file.filename == '':
            logging.error("No selected file")
            return jsonify({"error": "No selected file"}), 400
            
        # Ensure the upload is a ZIP file
        if not file.filename.endswith('.zip'):
            logging.error(f"Invalid file type: {file.filename}")
            return jsonify({"error": "Only .zip files are supported"}), 400
        
        # Create a temporary directory to extract the zip
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save the uploaded file to temporary directory
            temp_zip_path = os.path.join(temp_dir, werkzeug.utils.secure_filename(file.filename))
            file.save(temp_zip_path)
            
            # Extract the zip file
            try:
                with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                logging.info(f"Successfully extracted zip file to {temp_dir}")
            except zipfile.BadZipFile:
                logging.error("Invalid zip file")
                return jsonify({"error": "Invalid zip file"}), 400
            
            # Look for .ctd.json file in the extracted directory
            ctd_files = []
            for root, _, files in os.walk(temp_dir):
                for filename in files:
                    if filename.endswith('.ctd.json'):
                        ctd_files.append(os.path.join(root, filename))
            
            if not ctd_files:
                logging.error("No .ctd.json file found in the uploaded zip")
                return jsonify({"error": "No .ctd.json file found in the uploaded zip"}), 400
                
            # Use the first CTD file found
            ctd_file_path = ctd_files[0]
            logging.info(f"Found CTD file: {ctd_file_path}")
            
            # Parse and validate the CTD file
            try:
                with open(ctd_file_path, 'r') as f:
                    ctd_data = json.load(f)
                    
                # Check if typeId is present
                if 'typeId' not in ctd_data:
                    logging.error("CTD file missing required 'typeId' field")
                    return jsonify({"error": "CTD file missing required 'typeId' field"}), 400
                    
                # Get the type ID from the CTD
                type_id = ctd_data['typeId']
                logging.info(f"CTD type ID: {type_id}")
                
                # Validate against schema
                if CTD_SCHEMA:
                    try:
                        jsonschema.validate(instance=ctd_data, schema=CTD_SCHEMA)
                        logging.info(f"CTD validation successful for '{type_id}'")
                    except jsonschema.ValidationError as schema_error:
                        error_path = '/'.join(str(part) for part in schema_error.path) if schema_error.path else "root"
                        schema_path = '/'.join(str(part) for part in schema_error.schema_path) if schema_error.schema_path else "unknown"
                        
                        logging.error(f"CTD validation error at path '{error_path}': {schema_error.message}")
                        logging.error(f"Schema path for error: {schema_path}")
                        return jsonify({
                            "error": f"CTD validation failed: {schema_error.message}",
                            "errorPath": error_path,
                            "schemaPath": schema_path
                        }), 400
                else:
                    logging.warning("CTD schema not available, skipping validation")
                    
                # Save the CTD file to the challenge_types directory
                target_filename = f"{type_id}.ctd.json"
                target_path = os.path.join(CTD_DIR, target_filename)
                
                # Check if file already exists and set a flag if we're overwriting
                is_update = False    
                if os.path.exists(target_path):
                    is_update = True
                    logging.warning(f"CTD file for type '{type_id}' already exists and will be overwritten")
                    
                # Create the directory if it doesn't exist
                os.makedirs(CTD_DIR, exist_ok=True)
                
                # Copy the CTD file to the target location
                shutil.copy2(ctd_file_path, target_path)
                logging.info(f"Saved CTD file to {target_path}")
                
                # Clear the cache if this type was previously loaded
                if type_id in _ctd_cache:
                    del _ctd_cache[type_id]
                    logging.info(f"Cleared cache for CTD type '{type_id}'")
                
                # Look for and copy supporting files if necessary
                supporting_files = []
                for root, _, files in os.walk(temp_dir):
                    for filename in files:
                        if filename != os.path.basename(ctd_file_path) and not filename.endswith('.ctd.json'):
                            src_path = os.path.join(root, filename)
                            # Copy supporting files to a directory named after the type ID
                            support_dir = os.path.join(CTD_DIR, type_id)
                            os.makedirs(support_dir, exist_ok=True)
                            dest_path = os.path.join(support_dir, filename)
                            shutil.copy2(src_path, dest_path)
                            supporting_files.append(filename)
                
                # Generate appropriate message based on whether we updated or created
                message = f"Successfully {'updated' if is_update else 'installed'} CTD for type '{type_id}'"
                
                return jsonify({
                    "success": True,
                    "message": message,
                    "typeName": type_id,
                    "version": ctd_data.get('version', 'unknown'),
                    "description": ctd_data.get('description', ''),
                    "supportingFiles": supporting_files,
                    "isUpdate": is_update
                }), 200
                
            except json.JSONDecodeError as e:
                logging.error(f"Invalid JSON in CTD file: {e}")
                return jsonify({"error": f"Invalid JSON in CTD file: {str(e)}"}), 400
            except Exception as e:
                logging.error(f"Error processing CTD file: {e}")
                return jsonify({"error": f"Error processing CTD file: {str(e)}"}), 500
    
    except Exception as e:
        logging.exception(f"Unexpected error during CTD upload: {e}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/delete-ctd/<type_id>', methods=['DELETE'])
def delete_ctd(type_id):
    """
    Endpoint to handle deletion of Challenge Type Definition (CTD) files.
    
    Accepts:
    - DELETE request with type_id in the URL path
    
    Returns:
    - JSON response with info about the deleted CTD
    """
    try:
        if not type_id:
            logging.error("No type ID provided")
            return jsonify({"error": "No type ID provided"}), 400
        
        # Check if file exists
        target_filename = f"{type_id}.ctd.json"
        target_path = os.path.join(CTD_DIR, target_filename)
        
        if not os.path.exists(target_path):
            logging.error(f"CTD file for type '{type_id}' not found")
            return jsonify({"error": f"CTD file for type '{type_id}' not found"}), 404
            
        # Check if we have supporting files for this type
        support_dir = os.path.join(CTD_DIR, type_id)
        has_support_files = os.path.exists(support_dir) and os.path.isdir(support_dir)
        
        # Delete the CTD file
        os.remove(target_path)
        logging.info(f"Deleted CTD file: {target_path}")
        
        # Delete supporting files if they exist
        if has_support_files:
            shutil.rmtree(support_dir)
            logging.info(f"Deleted supporting files directory: {support_dir}")
        
        # Clear the cache if this type was previously loaded
        if type_id in _ctd_cache:
            del _ctd_cache[type_id]
            logging.info(f"Cleared cache for CTD type '{type_id}'")
        
        return jsonify({
            "success": True,
            "message": f"Successfully deleted CTD for type '{type_id}'",
            "typeId": type_id,
            "hadSupportingFiles": has_support_files
        }), 200
        
    except Exception as e:
        logging.exception(f"Error deleting CTD file: {e}")
        return jsonify({"error": f"An error occurred while deleting the CTD: {str(e)}"}), 500
