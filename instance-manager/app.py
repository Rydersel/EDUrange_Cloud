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
import threading
import requests
import zipfile
import io
import shutil
import tempfile
import werkzeug.utils
import redis
import uuid
import random
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
    delete_pod_force,
    create_service,
    create_ingress,
    create_k8s_client_from_config,
    delete_resources,
    get_k8s_clients
)
from challenge_utils.pod_management import delete_challenge_pod
from challenge_utils.queue_workers import init_all_workers, init_worker
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
from challenge_utils.redis_manager import get_redis  # Import the new Redis manager
from challenge_utils.queue_manager import get_queue, ChallengeQueue
from challenge_utils.performance_monitor import get_performance_monitor
from challenge_utils.rate_limiter import SimpleRateLimiter
from challenge_utils.logger import get_logger

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

# Initialize Redis connection using the new Redis manager
try:
    redis_client = get_redis()
    # Check connection
    if redis_client.is_connected:
        logging.info(f"Successfully connected to Redis using RedisManager")

        # Rate limiter for challenge deployment operations (Redis-based)
        deployment_limiter = SimpleRateLimiter(
            redis_client=redis_client,
            key_prefix="im_rate_limit",
            points=20,  # 20 deployments
            duration=60,  # per minute
            block_duration=60 * 2  # 2 minute block if exceeded
        )
        logging.info("Redis-based rate limiter initialized")
    else:
        raise ConnectionError("Redis connection not healthy")
except Exception as e:
    logging.warning(f"Failed to connect to Redis: {e}")
    logging.warning("Falling back to memory-based rate limiter")
    # Fallback to memory-based rate limiter if Redis is not available
    deployment_limiter = SimpleRateLimiter(
        points=20,  # 20 deployments
        duration=60,  # per minute
        block_duration=60 * 2  # 2 minute block if exceeded
    )


@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        # First validate that we have a valid JSON request with all required fields
        json_data = request.json
        logging.info(f"Received start-challenge request with keys: {list(json_data.keys() if json_data else [])}")

        validation_result, error_message = validate_request_json(json_data, ['user_id', 'cdf_content', 'competition_id',
                                                                             'deployment_name'])
        if not validation_result:
            logging.error(f"Request validation failed: {error_message}")
            return jsonify({"error": error_message}), 400

        user_id = json_data['user_id']
        cdf_content_str = json_data['cdf_content']
        competition_id = json_data['competition_id']
        deployment_name = json_data['deployment_name']

        # Start performance tracking with a unique task ID
        task_id = str(uuid.uuid4())
        perf_monitor = get_performance_monitor()
        tracker = perf_monitor.start_tracking(task_id, user_id=user_id)

        # Start validation phase
        perf_monitor.start_phase(task_id, perf_monitor.PHASE_VALIDATION)

        # Get user role from request if available (default to student)
        user_role = json_data.get('user_role', 'student').lower()

        # Apply rate limiting based on user ID
        try:
            client_ip = request.remote_addr
            rate_limit_key = f"{client_ip}:{user_id}"
            deployment_limiter.consume(rate_limit_key)
            logging.info(f"Rate limit check passed for user {user_id}")
        except Exception as e:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", "rate_limit_exceeded")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.warning(f"Rate limit exceeded for user {user_id}: {e}")
            retry_after = getattr(e, "seconds_before_next", 120)
            return jsonify({
                "error": "Too many challenge deployments. Please wait before starting more challenges.",
                "retryAfter": retry_after
            }), 429

        logging.info(
            f"Processing challenge deployment request: user_id={user_id}, competition_id={competition_id}, deployment_name={deployment_name}")

        # Validate the deployment name format
        validation_result, error_message = validate_instance_name(deployment_name)
        if not validation_result:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", "invalid_deployment_name")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error(f"Invalid deployment_name received: {deployment_name} - {error_message}")
            return jsonify({"error": f"Invalid deployment_name: {error_message}"}), 400

    except Exception as e:
        # Handle exception in initial request processing
        try:
            perf_monitor = get_performance_monitor()
            perf_monitor.add_tag(task_id, "failure_reason", f"request_processing_error: {str(e)}")
            perf_monitor.complete_tracking(task_id, success=False)
        except:
            pass  # Avoid nested exceptions

        logging.error(f"Error processing request JSON: {e}")
        return jsonify({"error": f"Invalid request format: {e}"}), 400

    try:
        # End validation phase and start preparation phase
        perf_monitor.end_phase(task_id)
        perf_monitor.start_phase(task_id, perf_monitor.PHASE_PREPARE)

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
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", f"cdf_parse_error: {str(e)}")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error(f"Failed to parse CDF content: {str(e)}")
            logging.debug(f"CDF content excerpt: {str(cdf_content_str)[:500]}...")
            return jsonify({"error": f"Failed to parse CDF content: {str(e)}"}), 400

        # Validate the CDF structure against schema
        try:
            validate_cdf(cdf_data)
            logging.info("CDF schema validation passed")
        except Exception as e:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", f"cdf_validation_error: {str(e)}")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error(f"CDF validation failed: {str(e)}")
            return jsonify({"error": f"CDF validation failed: {str(e)}"}), 400

        challenge_type = cdf_data.get('metadata', {}).get('challenge_type')
        if not challenge_type:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", "missing_challenge_type")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error("Missing challenge_type in CDF metadata")
            return jsonify({"error": "Missing challenge_type in CDF metadata"}), 400

        # Validate the challenge type
        validation_result, error_message = validate_challenge_type(challenge_type)
        if not validation_result:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", f"invalid_challenge_type: {error_message}")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.warning(f"Challenge type validation issue: {error_message}")
            return jsonify({"error": f"Invalid challenge type: {error_message}"}), 400

        # Normalize the challenge type
        original_type = challenge_type
        challenge_type = normalize_challenge_type(challenge_type)
        if challenge_type != original_type:
            logging.info(f"Normalized challenge type from '{original_type}' to '{challenge_type}'")
            # Update the challenge type in the CDF data
            cdf_data['metadata']['challenge_type'] = challenge_type

        # Update the tracker with the challenge type
        perf_monitor.add_tag(task_id, "challenge_type", challenge_type)

        # Check if we have a handler for this challenge type
        HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
        if not HandlerClass:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", f"unsupported_challenge_type: {challenge_type}")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error(f"Unsupported challenge type: {challenge_type}")
            available_types = list(CHALLENGE_HANDLERS.keys())
            logging.error(f"Available challenge types: {available_types}")
            return jsonify(
                {"error": f"Unsupported challenge type: {challenge_type}. Available types: {available_types}"}), 400

        # Get the challenge queue
        queue = get_queue()

        # Determine priority based on user role
        priority = queue.PRIORITY_NORMAL  # Default priority
        if user_role == 'admin' or user_role == 'instructor':
            priority = queue.PRIORITY_HIGH
            logging.info(f"Setting HIGH priority for {user_role} deployment")
        elif user_role == 'student':
            priority = queue.PRIORITY_NORMAL
            logging.info(f"Setting NORMAL priority for student deployment")
        else:
            # For any unknown role, use LOW priority
            priority = queue.PRIORITY_LOW
            logging.info(f"Setting LOW priority for unknown role: {user_role}")

        # Add priority info to performance tracker
        perf_monitor.add_tag(task_id, "priority", priority)
        perf_monitor.add_tag(task_id, "user_role", user_role)

        # Prepare the challenge data for the queue
        challenge_data = {
            'user_id': user_id,
            'cdf_content': cdf_data,
            'competition_id': competition_id,
            'deployment_name': deployment_name,
            'challenge_type': challenge_type,
            'handler_class': HandlerClass.__name__,
            'timestamp': datetime.now().isoformat(),
            'perf_task_id': task_id,  # Include the performance tracking ID
            'challenge_id': cdf_data.get('id') or deployment_name  # Add explicit challenge_id
        }

        # Add challenge_id to metadata for easier reference
        challenge_data['metadata'] = {
            'task_id': task_id,
            'challenge_id': cdf_data.get('id') or deployment_name,
            'enqueued_at': datetime.now().isoformat()
        }

        # End preparation phase and start queue wait phase
        perf_monitor.end_phase(task_id)
        perf_monitor.start_phase(task_id, perf_monitor.PHASE_QUEUE)

        # Add to the queue
        # Note: We use the same task_id for both queue and performance tracking
        queue_task_id = queue.enqueue(challenge_data, task_id=task_id, priority=priority)
        if not queue_task_id:
            # End performance tracking with failure status
            perf_monitor.add_tag(task_id, "failure_reason", "queue_enqueue_failure")
            perf_monitor.complete_tracking(task_id, success=False)

            logging.error("Failed to enqueue challenge deployment task")
            return jsonify({
                "error": "Failed to queue challenge deployment. Try again later.",
                "queued": False
            }), 500

        # Get queue stats (for informational purposes)
        queue_stats = queue.get_queue_stats()

        # Add queue stats to performance tracker
        perf_monitor.add_tag(task_id, "queue_position", queue_stats.get("queued", 0))
        perf_monitor.add_tag(task_id, "queue_total", queue_stats.get("total", 0))

        # Return a success response with the task ID
        return jsonify({
            "success": True,
            "queued": True,
            "task_id": task_id,
            "message": "Challenge deployment has been queued",
            "queue_position": queue_stats.get("queued", 0),
            "priority": priority,
            "status": "queued"
        }), 202  # 202 Accepted indicates the request has been accepted for processing

    except (ValueError, jsonschema.ValidationError) as e:
        # End performance tracking with failure status
        perf_monitor.add_tag(task_id, "failure_reason", f"validation_error: {str(e)}")
        perf_monitor.complete_tracking(task_id, success=False)

        logging.error(f"CDF Loading/Validation Error: {e}")
        return jsonify({"error": f"Invalid CDF content: {e}"}), 400
    except Exception as e:
        # End performance tracking with failure status
        perf_monitor.add_tag(task_id, "failure_reason", f"unexpected_error: {str(e)}")
        perf_monitor.complete_tracking(task_id, success=False)

        stack_trace = traceback.format_exc()
        logging.exception(f"Unexpected error during challenge start: {e}")
        logging.error(f"Stack trace: {stack_trace}")
        return jsonify({"error": f"An internal error occurred while starting the challenge: {str(e)}"}), 500


@app.route('/api/start-queue-worker', methods=['POST'])
def start_queue_worker():
    """Start the queue worker thread to process challenge deployments."""
    queue = get_queue()

    if queue.worker_thread and queue.worker_thread.is_alive():
        return jsonify({
            "success": False,
            "message": "Queue worker is already running"
        }), 400

    # Define the callback function to process challenge deployments
    def deploy_challenge(task_data):
        try:
            user_id = task_data.get('user_id')
            cdf_data = task_data.get('cdf_content')
            competition_id = task_data.get('competition_id')
            deployment_name = task_data.get('deployment_name')
            challenge_type = task_data.get('challenge_type')
            task_id = task_data.get('perf_task_id')

            # Get the performance monitor
            perf_monitor = None
            if task_id:
                try:
                    perf_monitor = get_performance_monitor()
                    # End the queue wait phase and start k8s resources creation phase
                    perf_monitor.end_phase(task_id)
                    perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)
                except Exception as e:
                    logging.error(f"Error initializing performance monitor: {e}")

            # Get the handler class
            HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
            if not HandlerClass:
                # Record failure in performance monitor if we have a task_id
                if task_id and perf_monitor:
                    try:
                        perf_monitor.add_tag(task_id, "failure_reason", f"unsupported_challenge_type: {challenge_type}")
                        summary = perf_monitor.complete_tracking(task_id, success=False)

                        # Print performance results for failed deployments
                        logging.info(f"[PERFORMANCE] Failed deployment of challenge type: {challenge_type}")
                        logging.info(f"[PERFORMANCE] Reason: Unsupported challenge type")
                        logging.info(
                            f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")
                    except Exception as e:
                        logging.error(f"Error recording performance failure: {e}")

                    logging.error(f"Unsupported challenge type: {challenge_type}")
                    return {
                        "success": False,
                        "error": f"Unsupported challenge type: {challenge_type}"
                    }

                # Instantiate the handler
                logging.info(f"Instantiating handler {HandlerClass.__name__} for type {challenge_type}")
                handler_instance = HandlerClass(user_id, cdf_data, competition_id, deployment_name)

                # Deploy the challenge
                logging.info(f"Starting deployment for instance {deployment_name}")

                # Update performance phase if we have a task_id
                if task_id and perf_monitor:
                    try:
                        perf_monitor.end_phase(task_id)
                        perf_monitor.start_phase(task_id, perf_monitor.PHASE_WAIT_RUNNING)
                    except Exception as e:
                        logging.error(f"Error updating performance phase: {e}")

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

                    # Complete performance tracking with success
                    if task_id and perf_monitor:
                        try:
                            # End the final phase
                            perf_monitor.end_phase(task_id)

                            # Add deployment result data
                            for key, value in deployment_info.items():
                                # Skip complex objects that might not serialize well
                                if isinstance(value, (str, int, float, bool)) or value is None:
                                    perf_monitor.add_tag(task_id, f"result_{key}", value)

                            # Complete tracking
                            summary = perf_monitor.complete_tracking(task_id, success=True)

                            # Print performance results to console
                            logging.info(f"[PERFORMANCE] Deployment of {log_deployment_name} completed")
                            logging.info(
                                f"[PERFORMANCE] Total duration: {summary.get('total_duration', 0):.2f} seconds")

                            # Log each phase duration
                            for phase_name, phase_data in summary.get('phases', {}).items():
                                if 'duration' in phase_data:
                                    logging.info(
                                        f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                            # Log any metadata tags that might be useful
                            for key, value in summary.get('metadata', {}).items():
                                if key.startswith('result_') or key in ['challenge_type', 'user_id', 'success']:
                                    logging.info(f"[PERFORMANCE] {key}: {value}")
                        except Exception as e:
                            logging.error(f"Error completing performance tracking: {e}")

                    return deployment_info
                else:
                    logging.error(f"Deployment failed for {log_deployment_name}: {deployment_info.get('error')}")

                    # Complete performance tracking with failure
                    if task_id and perf_monitor:
                        try:
                            perf_monitor.add_tag(task_id, "failure_reason",
                                                 f"deployment_failure: {deployment_info.get('error')}")
                            summary = perf_monitor.complete_tracking(task_id, success=False)

                            # Print performance results for failed deployments
                            logging.info(f"[PERFORMANCE] Failed deployment of {log_deployment_name}")
                            logging.info(
                                f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                            # Log each phase duration
                            for phase_name, phase_data in summary.get('phases', {}).items():
                                if 'duration' in phase_data:
                                    logging.info(
                                        f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                            logging.info(
                                f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                        except Exception as e:
                            logging.error(f"Error recording performance failure: {e}")

                    return {
                        "success": False,
                        "error": deployment_info.get('error', "Deployment failed internally")
                    }
        except Exception as e:
            stack_trace = traceback.format_exc()
            logging.exception(f"Unexpected error during challenge deploy: {e}")
            logging.error(f"Stack trace: {stack_trace}")

            # Complete performance tracking with failure
            if 'task_id' in locals() and task_id and 'perf_monitor' in locals() and perf_monitor:
                try:
                    perf_monitor.add_tag(task_id, "failure_reason", f"exception: {str(e)}")
                    summary = perf_monitor.complete_tracking(task_id, success=False)

                    # Print performance results for failed deployments
                    logging.info(f"[PERFORMANCE] Failed deployment due to exception")
                    logging.info(
                        f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                    # Log each phase duration
                    for phase_name, phase_data in summary.get('phases', {}).items():
                        if 'duration' in phase_data:
                            logging.info(
                                f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                    logging.info(
                        f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                except Exception as perf_e:
                    logging.error(f"Error recording performance failure: {perf_e}")

                return {
                    "success": False,
                    "error": f"An internal error occurred while deploying the challenge: {str(e)}"
                }

        # Start the worker with the deploy_challenge callback
        success = queue.start_worker(deploy_challenge, interval=1)

        if success:
            return jsonify({
                "success": True,
                "message": "Queue worker started successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to start queue worker"
            }), 500


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
        user_id = json_data.get('user_id', 'system')
        user_role = json_data.get('user_role', 'student').lower()

        # Validate the deployment name
        validation_result, error_message = validate_instance_name(pod_name)
        if not validation_result:
            logging.error(f"Invalid pod_name received: {pod_name} - {error_message}")
            return jsonify({"error": f"Invalid pod_name: {error_message}"}), 400

    except Exception as e:
        logging.error(f"Error processing request JSON: {e}")
        return jsonify({"error": f"Invalid request format: {e}"}), 400

    logging.info(f"[RESOURCE CLEANUP] Queuing cleanup for challenge pod: {pod_name}")

    # Start performance tracking
    task_id = str(uuid.uuid4())
    perf_monitor = get_performance_monitor()
    perf_monitor.start_tracking(task_id, user_id=user_id, challenge_type="termination")
    perf_monitor.start_phase(task_id, perf_monitor.PHASE_VALIDATION)

    # Get the termination queue
    termination_queue = get_queue(ChallengeQueue.QUEUE_TERMINATION)

    # Determine priority based on user role
    priority = termination_queue.PRIORITY_NORMAL  # Default priority
    if user_role == 'admin' or user_role == 'instructor':
        priority = termination_queue.PRIORITY_HIGH
        logging.info(f"Setting HIGH priority for {user_role} termination")
    elif user_role == 'student':
        priority = termination_queue.PRIORITY_NORMAL
        logging.info(f"Setting NORMAL priority for student termination")
    else:
        # For any unknown role, use LOW priority
        priority = termination_queue.PRIORITY_LOW
        logging.info(f"Setting LOW priority for unknown role: {user_role}")

    # Add priority info to performance tracker
    perf_monitor.add_tag(task_id, "priority", priority)
    perf_monitor.add_tag(task_id, "user_role", user_role)

    # End validation phase and start queue phase
    perf_monitor.end_phase(task_id)
    perf_monitor.start_phase(task_id, perf_monitor.PHASE_QUEUE)

    # Prepare termination data
    termination_data = {
        'deployment_name': pod_name,
        'namespace': namespace,
        'user_id': user_id,
        'timestamp': datetime.now().isoformat(),
        'perf_task_id': task_id,
        'challenge_id': pod_name  # Use pod_name as challenge_id for termination
    }

    # Add metadata with challenge_id for easier reference
    termination_data['metadata'] = {
        'task_id': task_id,
        'challenge_id': pod_name,
        'enqueued_at': datetime.now().isoformat()
    }

    # Add to the termination queue
    queue_task_id = termination_queue.enqueue(termination_data, task_id=task_id, priority=priority)
    if not queue_task_id:
        # End performance tracking with failure status
        perf_monitor.add_tag(task_id, "failure_reason", "queue_enqueue_failure")
        perf_monitor.complete_tracking(task_id, success=False)

        logging.error(f"Failed to enqueue termination request for {pod_name}")
        return jsonify({
            "success": False,
            "error": "Failed to enqueue termination request"
        }), 500

    return jsonify({
        "success": True,
        "message": f"Termination of {pod_name} queued successfully",
        "task_id": task_id,
        "status": "queued"
    }), 202


@app.route('/api/list-challenge-pods', methods=['GET'])
def list_challenge_pods():
    from challenge_utils.logger import get_logger
    log = get_logger()
    
    log.debug("Received request to list challenge pods")
    try:
        # Get all pods with the challenge label
        pods = list_challenge_pods_with_label()
        log.debug(f"Retrieved {len(pods)} total pods from Kubernetes")

        challenge_pods = []

        for pod in pods:
            log.debug(f"Processing pod: {pod.metadata.name}", rate_limit_seconds=10)
            try:
                status = get_pod_status(pod)
                
                # Use our custom pod_status method to track and log only status changes
                log.pod_status(pod.metadata.name, status)

                # Extract metadata using correct label keys
                user_id = pod.metadata.labels.get('user', 'unknown')
                competition_id = pod.metadata.labels.get('competition_id', 'unknown')
                challenge_type = pod.metadata.labels.get('challenge_type', 'unknown')
                challenge_name = pod.metadata.labels.get('challenge_name', 'unknown')

                log.debug(
                    f"Pod {pod.metadata.name} metadata - user_id: {user_id}, competition_id: {competition_id}, type: {challenge_type}, name: {challenge_name}",
                    rate_limit_seconds=30
                )

                # Get the instance name from pod name or label
                instance_name = pod.metadata.name

                # Get domain with fallback from env vars
                domain = os.getenv("DOMAIN")
                if not domain:
                    domain = os.getenv("INGRESS_URL", "edurange.cloud")
                    # Use static_once to only log this message once
                    log.log_static_once(f"DOMAIN not set, using INGRESS_URL: {domain}")

                log.debug(f"Using domain for URLs: {domain}", rate_limit_seconds=60)

                # Build URLs using external domain instead of pod IP
                webos_url = f"https://{instance_name}.{domain}"
                # For non-web challenges, terminal URL is the same as the main domain
                web_console_url = f"https://{instance_name}.{domain}" if challenge_type != 'web' else None
                web_challenge_url = f"https://web-{instance_name}.{domain}" if challenge_type == 'web' else None

                urls = {
                    'terminal': web_console_url,
                    'challenge': web_challenge_url
                }

                # Flag secret name follows a standard pattern
                flag_secret_name = f"flag-secret-{instance_name}"

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
                    'flag_secret_name': flag_secret_name  # Add the flag secret name
                }
                challenge_pods.append(pod_info)
                log.debug(f"Added pod info to response: {pod_info}", rate_limit_seconds=10)

            except Exception as e:
                log.error(f"Error processing pod {pod.metadata.name}: {str(e)}")
                continue

        log.debug(f"Returning {len(challenge_pods)} challenge pods")
        return jsonify({'challenge_pods': challenge_pods})

    except Exception as e:
        log.error(f"Error in list-challenge-pods endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/get-secret', methods=['POST'])
def get_secret_value():
    try:
        from challenge_utils.logger import get_logger
        log = get_logger()
        
        json_data = request.json
        if not json_data:
            return jsonify({"error": "Invalid request format - JSON body required"}), 400

        # Get the secret name from the request
        secret_name = json_data.get('secret_name')
        if not secret_name:
            return jsonify({"error": "Missing secret_name parameter"}), 400

        # Get namespace (default to 'default')
        namespace = json_data.get('namespace', 'default')

        # Try to get the secret
        log.debug(f"Attempting to retrieve secret '{secret_name}' from namespace '{namespace}'", rate_limit_seconds=30)
        
        secret = get_secret(secret_name, namespace)
        potential_secret_names = [secret_name]  # Keep track of all names we try

        # If not found, try different naming patterns
        if not secret:
            log.warning(f"Secret '{secret_name}' not found in namespace '{namespace}'")

            # Extract pod ID if it's in 'flag-secret-{podid}' format
            if secret_name.startswith('flag-secret-'):
                pod_id = secret_name[len('flag-secret-'):]
                log.debug(f"Extracted pod ID from secret name: {pod_id}")

                # Add alternative names to try
                potential_secret_names.extend([
                    f"ctfchal-{pod_id}",  # Legacy format
                    f"flag-{pod_id}"  # Alternative format
                ])
            # Extract pod ID if it's in 'ctfchal-{podid}' format
            elif secret_name.startswith('ctfchal-'):
                pod_id = secret_name[len('ctfchal-'):]
                log.debug(f"Extracted pod ID from ctfchal name: {pod_id}")

                # Add alternative names to try
                potential_secret_names.extend([
                    f"flag-secret-{pod_id}",  # New format
                    f"flag-{pod_id}"  # Alternative format
                ])

            # Try all potential names
            for name in potential_secret_names[1:]:  # Skip the first one as we already tried it
                log.debug(f"Trying alternative secret name: {name}")
                secret = get_secret(name, namespace)
                if secret:
                    log.info(f"Found secret using alternative name: {name}")
                    break

        # If we found a secret, process and return its value
        if secret:
            try:
                # Use the custom secret_operation method to log appropriately
                log.secret_operation("retrieved", secret_name, True)
                
                decoded_data = decode_secret_data(secret)
                log.debug(f"Decoded data keys: {list(decoded_data.keys()) if decoded_data else 'No decoded data'}")

                # First check for a 'flag' key
                if decoded_data and 'flag' in decoded_data:
                    secret_value = decoded_data.get('flag')
                    log.secret_operation("retrieved flag from", secret_name, True, len(secret_value))
                    return jsonify({"secret_value": secret_value})

                # If 'flag' key doesn't exist, return the first value as fallback
                if decoded_data and len(decoded_data) > 0:
                    first_key = list(decoded_data.keys())[0]
                    secret_value = decoded_data.get(first_key)
                    log.debug(f"No 'flag' key found, using first key '{first_key}' as fallback (length: {len(secret_value)})")
                    return jsonify({"secret_value": secret_value})

                log.warning(f"Secret exists but contains no usable data")
            except Exception as e:
                log.error(f"Error decoding secret data: {str(e)}")
                return jsonify({"error": f"Error decoding secret data: {str(e)}", "secret_value": "null"}), 500

        # If we still don't have a secret, try to find it in the pod
        pod_id = None

        # Try to extract pod ID from various formats
        if secret_name.startswith('flag-secret-'):
            pod_id = secret_name[len('flag-secret-'):]
        elif secret_name.startswith('ctfchal-'):
            pod_id = secret_name[len('ctfchal-'):]

        if pod_id:
            log.debug(f"Checking pod {pod_id} for FLAG environment variable")
            try:
                v1 = client.CoreV1Api()
                pod = v1.read_namespaced_pod(name=pod_id, namespace=namespace)

                # Check all containers in the pod for the FLAG
                for container in pod.spec.containers:
                    if container.name == 'challenge-container':
                        log.debug(f"Found challenge-container in pod {pod_id}")

                        # First check for directly set FLAG value
                        for env in container.env:
                            if env.name == 'FLAG' and env.value:
                                log.debug(f"Found direct FLAG env var in challenge-container for pod {pod_id}")
                                return jsonify({"secret_value": env.value})

                        # Then check for valueFrom references
                        for env in container.env:
                            if env.name == 'FLAG' and env.value_from and env.value_from.secret_key_ref:
                                ref_secret_name = env.value_from.secret_key_ref.name
                                ref_key = env.value_from.secret_key_ref.key
                                log.debug(f"Found FLAG env var with secretKeyRef: name={ref_secret_name}, key={ref_key}")

                                # Get the referenced secret
                                try:
                                    ref_secret = get_secret(ref_secret_name, namespace)
                                    if ref_secret:
                                        ref_decoded = decode_secret_data(ref_secret)
                                        if ref_decoded and ref_key in ref_decoded:
                                            secret_value = ref_decoded[ref_key]
                                            log.debug(f"Retrieved FLAG value from referenced secret (length: {len(secret_value)})")
                                            return jsonify({"secret_value": secret_value})
                                except Exception as e:
                                    log.error(f"Error retrieving referenced secret: {str(e)}")

                    # Check the webos container for FLAG_SECRET_NAME
                    if container.name == 'webos':
                        for env in container.env:
                            if env.name == 'FLAG_SECRET_NAME' and env.value:
                                alt_secret_name = env.value
                                log.debug(f"Found FLAG_SECRET_NAME in webos container: {alt_secret_name}")

                                # Try to get this secret
                                try:
                                    alt_secret = get_secret(alt_secret_name, namespace)
                                    if alt_secret:
                                        alt_decoded = decode_secret_data(alt_secret)
                                        if alt_decoded and 'flag' in alt_decoded:
                                            secret_value = alt_decoded['flag']
                                            log.debug(f"Retrieved flag from webos FLAG_SECRET_NAME (length: {len(secret_value)})")
                                            return jsonify({"secret_value": secret_value})
                                        elif alt_decoded and len(alt_decoded) > 0:
                                            first_key = list(alt_decoded.keys())[0]
                                            secret_value = alt_decoded[first_key]
                                            log.debug(f"No 'flag' key found in webos secret, using first key '{first_key}' as fallback")
                                            return jsonify({"secret_value": secret_value})
                                except Exception as e:
                                    log.error(f"Error retrieving webos-referenced secret: {str(e)}")

            except Exception as pod_error:
                log.error(f"Error checking pod {pod_id} for FLAG env var: {pod_error}")

        # If we get here, we couldn't find the flag anywhere
        log.warning(f"Secret {secret_name} not found after trying multiple approaches")
        return jsonify({"error": f"Secret {secret_name} not found", "secret_value": "null"}), 404

    except Exception as e:
        from challenge_utils.logger import get_logger
        log = get_logger()
        log.error(f"Error in get-secret route: {e}")
        return jsonify({"error": str(e), "secret_value": "null"}), 500


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
                "status": database_status["status"] if isinstance(database_status,
                                                                  dict) and "status" in database_status else "error",
                "uptime": database_status["uptime"] if isinstance(database_status,
                                                                  dict) and "uptime" in database_status else "unknown",
                "last_restart": database_status["last_restart"] if isinstance(database_status,
                                                                              dict) and "last_restart" in database_status else "unknown",
                "controller": db_controller_status
            }

            cert_manager_info = cert_manager_status if isinstance(cert_manager_status, dict) else {"status": "error",
                                                                                                   "uptime": "unknown",
                                                                                                   "last_restart": "unknown"}

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
                                postgres_pods = v1.list_namespaced_pod(namespace='default',
                                                                       label_selector='app=postgres')
                                connection_count = 0

                                if postgres_pods.items:
                                    logging.info(
                                        f"Found {len(postgres_pods.items)} PostgreSQL pods, using: {postgres_pods.items[0].metadata.name}")

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
                                                    logging.error(
                                                        f"Could not parse connection count: {conn_result.strip()}")
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
                                                    connection_count = int(
                                                        proc_result.strip()) - 1  # Subtract 1 for the postgres main process
                                                    if connection_count < 0:
                                                        connection_count = 0
                                                    logging.info(
                                                        f"Estimated PostgreSQL connections from process count: {connection_count}")
                                                except ValueError:
                                                    logging.error(
                                                        f"Could not parse process count: {proc_result.strip()}")
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
                                                    expiry_date = datetime.strptime(not_after,
                                                                                    "%Y-%m-%dT%H:%M:%SZ").replace(
                                                        tzinfo=timezone.utc)
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
                                    logging.warning(
                                        f"Permission error accessing certificates: {e}. Using default values.")
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
        log = get_logger()
        
        v1 = client.CoreV1Api()
        label_key = os.getenv("CHALLENGE_POD_LABEL_KEY", "app")
        label_value = os.getenv("CHALLENGE_POD_LABEL_VALUE", "ctfchal")
        label_selector = f"{label_key}={label_value}"
        
        # Rate limit this message in production to once per minute
        log.debug(f"Using label selector: {label_selector}", rate_limit_seconds=60)

        pods = v1.list_namespaced_pod(namespace="default", label_selector=label_selector, watch=False)

        if not pods or not pods.items:
            # Rate limit "no pods" messages
            log.debug("No challenge pods found", rate_limit_seconds=60)
            return []

        # Use our custom challenge_pods_count method to handle logging appropriately
        log.challenge_pods_count(len(pods.items))
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
                        schema_path = '/'.join(
                            str(part) for part in schema_error.schema_path) if schema_error.schema_path else "unknown"

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


@app.route('/api/redis-health', methods=['GET'])
def redis_health():
    """Check Redis connection health using the enhanced Redis manager."""
    try:
        if 'redis_client' in globals():
            # Get detailed stats from the Redis manager
            if hasattr(redis_client, 'get_stats'):
                redis_stats = redis_client.get_stats()
                health_status = "healthy" if redis_client.is_connected else "degraded"

                # Get queue info too
                queue = get_queue()
                queue_connected = queue.is_connected() if queue else False

                return jsonify({
                    "status": health_status,
                    "connected": redis_client.is_connected,
                    "healthy": redis_client.healthy if hasattr(redis_client, 'healthy') else redis_client.is_connected,
                    "backend": "redis_manager",
                    "circuit_state": redis_stats.get("circuit_state", "unknown"),
                    "connection_failures": redis_stats.get("connection_failures", 0),
                    "last_error": redis_stats.get("last_error", None),
                    "queue_connected": queue_connected,
                    "rate_limiter": "redis" if deployment_limiter.use_redis else "memory"
                }), 200
            else:
                # Fall back to basic check for older Redis client
                try:
                    redis_client.ping()
                    status = "healthy"
                except Exception:
                    status = "degraded"

                return jsonify({
                    "status": status,
                    "backend": "redis",
                    "rate_limiter": "redis" if deployment_limiter.use_redis else "memory"
                }), 200
        else:
            return jsonify({
                "status": "degraded",
                "backend": "memory",
                "message": "Using in-memory rate limiting (Redis connection failed)",
                "rate_limiter": "memory"
            }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "rate_limiter": "memory"
        }), 500


@app.route('/api/redis-config', methods=['GET'])
def redis_config():
    """Display Redis configuration with enhanced details."""
    try:
        # Get Redis configuration from the manager if available
        if 'redis_client' in globals() and hasattr(redis_client, 'get_stats'):
            redis_stats = redis_client.get_stats()

            return jsonify({
                "url_configured": redis_stats.get("redis_url", "redis://[masked]"),
                "max_connections": redis_stats.get("max_connections", 10),
                "circuit_state": redis_stats.get("circuit_state", "unknown"),
                "circuit_failures": redis_stats.get("circuit_failures", 0),
                "has_password": "@" in redis_stats.get("redis_url", ""),
                "redis_enabled": deployment_limiter.use_redis,
                "connected": redis_stats.get("connected", False),
                "healthy": redis_stats.get("healthy", False),
                "connection_failures": redis_stats.get("connection_failures", 0),
                "manager_type": "enhanced_resilient_manager"
            }), 200
        else:
            # Fall back to basic configuration display
            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            redis_url_parts = redis_url.split('@')
            masked_auth = None

            if len(redis_url_parts) > 1:
                # Handle redis://user:pass@host:port/db
                auth_part = redis_url_parts[0]
                auth_parts = auth_part.split(':')

                if len(auth_parts) > 2:
                    # redis://user:pass format - mask the password
                    protocol = auth_parts[0]
                    user = auth_parts[1]

                    if user == '':
                        # No username, just protocol and password (redis://:pass)
                        masked_auth = f"{protocol}::*****"
                    else:
                        # Both username and password
                        masked_auth = f"{protocol}:{user}:*****"

                    masked_url = f"{masked_auth}@{redis_url_parts[1]}"
                else:
                    # Unusual format, just mask the whole auth part
                    masked_url = f"{auth_part.split(':')[0]}:*****@{redis_url_parts[1]}"
            else:
                # No auth part found
                masked_url = redis_url

            connected = False
            try:
                if 'redis_client' in globals():
                    redis_client.ping()
                    connected = True
            except:
                connected = False

            return jsonify({
                "url_configured": masked_url,
                "has_password": ":" in redis_url and "@" in redis_url,
                "redis_enabled": deployment_limiter.use_redis,
                "connected": connected,
                "manager_type": "basic"
            }), 200
    except Exception as e:
        return jsonify({
            "error": f"Error getting Redis configuration: {str(e)}"
        }), 500


@app.route('/api/check-rate-limit/<user_id>', methods=['GET'])
def check_rate_limit(user_id):
    """Check the current rate limit status for a user."""
    try:
        # Add a route to get queue status
        @app.route('/api/queue-status', methods=['GET'])
        def get_queue_status():
            """Get the current status of the challenge deployment queue."""
            queue = get_queue()
            stats = queue.get_queue_stats()

            # Add worker status
            stats['worker_active'] = queue.worker_thread is not None and queue.worker_thread.is_alive()

            return jsonify(stats), 200

        # Add a route to get task status
        @app.route('/api/task-status/<task_id>', methods=['GET'])
        def get_task_status(task_id):
            """Get the status of a specific task."""
            try:
                queue = get_queue()
                status = queue.get_task_status(task_id)
                if status:
                    # Add additional timeout status info if present
                    if status.get('status') == 'failed':
                        result = status.get('result', {})
                        if isinstance(result, dict) and result.get('status') == 'timeout':
                            status['timed_out'] = True
                            status['timeout_error'] = result.get('error', 'Task execution timed out')

                    return jsonify(status), 200
                else:
                    return jsonify({"error": "Task not found"}), 404
            except Exception as e:
                logging.error(f"Error getting task status: {e}")
                return jsonify({"error": str(e)}), 500

        # Initialize the challenge queue worker at application startup
        if __name__ == '__main__':
            logging.info("Initializing challenge queue worker...")
            try:
                queue = get_queue()

                # Recover any stalled tasks first
                recovered = queue.recover_stalled_tasks()
                if recovered > 0:
                    logging.info(f"Recovered {recovered} stalled tasks from previous session")

                # Define the callback function for processing challenge deployments
                def deploy_challenge(task_data):
                    try:
                        user_id = task_data.get('user_id')
                        cdf_data = task_data.get('cdf_content')
                        competition_id = task_data.get('competition_id')
                        deployment_name = task_data.get('deployment_name')
                        challenge_type = task_data.get('challenge_type')
                        task_id = task_data.get('perf_task_id')

                        # Get the performance monitor
                        perf_monitor = None
                        if task_id:
                            try:
                                perf_monitor = get_performance_monitor()
                                # End the queue wait phase and start k8s resources creation phase
                                perf_monitor.end_phase(task_id)
                                perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)
                            except Exception as e:
                                logging.error(f"Error initializing performance monitor: {e}")

                        # Get the handler class
                        HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
                        if not HandlerClass:
                            # Record failure in performance monitor if we have a task_id
                            if task_id and perf_monitor:
                                try:
                                    perf_monitor.add_tag(task_id, "failure_reason",
                                                         f"unsupported_challenge_type: {challenge_type}")
                                    summary = perf_monitor.complete_tracking(task_id, success=False)

                                    # Print performance results for failed deployments
                                    logging.info(f"[PERFORMANCE] Failed deployment of challenge type: {challenge_type}")
                                    logging.info(f"[PERFORMANCE] Reason: Unsupported challenge type")
                                    logging.info(
                                        f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")
                                except Exception as e:
                                    logging.error(f"Error recording performance failure: {e}")

                            logging.error(f"Unsupported challenge type: {challenge_type}")
                            return {
                                "success": False,
                                "error": f"Unsupported challenge type: {challenge_type}"
                            }

                        # Instantiate the handler
                        logging.info(f"Instantiating handler {HandlerClass.__name__} for type {challenge_type}")
                        handler_instance = HandlerClass(user_id, cdf_data, competition_id, deployment_name)

                        # Deploy the challenge
                        logging.info(f"Starting deployment for instance {deployment_name}")

                        # Update performance phase if we have a task_id
                        if task_id and perf_monitor:
                            try:
                                perf_monitor.end_phase(task_id)
                                perf_monitor.start_phase(task_id, perf_monitor.PHASE_WAIT_RUNNING)
                            except Exception as e:
                                logging.error(f"Error updating performance phase: {e}")

                        deployment_info = handler_instance.deploy()

                        log_deployment_name = deployment_info.get('deployment_name', deployment_name)

                        if deployment_info.get("success"):
                            logging.info(f"Deployment successful for instance {log_deployment_name}")

                            # Make sure flags are included in the response
                            if 'flags' not in deployment_info and hasattr(handler_instance, 'flags'):
                                deployment_info['flags'] = handler_instance.flags
                                logging.info(f"Added flags to response: {handler_instance.flags}")

                            # Make sure flag_secret_name is included in the response
                            if 'flag_secret_name' not in deployment_info and hasattr(handler_instance,
                                                                                     'flag_secret_name'):
                                deployment_info['flag_secret_name'] = handler_instance.flag_secret_name
                                logging.info(f"Added flag_secret_name to response: {handler_instance.flag_secret_name}")

                            # Complete performance tracking with success
                            if task_id and perf_monitor:
                                try:
                                    # End the final phase
                                    perf_monitor.end_phase(task_id)

                                    # Add deployment result data
                                    for key, value in deployment_info.items():
                                        # Skip complex objects that might not serialize well
                                        if isinstance(value, (str, int, float, bool)) or value is None:
                                            perf_monitor.add_tag(task_id, f"result_{key}", value)

                                    # Complete tracking
                                    summary = perf_monitor.complete_tracking(task_id, success=True)

                                    # Print performance results to console
                                    logging.info(f"[PERFORMANCE] Deployment of {log_deployment_name} completed")
                                    logging.info(
                                        f"[PERFORMANCE] Total duration: {summary.get('total_duration', 0):.2f} seconds")

                                    # Log each phase duration
                                    for phase_name, phase_data in summary.get('phases', {}).items():
                                        if 'duration' in phase_data:
                                            logging.info(
                                                f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                    # Log any metadata tags that might be useful
                                    for key, value in summary.get('metadata', {}).items():
                                        if key.startswith('result_') or key in ['challenge_type', 'user_id', 'success']:
                                            logging.info(f"[PERFORMANCE] {key}: {value}")
                                except Exception as e:
                                    logging.error(f"Error completing performance tracking: {e}")

                            return deployment_info
                        else:
                            logging.error(
                                f"Deployment failed for {log_deployment_name}: {deployment_info.get('error')}")

                            # Complete performance tracking with failure
                            if task_id and perf_monitor:
                                try:
                                    perf_monitor.add_tag(task_id, "failure_reason",
                                                         f"deployment_failure: {deployment_info.get('error')}")
                                    summary = perf_monitor.complete_tracking(task_id, success=False)

                                    # Print performance results for failed deployments
                                    logging.info(f"[PERFORMANCE] Failed deployment of {log_deployment_name}")
                                    logging.info(
                                        f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                                    # Log each phase duration
                                    for phase_name, phase_data in summary.get('phases', {}).items():
                                        if 'duration' in phase_data:
                                            logging.info(
                                                f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                    logging.info(
                                        f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                                except Exception as e:
                                    logging.error(f"Error recording performance failure: {e}")

                            return {
                                "success": False,
                                "error": deployment_info.get('error', "Deployment failed internally")
                            }
                    except Exception as e:
                        stack_trace = traceback.format_exc()
                        logging.exception(f"Unexpected error during challenge deploy: {e}")
                        logging.error(f"Stack trace: {stack_trace}")

                        # Complete performance tracking with failure
                        if 'task_id' in locals() and task_id and 'perf_monitor' in locals() and perf_monitor:
                            try:
                                perf_monitor.add_tag(task_id, "failure_reason", f"exception: {str(e)}")
                                summary = perf_monitor.complete_tracking(task_id, success=False)

                                # Print performance results for failed deployments
                                logging.info(f"[PERFORMANCE] Failed deployment due to exception")
                                logging.info(
                                    f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                                # Log each phase duration
                                for phase_name, phase_data in summary.get('phases', {}).items():
                                    if 'duration' in phase_data:
                                        logging.info(
                                            f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                logging.info(
                                    f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                            except Exception as perf_e:
                                logging.error(f"Error recording performance failure: {perf_e}")

                            return {
                                "success": False,
                                "error": f"An internal error occurred while deploying the challenge: {str(e)}"
                            }

                # Start the worker
                success = queue.start_worker(deploy_challenge, interval=1)
                if success:
                    logging.info("Queue worker started successfully on application startup")
                else:
                    logging.warning("Failed to start queue worker on application startup")

            except Exception as e:
                logging.error(f"Error starting queue worker on startup: {e}")

        # Function to initialize the queue worker
        def init_queue_worker():
            """Initialize the challenge queue worker."""
            logging.info("Initializing challenge queue worker...")
            try:
                queue = get_queue()

                # Recover any stalled tasks first
                recovered = queue.recover_stalled_tasks()
                if recovered > 0:
                    logging.info(f"Recovered {recovered} stalled tasks from previous session")

                # Define the callback function for processing challenge deployments
                def deploy_challenge(task_data):
                    try:
                        user_id = task_data.get('user_id')
                        cdf_data = task_data.get('cdf_content')
                        competition_id = task_data.get('competition_id')
                        deployment_name = task_data.get('deployment_name')
                        challenge_type = task_data.get('challenge_type')
                        task_id = task_data.get('perf_task_id')

                        # Get the performance monitor
                        perf_monitor = None
                        if task_id:
                            try:
                                perf_monitor = get_performance_monitor()
                                # End the queue wait phase and start k8s resources creation phase
                                perf_monitor.end_phase(task_id)
                                perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)
                            except Exception as e:
                                logging.error(f"Error initializing performance monitor: {e}")

                        # Get the handler class
                        HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
                        if not HandlerClass:
                            # Record failure in performance monitor if we have a task_id
                            if task_id and perf_monitor:
                                try:
                                    perf_monitor.add_tag(task_id, "failure_reason",
                                                         f"unsupported_challenge_type: {challenge_type}")
                                    summary = perf_monitor.complete_tracking(task_id, success=False)

                                    # Print performance results for failed deployments
                                    logging.info(f"[PERFORMANCE] Failed deployment of challenge type: {challenge_type}")
                                    logging.info(f"[PERFORMANCE] Reason: Unsupported challenge type")
                                    logging.info(
                                        f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")
                                except Exception as e:
                                    logging.error(f"Error recording performance failure: {e}")

                                logging.error(f"Unsupported challenge type: {challenge_type}")
                                return {
                                    "success": False,
                                    "error": f"Unsupported challenge type: {challenge_type}"
                                }

                            # Instantiate the handler
                            logging.info(f"Instantiating handler {HandlerClass.__name__} for type {challenge_type}")
                            handler_instance = HandlerClass(user_id, cdf_data, competition_id, deployment_name)

                            # Deploy the challenge
                            logging.info(f"Starting deployment for instance {deployment_name}")

                            # Update performance phase if we have a task_id
                            if task_id and perf_monitor:
                                try:
                                    perf_monitor.end_phase(task_id)
                                    perf_monitor.start_phase(task_id, perf_monitor.PHASE_WAIT_RUNNING)
                                except Exception as e:
                                    logging.error(f"Error updating performance phase: {e}")

                            deployment_info = handler_instance.deploy()

                            log_deployment_name = deployment_info.get('deployment_name', deployment_name)

                            if deployment_info.get("success"):
                                logging.info(f"Deployment successful for instance {log_deployment_name}")

                                # Make sure flags are included in the response
                                if 'flags' not in deployment_info and hasattr(handler_instance, 'flags'):
                                    deployment_info['flags'] = handler_instance.flags
                                    logging.info(f"Added flags to response: {handler_instance.flags}")

                                # Make sure flag_secret_name is included in the response
                                if 'flag_secret_name' not in deployment_info and hasattr(handler_instance,
                                                                                         'flag_secret_name'):
                                    deployment_info['flag_secret_name'] = handler_instance.flag_secret_name
                                    logging.info(
                                        f"Added flag_secret_name to response: {handler_instance.flag_secret_name}")

                                # Complete performance tracking with success
                                if task_id and perf_monitor:
                                    try:
                                        # End the final phase
                                        perf_monitor.end_phase(task_id)

                                        # Add deployment result data
                                        for key, value in deployment_info.items():
                                            # Skip complex objects that might not serialize well
                                            if isinstance(value, (str, int, float, bool)) or value is None:
                                                perf_monitor.add_tag(task_id, f"result_{key}", value)

                                        # Complete tracking
                                        summary = perf_monitor.complete_tracking(task_id, success=True)

                                        # Print performance results to console
                                        logging.info(f"[PERFORMANCE] Deployment of {log_deployment_name} completed")
                                        logging.info(
                                            f"[PERFORMANCE] Total duration: {summary.get('total_duration', 0):.2f} seconds")

                                        # Log each phase duration
                                        for phase_name, phase_data in summary.get('phases', {}).items():
                                            if 'duration' in phase_data:
                                                logging.info(
                                                    f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                        # Log any metadata tags that might be useful
                                        for key, value in summary.get('metadata', {}).items():
                                            if key.startswith('result_') or key in ['challenge_type', 'user_id',
                                                                                    'success']:
                                                logging.info(f"[PERFORMANCE] {key}: {value}")
                                    except Exception as e:
                                        logging.error(f"Error completing performance tracking: {e}")

                                return deployment_info
                            else:
                                logging.error(
                                    f"Deployment failed for {log_deployment_name}: {deployment_info.get('error')}")

                                # Complete performance tracking with failure
                                if task_id and perf_monitor:
                                    try:
                                        perf_monitor.add_tag(task_id, "failure_reason",
                                                             f"deployment_failure: {deployment_info.get('error')}")
                                        summary = perf_monitor.complete_tracking(task_id, success=False)

                                        # Print performance results for failed deployments
                                        logging.info(f"[PERFORMANCE] Failed deployment of {log_deployment_name}")
                                        logging.info(
                                            f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                                        # Log each phase duration
                                        for phase_name, phase_data in summary.get('phases', {}).items():
                                            if 'duration' in phase_data:
                                                logging.info(
                                                    f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                        logging.info(
                                            f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                                    except Exception as e:
                                        logging.error(f"Error recording performance failure: {e}")

                                return {
                                    "success": False,
                                    "error": deployment_info.get('error', "Deployment failed internally")
                                }
                    except Exception as e:
                        stack_trace = traceback.format_exc()
                        logging.exception(f"Unexpected error during challenge deploy: {e}")
                        logging.error(f"Stack trace: {stack_trace}")

                        # Complete performance tracking with failure
                        if 'task_id' in locals() and task_id and 'perf_monitor' in locals() and perf_monitor:
                            try:
                                perf_monitor.add_tag(task_id, "failure_reason", f"exception: {str(e)}")
                                summary = perf_monitor.complete_tracking(task_id, success=False)

                                # Print performance results for failed deployments
                                logging.info(f"[PERFORMANCE] Failed deployment due to exception")
                                logging.info(
                                    f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                                # Log each phase duration
                                for phase_name, phase_data in summary.get('phases', {}).items():
                                    if 'duration' in phase_data:
                                        logging.info(
                                            f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                                logging.info(
                                    f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                            except Exception as perf_e:
                                logging.error(f"Error recording performance failure: {perf_e}")

                            return {
                                "success": False,
                                "error": f"An internal error occurred while deploying the challenge: {str(e)}"
                            }

                # Start the worker
                success = queue.start_worker(deploy_challenge, interval=1)
                if success:
                    logging.info("Queue worker started successfully on application startup")
                else:
                    logging.warning("Failed to start queue worker on application startup")

                return True
            except Exception as e:
                logging.error(f"Error starting queue worker on startup: {e}")
                return False

        # Start the queue worker
        init_queue_worker()

    except Exception as e:
        logging.exception(f"Unexpected error during rate limit check: {e}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@app.route('/api/redis-test-resilience', methods=['GET'])
def test_redis_resilience():
    """Test Redis connection resilience by performing a series of operations."""
    if 'redis_client' not in globals() or not hasattr(redis_client, 'get_stats'):
        return jsonify({
            "status": "error",
            "message": "Enhanced Redis manager not available"
        }), 400

    results = []
    operations_count = int(request.args.get('operations', 5))
    test_key = f"resilience_test_{int(time.time())}"

    for i in range(operations_count):
        start_time = time.time()
        operation_result = {
            "operation": f"operation_{i + 1}",
            "success": False,
            "duration_ms": 0,
            "error": None
        }

        try:
            # Try to set a value
            redis_client.set(f"{test_key}:{i}", f"test_value_{i}")

            # Try to get the value
            value = redis_client.get(f"{test_key}:{i}")
            expected = f"test_value_{i}".encode() if isinstance(value, bytes) else f"test_value_{i}"

            if value == expected:
                operation_result["success"] = True
                operation_result["value"] = str(value)
            else:
                operation_result["error"] = f"Value mismatch: expected '{expected}', got '{value}'"

        except Exception as e:
            operation_result["error"] = str(e)

        end_time = time.time()
        operation_result["duration_ms"] = int((end_time - start_time) * 1000)
        results.append(operation_result)

        # Short delay between operations
        time.sleep(0.1)

    # Clean up test keys
    try:
        for i in range(operations_count):
            redis_client.delete(f"{test_key}:{i}")
    except Exception as e:
        logging.warning(f"Error cleaning up test keys: {e}")

    # Get Redis stats after operations
    redis_stats = redis_client.get_stats()

    # Calculate success rate
    success_count = sum(1 for r in results if r["success"])
    success_rate = (success_count / operations_count) * 100 if operations_count > 0 else 0

    return jsonify({
        "test_id": test_key,
        "operations_requested": operations_count,
        "operations_completed": len(results),
        "success_count": success_count,
        "success_rate": success_rate,
        "average_duration_ms": sum(r["duration_ms"] for r in results) / len(results) if results else 0,
        "operations": results,
        "redis_status": {
            "connected": redis_stats.get("connected", False),
            "healthy": redis_stats.get("healthy", False),
            "circuit_state": redis_stats.get("circuit_state", "unknown"),
            "connection_failures": redis_stats.get("connection_failures", 0)
        }
    })


@app.route('/api/performance-metrics', methods=['GET'])
def get_performance_metrics():
    """Get performance metrics for challenge deployments."""
    try:
        perf_monitor = get_performance_monitor()
        metrics = perf_monitor.get_metrics()
        return jsonify(metrics), 200
    except Exception as e:
        logging.error(f"Error getting performance metrics: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/recent-deployments', methods=['GET'])
def get_recent_deployments():
    """Get recent challenge deployments and their performance."""
    try:
        limit = request.args.get('limit', default=20, type=int)
        perf_monitor = get_performance_monitor()
        deployments = perf_monitor.get_recent_deployments(limit=limit)
        return jsonify(deployments), 200
    except Exception as e:
        logging.error(f"Error getting recent deployments: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/performance-cleanup', methods=['POST'])
def cleanup_performance_data():
    """
    Clean up old performance monitoring data.
    """
    try:
        data = request.get_json()
        days = data.get('days', 30)

        perf_monitor = get_performance_monitor()
        cleared_count = perf_monitor.clear_old_data(days=days)

        return jsonify({
            "status": "success",
            "message": f"Cleared {cleared_count} old performance records",
            "days_retained": days
        }), 200

    except Exception as e:
        logging.error(f"Error cleaning up performance data: {e}")
        return jsonify({"error": str(e)}), 500


# Check if parallel workers are enabled via environment variable
enable_parallel = os.getenv("ENABLE_PARALLEL_WORKERS", "false").lower() == "true"

# Initialize both queue workers at application startup
if __name__ == '__main__':
    if enable_parallel:
        logging.info("Initializing queue workers with parallel processing enabled")
        # When enabled, each worker operates independently with distributed locking
    else:
        logging.info("Initializing queue workers with parallel processing disabled")
        # When disabled, only the first worker that acquires the lock will process tasks
    
    # Initialize all workers (deployment and termination)
    init_all_workers()
else:
    # For WSGI applications, initialize both workers
    if enable_parallel:
        logging.info("Initializing queue workers with parallel processing enabled (WSGI)")
    else:
        logging.info("Initializing queue workers with parallel processing disabled (WSGI)")
    
    init_all_workers()


@app.route('/api/workers', methods=['GET'])
def list_workers():
    """Get information about all registered workers."""
    try:
        from challenge_utils.worker_registry import get_worker_registry, WorkerStatus
        from challenge_utils.heartbeat_manager import get_heartbeat_manager
        
        worker_registry = get_worker_registry()
        heartbeat_manager = get_heartbeat_manager()
        
        # Get all workers
        workers = worker_registry.list_workers()
        
        # Transform worker objects into dictionary format
        worker_info = []
        for worker in workers:
            # Get health information
            health = heartbeat_manager.get_worker_health(worker.worker_id)
            
            # Create worker info entry
            info = {
                "worker_id": worker.worker_id,
                "queue_type": worker.queue_type,
                "hostname": worker.hostname,
                "pid": worker.pid,
                "status": worker.status.value,
                "start_time": worker.start_time,
                "last_heartbeat": worker.last_heartbeat,
                "tasks_processed": worker.tasks_processed,
                "tasks_failed": worker.tasks_failed,
                "current_task_id": worker.current_task_id,
                "health": health
            }
            worker_info.append(info)
        
        # Get counts
        active_count = sum(1 for w in workers if w.status == WorkerStatus.ACTIVE)
        idle_count = sum(1 for w in workers if w.status == WorkerStatus.IDLE)
        paused_count = sum(1 for w in workers if w.status == WorkerStatus.PAUSED)
        failed_count = sum(1 for w in workers if w.status == WorkerStatus.FAILED)
        deployment_count = sum(1 for w in workers if w.queue_type == ChallengeQueue.QUEUE_DEPLOYMENT)
        termination_count = sum(1 for w in workers if w.queue_type == ChallengeQueue.QUEUE_TERMINATION)
        
        return jsonify({
            "workers": worker_info,
            "counts": {
                "total": len(workers),
                "active": active_count,
                "idle": idle_count,
                "paused": paused_count,
                "failed": failed_count,
                "deployment": deployment_count,
                "termination": termination_count
            }
        }), 200
    except Exception as e:
        logging.error(f"Error listing workers: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/<worker_id>', methods=['GET'])
def get_worker_info(worker_id):
    """Get detailed information about a specific worker."""
    try:
        from challenge_utils.worker_registry import get_worker_registry
        from challenge_utils.heartbeat_manager import get_heartbeat_manager
        from challenge_utils.worker_state import get_worker_state_manager
        
        # Get the worker
        worker_registry = get_worker_registry()
        worker = worker_registry.get_worker(worker_id)
        
        if not worker:
            return jsonify({"error": f"Worker {worker_id} not found"}), 404
        
        # Get health information
        heartbeat_manager = get_heartbeat_manager()
        health = heartbeat_manager.get_worker_health(worker_id)
        
        # Get state history
        state_manager = get_worker_state_manager()
        state_history = state_manager.get_state_history(worker_id)
        
        # Create response
        response = {
            "worker_id": worker.worker_id,
            "queue_type": worker.queue_type,
            "hostname": worker.hostname,
            "pid": worker.pid,
            "status": worker.status.value,
            "start_time": worker.start_time,
            "last_heartbeat": worker.last_heartbeat,
            "tasks_processed": worker.tasks_processed,
            "tasks_failed": worker.tasks_failed,
            "current_task_id": worker.current_task_id,
            "health": health,
            "state_history": state_history,
            "metadata": worker.metadata
        }
        
        return jsonify(response), 200
    except Exception as e:
        logging.error(f"Error getting worker info: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/<worker_id>/pause', methods=['POST'])
def pause_worker(worker_id):
    """Pause a worker."""
    try:
        from challenge_utils.worker_registry import get_worker_registry
        from challenge_utils.worker_state import get_worker_state_manager
        
        # Get the worker
        worker_registry = get_worker_registry()
        worker = worker_registry.get_worker(worker_id)
        
        if not worker:
            return jsonify({"error": f"Worker {worker_id} not found"}), 404
        
        # Get reason from request body
        data = request.json or {}
        reason = data.get('reason', 'Paused by API request')
        
        # Update worker state to trigger pause
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(worker_id, {
            'command': 'pause',
            'reason': reason
        })
        
        return jsonify({
            "success": True, 
            "message": f"Worker {worker_id} pause request sent",
            "reason": reason
        }), 200
    except Exception as e:
        logging.error(f"Error pausing worker: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/<worker_id>/resume', methods=['POST'])
def resume_worker(worker_id):
    """Resume a paused worker."""
    try:
        from challenge_utils.worker_registry import get_worker_registry
        from challenge_utils.worker_state import get_worker_state_manager
        
        # Get the worker
        worker_registry = get_worker_registry()
        worker = worker_registry.get_worker(worker_id)
        
        if not worker:
            return jsonify({"error": f"Worker {worker_id} not found"}), 404
        
        # Update worker state to trigger resume
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(worker_id, {
            'command': 'resume'
        })
        
        return jsonify({
            "success": True, 
            "message": f"Worker {worker_id} resume request sent"
        }), 200
    except Exception as e:
        logging.error(f"Error resuming worker: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/<worker_id>/stop', methods=['POST'])
def stop_worker(worker_id):
    """Stop a worker."""
    try:
        from challenge_utils.worker_registry import get_worker_registry
        from challenge_utils.worker_state import get_worker_state_manager
        
        # Get the worker
        worker_registry = get_worker_registry()
        worker = worker_registry.get_worker(worker_id)
        
        if not worker:
            return jsonify({"error": f"Worker {worker_id} not found"}), 404
        
        # Get reason from request body
        data = request.json or {}
        reason = data.get('reason', 'Stopped by API request')
        
        # Update worker state to trigger stop
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(worker_id, {
            'command': 'stop',
            'reason': reason
        })
        
        return jsonify({
            "success": True, 
            "message": f"Worker {worker_id} stop request sent",
            "reason": reason
        }), 200
    except Exception as e:
        logging.error(f"Error stopping worker: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/cleanup', methods=['POST'])
def cleanup_stale_workers():
    """Clean up stale workers."""
    try:
        from challenge_utils.worker_registry import get_worker_registry
        
        worker_registry = get_worker_registry()
        cleaned = worker_registry.cleanup_stale_workers()
        
        return jsonify({
            "success": True,
            "cleaned_workers": cleaned,
            "message": f"Cleaned up {cleaned} stale workers"
        }), 200
    except Exception as e:
        logging.error(f"Error cleaning up stale workers: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/workers/initialize', methods=['POST'])
def api_init_workers():
    """Initialize or reinitialize workers."""
    try:
        # Check if there are any active workers
        from challenge_utils.worker_registry import get_worker_registry, WorkerStatus
        
        worker_registry = get_worker_registry()
        workers = worker_registry.list_workers()
        
        active_workers = [w for w in workers if w.status in (WorkerStatus.ACTIVE, WorkerStatus.IDLE)]
        
        # If we have active workers, return error unless force=true
        data = request.json or {}
        force = data.get('force', False)
        
        if active_workers and not force:
            return jsonify({
                "success": False,
                "message": "Active workers detected. Use force=true to reinitialize anyway.",
                "active_workers": len(active_workers)
            }), 400
        
        # Clean up existing workers if forced
        if force and active_workers:
            # Stop each worker
            for worker in active_workers:
                try:
                    from challenge_utils.worker_state import get_worker_state_manager
                    state_manager = get_worker_state_manager()
                    state_manager.update_worker_state(worker.worker_id, {
                        'command': 'stop',
                        'reason': 'Forced stop during reinitialization'
                    })
                except Exception as e:
                    logging.error(f"Error stopping worker {worker.worker_id}: {e}")
            
            # Wait a bit for workers to stop
            import time
            time.sleep(5)
            
            # Clean up any remaining workers
            worker_registry.cleanup_stale_workers()
        
        # Initialize workers
        from challenge_utils.queue_workers import init_all_workers
        success = init_all_workers()
        
        return jsonify({
            "success": success,
            "message": "Workers initialized successfully" if success else "Failed to initialize workers",
            "force_applied": force
        }), 200 if success else 500
    except Exception as e:
        logging.error(f"Error initializing workers: {e}")
        return jsonify({"error": str(e)}), 500


# --- Test Endpoints --- #

@app.route('/api/test/redblue', methods=['POST'])
def test_redblue_challenge():
    """Endpoint specifically for testing the Red-Blue challenge deployment."""
    try:
        # Get user_id and competition_id from request
        json_data = request.json
        validation_result, error_message = validate_request_json(json_data, ['user_id', 'competition_id'])
        if not validation_result:
            logging.error(f"Red-Blue test request validation failed: {error_message}")
            return jsonify({"error": error_message}), 400

        user_id = json_data['user_id']
        competition_id = json_data['competition_id']

        # Load the specific CDF for the test
        cdf_path = os.path.join(os.path.dirname(__file__), '..', 'corporate-network-breach.cdf.json') # Assuming it's one level up
        if not os.path.exists(cdf_path):
            logging.error(f"Test CDF file not found: {cdf_path}")
            return jsonify({"error": "Corporate Network Breach CDF file not found."}), 500
        
        with open(cdf_path, 'r') as f:
            cdf_data = json.load(f)
        
        # Generate a unique deployment name for the test
        deployment_name = f"redblue-test-{user_id[:8]}-{uuid.uuid4().hex[:8]}"
        challenge_type = "redblue" # Hardcode the type for this test endpoint
        
        logging.info(f"Starting Red-Blue test deployment: user_id={user_id}, competition_id={competition_id}, name={deployment_name}")
        
        # Get the handler class
        HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
        if not HandlerClass:
            logging.error(f"Handler not found for challenge type: {challenge_type}")
            return jsonify({"error": f"Handler not found for {challenge_type}"}), 500
            
        # Instantiate the handler
        logging.info(f"Instantiating handler {HandlerClass.__name__} for type {challenge_type}")
        handler_instance = HandlerClass(user_id, cdf_data, competition_id, deployment_name)
        
        # Deploy the challenge directly (bypassing queue for immediate testing)
        logging.info(f"Deploying Red-Blue test instance {deployment_name}")
        deployment_info = handler_instance.deploy()
        
        log_deployment_name = deployment_info.get('deployment_name', deployment_name)
        
        if deployment_info.get("success"):
            logging.info(f"Red-Blue test deployment successful for instance {log_deployment_name}")
            return jsonify(deployment_info), 200
        else:
            logging.error(f"Red-Blue test deployment failed for {log_deployment_name}: {deployment_info.get('error')}")
            # Attempt cleanup on failure
            try:
                handler_instance.cleanup()
            except Exception as cleanup_e:
                logging.error(f"Error during cleanup after failed test deployment: {cleanup_e}")
            return jsonify(deployment_info), 500

    except Exception as e:
        stack_trace = traceback.format_exc()
        logging.exception(f"Unexpected error during Red-Blue test deployment: {e}")
        logging.error(f"Stack trace: {stack_trace}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500
