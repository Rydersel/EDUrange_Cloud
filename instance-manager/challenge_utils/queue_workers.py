import logging
import traceback
import uuid
from datetime import datetime
from challenge_utils.performance_monitor import get_performance_monitor
from challenge_utils.queue_manager import get_queue, ChallengeQueue
from challenge_utils.pod_management import delete_challenge_pod
# Import the critical section locking utilities
from challenge_utils.critical_sections import with_challenge_lock, with_queue_lock, CriticalSectionManager
# Import worker coordination components
from challenge_utils.worker_registry import get_worker_registry, WorkerStatus
from challenge_utils.heartbeat_manager import get_heartbeat_manager
from challenge_utils.worker_state import get_worker_state_manager
from challenge_utils.worker import QueueWorker

def create_deploy_challenge_callback():
    """Create and return a callback function for processing challenge deployments."""
    
    @with_challenge_lock
    def deploy_challenge(task_data):
        """Callback for processing challenge deployments from the queue."""
        try:
            user_id = task_data.get('user_id')
            cdf_data = task_data.get('cdf_content')
            competition_id = task_data.get('competition_id')
            deployment_name = task_data.get('deployment_name')
            challenge_type = task_data.get('challenge_type')
            task_id = task_data.get('perf_task_id')

            # Extract challenge_id and add it to task_data if it doesn't exist
            if not task_data.get("challenge_id"):
                # Try to extract from cdf_data
                if isinstance(cdf_data, dict):
                    challenge_id = cdf_data.get("id")
                    if challenge_id:
                        task_data["challenge_id"] = challenge_id
                        logging.info(f"Added challenge_id {challenge_id} from cdf_data")
                    
                # If still no challenge_id, use deployment_name as a fallback
                if not task_data.get("challenge_id") and deployment_name:
                    task_data["challenge_id"] = deployment_name
                    logging.info(f"Using deployment_name {deployment_name} as challenge_id")
                
                # If still no challenge_id, check if it's in metadata
                if not task_data.get("challenge_id") and task_data.get("metadata") and task_data["metadata"].get("challenge_id"):
                    task_data["challenge_id"] = task_data["metadata"]["challenge_id"]
                    logging.info(f"Added challenge_id from metadata: {task_data['challenge_id']}")
            
            # At this point, task_data should have a challenge_id, or the with_challenge_lock decorator 
            # will handle the error appropriately
            
            # Get current worker ID
            worker_registry = get_worker_registry()
            worker = None
            for w in worker_registry.list_workers(ChallengeQueue.QUEUE_DEPLOYMENT):
                if w.status == WorkerStatus.ACTIVE:
                    worker = w
                    break
            
            if worker:
                # Update worker with current task
                worker.current_task_id = task_id
                worker_registry.update_worker(worker)
                logging.info(f"Worker {worker.worker_id} processing task {task_id}")

            # Log that we have acquired a lock for this challenge
            challenge_id = task_data.get("challenge_id")
            logging.info(f"Processing deployment with lock for challenge ID: {challenge_id}")

            # Get the performance monitor - handle potential failures gracefully
            perf_monitor = None
            try:
                perf_monitor = get_performance_monitor()
                # End the queue wait phase and start k8s resources creation phase
                if task_id:
                    try:
                        perf_monitor.end_phase(task_id)
                        perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)
                    except Exception as pm_e:
                        logging.warning(f"Performance monitoring phase update failed: {pm_e}")
            except Exception as e:
                logging.warning(f"Failed to initialize performance monitor: {e}")
                perf_monitor = None

            # Get the handler class
            from challenges import CHALLENGE_HANDLERS, BaseChallengeHandler
            HandlerClass = CHALLENGE_HANDLERS.get(challenge_type)
            if not HandlerClass:
                # Record failure in performance monitor if we have a task_id
                if task_id and perf_monitor:
                    try:
                        perf_monitor.add_tag(task_id, "failure_reason", f"unsupported_challenge_type: {challenge_type}")
                        summary = perf_monitor.complete_tracking(task_id, success=False)

                        # Print performance results for failed deployments (with defensive checks)
                        logging.info(f"[PERFORMANCE] Failed deployment of challenge type: {challenge_type}")
                        logging.info(f"[PERFORMANCE] Reason: Unsupported challenge type")
                        if summary and isinstance(summary, dict):
                            total_duration = summary.get('total_duration', 0)
                            logging.info(f"[PERFORMANCE] Total duration until failure: {total_duration:.2f} seconds")
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
                    logging.warning(f"Failed to update performance phase: {e}")

            deployment_info = handler_instance.deploy()

            log_deployment_name = deployment_info.get('deployment_name', deployment_name)

            if deployment_info.get("success"):
                logging.info(f"Deployment successful for instance {log_deployment_name}")
                
                # If worker exists, increment tasks processed count
                if worker:
                    worker.tasks_processed += 1
                    worker_registry.update_worker(worker)

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

                        # Print performance results to console (with defensive checks)
                        logging.info(f"[PERFORMANCE] Deployment of {log_deployment_name} completed")
                        if summary and isinstance(summary, dict):
                            total_duration = summary.get('total_duration', 0)
                            logging.info(f"[PERFORMANCE] Total duration: {total_duration:.2f} seconds")

                            # Log each phase duration
                            phases = summary.get('phases', {})
                            if phases and isinstance(phases, dict):
                                for phase_name, phase_data in phases.items():
                                    if isinstance(phase_data, dict) and 'duration' in phase_data:
                                        logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                            # Log any metadata tags that might be useful
                            metadata = summary.get('metadata', {})
                            if metadata and isinstance(metadata, dict):
                                for key, value in metadata.items():
                                    if key.startswith('result_') or key in ['challenge_type', 'user_id', 'success']:
                                        logging.info(f"[PERFORMANCE] {key}: {value}")
                    except Exception as e:
                        logging.error(f"Error completing performance tracking: {e}")

                return deployment_info
            else:
                logging.error(f"Deployment failed for {log_deployment_name}: {deployment_info.get('error')}")
                
                # If worker exists, increment tasks failed count
                if worker:
                    worker.tasks_failed += 1
                    worker_registry.update_worker(worker)

                # Complete performance tracking with failure
                if task_id and perf_monitor:
                    try:
                        perf_monitor.add_tag(task_id, "failure_reason", f"deployment_failure: {deployment_info.get('error')}")
                        summary = perf_monitor.complete_tracking(task_id, success=False)

                        # Print performance results for failed deployments (with defensive checks)
                        logging.info(f"[PERFORMANCE] Failed deployment of {log_deployment_name}")
                        if summary and isinstance(summary, dict):
                            total_duration = summary.get('total_duration', 0)
                            logging.info(f"[PERFORMANCE] Total duration until failure: {total_duration:.2f} seconds")

                            # Log each phase duration
                            phases = summary.get('phases', {})
                            if phases and isinstance(phases, dict):
                                for phase_name, phase_data in phases.items():
                                    if isinstance(phase_data, dict) and 'duration' in phase_data:
                                        logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                            # Log failure reason
                            metadata = summary.get('metadata', {})
                            if metadata and isinstance(metadata, dict):
                                failure_reason = metadata.get('failure_reason', 'unknown')
                                logging.info(f"[PERFORMANCE] Failure reason: {failure_reason}")
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
            
            # Update worker's failed task count if available
            try:
                worker_registry = get_worker_registry()
                for w in worker_registry.list_workers(ChallengeQueue.QUEUE_DEPLOYMENT):
                    if w.status == WorkerStatus.ACTIVE:
                        w.tasks_failed += 1
                        worker_registry.update_worker(w)
                        break
            except Exception as we:
                logging.error(f"Error updating worker stats: {we}")

            # Complete performance tracking with failure
            if 'task_id' in locals() and task_id and 'perf_monitor' in locals() and perf_monitor:
                try:
                    perf_monitor.add_tag(task_id, "failure_reason", f"exception: {str(e)}")
                    summary = perf_monitor.complete_tracking(task_id, success=False)

                    # Print performance results for failed deployments (with defensive checks)
                    logging.info(f"[PERFORMANCE] Failed deployment due to exception")
                    if summary and isinstance(summary, dict):
                        total_duration = summary.get('total_duration', 0)
                        logging.info(f"[PERFORMANCE] Total duration until failure: {total_duration:.2f} seconds")

                        # Log each phase duration
                        phases = summary.get('phases', {})
                        if phases and isinstance(phases, dict):
                            for phase_name, phase_data in phases.items():
                                if isinstance(phase_data, dict) and 'duration' in phase_data:
                                    logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")

                        # Log failure reason
                        metadata = summary.get('metadata', {})
                        if metadata and isinstance(metadata, dict):
                            failure_reason = metadata.get('failure_reason', 'unknown')
                            logging.info(f"[PERFORMANCE] Failure reason: {failure_reason}")
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
    
    @with_challenge_lock
    def terminate_challenge(task_data):
        """Callback for processing challenge terminations from the queue."""
        try:
            pod_name = task_data.get('deployment_name')
            namespace = task_data.get('namespace', 'default')
            user_id = task_data.get('user_id', 'system')
            task_id = task_data.get('perf_task_id')
            
            # Extract challenge_id and add it to task_data if it doesn't exist
            if not task_data.get("challenge_id"):
                if pod_name:
                    # Use deployment_name/pod_name as a challenge_id if not provided
                    task_data["challenge_id"] = pod_name
                    logging.info(f"Using pod_name {pod_name} as challenge_id")
                
                # If still no challenge_id, check if it's in metadata
                if not task_data.get("challenge_id") and task_data.get("metadata") and task_data["metadata"].get("challenge_id"):
                    task_data["challenge_id"] = task_data["metadata"]["challenge_id"]
                    logging.info(f"Added challenge_id from metadata: {task_data['challenge_id']}")
            
            challenge_id = task_data.get('challenge_id')
                        
            # Get current worker ID
            worker_registry = get_worker_registry()
            worker = None
            for w in worker_registry.list_workers(ChallengeQueue.QUEUE_TERMINATION):
                if w.status == WorkerStatus.ACTIVE:
                    worker = w
                    break
            
            if worker:
                # Update worker with current task
                worker.current_task_id = task_id
                worker_registry.update_worker(worker)
                logging.info(f"Worker {worker.worker_id} processing termination task {task_id}")

            # Log that we have acquired a lock for this challenge
            logging.info(f"Processing termination with lock for challenge ID: {challenge_id}")

            # Get the performance monitor - handle potential failures gracefully
            perf_monitor = None
            try:
                perf_monitor = get_performance_monitor()
                # End the queue wait phase and start resource cleanup phase
                if task_id:
                    try:
                        perf_monitor.end_phase(task_id)
                        perf_monitor.start_phase(task_id, perf_monitor.PHASE_K8S_RESOURCES)
                    except Exception as pm_e:
                        logging.warning(f"Performance monitoring phase update failed: {pm_e}")
            except Exception as e:
                logging.warning(f"Failed to initialize performance monitor: {e}")
                perf_monitor = None

            logging.info(f"[QUEUE] Processing termination for {pod_name} in namespace {namespace}")

            try:
                # Perform the actual pod deletion
                delete_challenge_pod(pod_name, namespace)

                # End resource cleanup phase if performance monitoring is active
                if task_id and perf_monitor:
                    try:
                        perf_monitor.end_phase(task_id)
                    except Exception as e:
                        logging.warning(f"Failed to end performance phase: {e}")

                # Complete performance tracking with success
                summary = None
                if task_id and perf_monitor:
                    try:
                        # Add termination result data
                        perf_monitor.add_tag(task_id, "result_status", "terminated")
                        perf_monitor.add_tag(task_id, "result_pod_name", pod_name)

                        # Complete tracking and get summary
                        summary = perf_monitor.complete_tracking(task_id, success=True)

                        # Print performance results to console (with defensive checks)
                        logging.info(f"[PERFORMANCE] Termination of {pod_name} completed")
                        if summary and isinstance(summary, dict):
                            total_duration = summary.get('total_duration', 0)
                            logging.info(f"[PERFORMANCE] Total duration: {total_duration:.2f} seconds")

                            # Log each phase duration with defensive checks
                            phases = summary.get('phases', {})
                            if phases and isinstance(phases, dict):
                                for phase_name, phase_data in phases.items():
                                    if isinstance(phase_data, dict) and 'duration' in phase_data:
                                        logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")
                    except Exception as e:
                        logging.error(f"Error completing performance tracking: {e}")
                
                # Update worker tasks processed if available
                if worker:
                    worker.tasks_processed += 1
                    worker_registry.update_worker(worker)

                return {
                    "success": True,
                    "message": f"Termination of {pod_name} completed",
                    "status": "terminated",
                    "deleted_resources": ["Pod", "Service", "Ingress", "Secret", "ConfigMaps", "PVCs"]
                }
            except Exception as e:
                logging.error(f"[QUEUE] Error terminating pod {pod_name}: {e}")
                
                # Update worker tasks failed if available
                if worker:
                    worker.tasks_failed += 1
                    worker_registry.update_worker(worker)

                # Complete performance tracking with failure
                if task_id and perf_monitor:
                    try:
                        perf_monitor.add_tag(task_id, "failure_reason", f"termination_error: {str(e)}")
                        summary = perf_monitor.complete_tracking(task_id, success=False)

                        # Print performance results for failed terminations (with defensive checks)
                        logging.info(f"[PERFORMANCE] Failed termination of {pod_name}")
                        if summary and isinstance(summary, dict):
                            total_duration = summary.get('total_duration', 0)
                            logging.info(f"[PERFORMANCE] Total duration until failure: {total_duration:.2f} seconds")

                            # Log each phase duration with defensive checks
                            phases = summary.get('phases', {})
                            if phases and isinstance(phases, dict):
                                for phase_name, phase_data in phases.items():
                                    if isinstance(phase_data, dict) and 'duration' in phase_data:
                                        logging.info(f"[PERFORMANCE] Phase {phase_name}: {phase_data['duration']:.2f} seconds")
                                        
                            # Log failure reason with defensive checks
                            metadata = summary.get('metadata', {})
                            if metadata and isinstance(metadata, dict):
                                failure_reason = metadata.get('failure_reason', 'unknown')
                                logging.info(f"[PERFORMANCE] Failure reason: {failure_reason}")
                    except Exception as perf_e:
                        logging.error(f"Error recording performance failure: {perf_e}")

                return {
                    "success": False,
                    "error": str(e),
                    "message": f"Failed to terminate {pod_name}"
                }

        except Exception as e:
            logging.exception(f"Error in terminate_challenge task: {e}")
            
            # Update worker's failed task count if available
            try:
                worker_registry = get_worker_registry()
                for w in worker_registry.list_workers(ChallengeQueue.QUEUE_TERMINATION):
                    if w.status == WorkerStatus.ACTIVE:
                        w.tasks_failed += 1
                        worker_registry.update_worker(w)
                        break
            except Exception as we:
                logging.error(f"Error updating worker stats: {we}")

            # Complete the performance tracking with failure (with defensive handling)
            if 'task_id' in locals() and task_id:
                try:
                    # Get performance monitor (it may not have been initialized in the outer scope)
                    perf_monitor = get_performance_monitor()
                    if perf_monitor:
                        perf_monitor.add_tag(task_id, "failure_reason", f"termination_error: {str(e)}")
                        perf_monitor.complete_tracking(task_id, success=False)
                except Exception as perf_e:
                    logging.error(f"Error recording final performance failure: {perf_e}")

            return {
                "success": False,
                "error": str(e)
            }
    
    return terminate_challenge

@with_queue_lock("worker_initialization")
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
        # Create a new QueueWorker instance for this queue type
        worker = QueueWorker(queue_type)
        
        # Get the appropriate callback based on queue type
        if queue_type == ChallengeQueue.QUEUE_DEPLOYMENT:
            callback = create_deploy_challenge_callback()
        else:
            callback = create_terminate_challenge_callback()
        
        # Start the queue worker
        queue = get_queue(queue_type)
        
        # Recover any stalled tasks (this operation is now protected by a lock)
        recovered = queue.recover_stalled_tasks()
        if recovered > 0:
            logging.info(f"Recovered {recovered} stalled tasks from previous session for {queue_name} queue")
        
        # Start processing the queue
        success = worker.start(callback)
        
        if success:
            logging.info(f"{queue_name.capitalize()} queue worker started successfully")
            return True
        else:
            logging.warning(f"Failed to start {queue_name} queue worker")
            # Stop and deregister the worker
            worker.stop()
            return False
            
    except Exception as e:
        logging.error(f"Error starting {queue_name} queue worker: {e}")
        logging.error(traceback.format_exc())
        return False

def init_all_workers():
    """Initialize all queue workers (deployment and termination)."""
    # Acquire a global lock during initialization to prevent race conditions
    lock = CriticalSectionManager.lock_operation("init_workers")
    if not lock:
        logging.error("Failed to acquire lock for worker initialization")
        return False
    
    try:
        logging.info("Initializing all workers with distributed lock protection")
        
        # Initialize health checker to monitor worker health across the system
        heartbeat_manager = get_heartbeat_manager()
        heartbeat_manager.start_health_checker()
        
        deployment_success = init_worker(ChallengeQueue.QUEUE_DEPLOYMENT)
        termination_success = init_worker(ChallengeQueue.QUEUE_TERMINATION)
        
        if deployment_success and termination_success:
            logging.info("All workers initialized successfully")
        else:
            logging.warning("One or more workers failed to initialize")
        
        return deployment_success and termination_success
    except Exception as e:
        logging.error(f"Error initializing workers: {e}")
        logging.error(traceback.format_exc())
        return False
    finally:
        CriticalSectionManager.release_lock(lock)
        logging.info("Worker initialization lock released") 