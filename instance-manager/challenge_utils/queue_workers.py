import logging
import traceback
from datetime import datetime
from challenge_utils.performance_monitor import get_performance_monitor
from challenge_utils.queue_manager import get_queue, ChallengeQueue
from challenge_utils.pod_management import delete_challenge_pod
from challenges import CHALLENGE_HANDLERS, BaseChallengeHandler

def create_deploy_challenge_callback():
    """Create and return a callback function for processing challenge deployments."""
    
    def deploy_challenge(task_data):
        """Callback for processing challenge deployments from the queue."""
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
                        logging.info(f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")
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
                        logging.info(f"[PERFORMANCE] Total duration: {summary.get('total_duration', 0):.2f} seconds")

                        # Log each phase duration
                        for phase_name, phase_data in summary.get('phases', {}).items():
                            if 'duration' in phase_data:
                                logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

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
                        perf_monitor.add_tag(task_id, "failure_reason", f"deployment_failure: {deployment_info.get('error')}")
                        summary = perf_monitor.complete_tracking(task_id, success=False)

                        # Print performance results for failed deployments
                        logging.info(f"[PERFORMANCE] Failed deployment of {log_deployment_name}")
                        logging.info(f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                        # Log each phase duration
                        for phase_name, phase_data in summary.get('phases', {}).items():
                            if 'duration' in phase_data:
                                logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                        logging.info(f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
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
                    logging.info(f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                    # Log each phase duration
                    for phase_name, phase_data in summary.get('phases', {}).items():
                        if 'duration' in phase_data:
                            logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                    logging.info(f"[PERFORMANCE] Failure reason: {summary.get('metadata', {}).get('failure_reason', 'unknown')}")
                except Exception as perf_e:
                    logging.error(f"Error recording performance failure: {perf_e}")

            if 'handler_instance' in locals() and isinstance(handler_instance, BaseChallengeHandler):
                try:
                    handler_instance.cleanup()
                except Exception as cleanup_e:
                    logging.error(f"Failed during cleanup after error: {cleanup_e}")
                return {
                    "success": False,
                    "error": f"An internal error occurred while deploying the challenge: {str(e)}"
                }
    
    return deploy_challenge

def create_terminate_challenge_callback():
    """Create and return a callback function for processing challenge terminations."""
    
    def terminate_challenge(task_data):
        """Callback for processing challenge terminations from the queue."""
        try:
            pod_name = task_data.get('deployment_name')
            namespace = task_data.get('namespace', 'default')
            user_id = task_data.get('user_id', 'system')
            task_id = task_data.get('perf_task_id')

            # Get the performance monitor
            perf_monitor = get_performance_monitor()

            # End the queue wait phase and start resource cleanup phase
            if task_id:
                perf_monitor.end_phase(task_id)
                perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)

            logging.info(f"[QUEUE] Processing termination for {pod_name} in namespace {namespace}")

            try:
                # Perform the actual pod deletion
                delete_challenge_pod(pod_name, namespace)

                # End resource cleanup phase
                if task_id:
                    perf_monitor.end_phase(task_id)

                # Complete performance tracking with success
                if task_id:
                    # Add termination result data
                    perf_monitor.add_tag(task_id, "result_status", "terminated")
                    perf_monitor.add_tag(task_id, "result_pod_name", pod_name)

                    # Print performance results
                    summary = perf_monitor.complete_tracking(task_id, success=True)

                    # Print performance results to console
                    logging.info(f"[PERFORMANCE] Termination of {pod_name} completed")
                    logging.info(f"[PERFORMANCE] Total duration: {summary.get('total_duration', 0):.2f} seconds")

                    # Log each phase duration
                    for phase_name, phase_data in summary.get('phases', {}).items():
                        if 'duration' in phase_data:
                            logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                return {
                    "success": True,
                    "message": f"Termination of {pod_name} completed",
                    "status": "terminated",
                    "deleted_resources": ["Pod", "Service", "Ingress", "Secret", "ConfigMaps", "PVCs"]
                }
            except Exception as e:
                logging.error(f"[QUEUE] Error terminating pod {pod_name}: {e}")

                # Complete performance tracking with failure
                if task_id:
                    perf_monitor.add_tag(task_id, "failure_reason", f"termination_error: {str(e)}")
                    summary = perf_monitor.complete_tracking(task_id, success=False)

                    # Print performance results for failed terminations
                    logging.info(f"[PERFORMANCE] Failed termination of {pod_name}")
                    logging.info(f"[PERFORMANCE] Total duration until failure: {summary.get('total_duration', 0):.2f} seconds")

                    # Log each phase duration
                    for phase_name, phase_data in summary.get('phases', {}).items():
                        if 'duration' in phase_data:
                            logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                return {
                    "success": False,
                    "error": str(e),
                    "message": f"Failed to terminate {pod_name}"
                }

        except Exception as e:
            logging.exception(f"Error in terminate_challenge task: {e}")

            # Complete the performance tracking with failure
            if task_id:
                perf_monitor.add_tag(task_id, "failure_reason", f"termination_error: {str(e)}")
                summary = perf_monitor.complete_tracking(task_id, success=False)

            return {
                "success": False,
                "error": str(e)
            }
    
    return terminate_challenge

def init_worker(queue_type=ChallengeQueue.QUEUE_DEPLOYMENT):
    """
    Initialize a queue worker for the specified queue type.
    
    Args:
        queue_type: The queue type to initialize (deployment or termination)
        
    Returns:
        bool: True if worker was started successfully, False otherwise
    """
    queue_name = "challenge deployment" if queue_type == ChallengeQueue.QUEUE_DEPLOYMENT else "challenge termination"
    logging.info(f"Initializing {queue_name} queue worker...")
    
    try:
        queue = get_queue(queue_type)
        
        # Recover any stalled tasks
        recovered = queue.recover_stalled_tasks()
        if recovered > 0:
            logging.info(f"Recovered {recovered} stalled tasks from previous session for {queue_name} queue")
        
        # Get the appropriate callback based on queue type
        if queue_type == ChallengeQueue.QUEUE_DEPLOYMENT:
            callback = create_deploy_challenge_callback()
        else:
            callback = create_terminate_challenge_callback()
        
        # Start the worker
        success = queue.start_worker(callback, interval=0.2)
        if success:
            logging.info(f"{queue_name.capitalize()} queue worker started successfully")
        else:
            logging.warning(f"Failed to start {queue_name} queue worker")
        
        return success
    except Exception as e:
        logging.error(f"Error starting {queue_name} queue worker: {e}")
        return False

def init_all_workers():
    """Initialize all queue workers (deployment and termination)."""
    deployment_success = init_worker(ChallengeQueue.QUEUE_DEPLOYMENT)
    termination_success = init_worker(ChallengeQueue.QUEUE_TERMINATION)
    return deployment_success and termination_success 