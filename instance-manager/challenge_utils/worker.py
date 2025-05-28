import os
import socket
import logging
import time
import uuid
import signal
import traceback
from threading import Thread, Event
from datetime import datetime
from enum import Enum

from challenge_utils.queue_manager import (
    get_queue,
    ChallengeQueue
)
from challenge_utils.redis_manager import get_redis
from challenge_utils.distributed_lock import acquire_lock
from challenge_utils.worker_registry import get_worker_registry, WorkerStatus
from challenge_utils.heartbeat_manager import get_heartbeat_manager
from challenge_utils.worker_state import get_worker_state_manager

class QueueWorker:
    def __init__(self, queue_type, worker_id=None):
        """Initialize a queue worker.
        
        Args:
            queue_type (str): Type of queue to process.
            worker_id (str, optional): Worker ID. If None, a UUID will be generated.
        """
        self.queue_type = queue_type
        self.worker_id = worker_id or f"{queue_type}-{uuid.uuid4()}"
        self.hostname = socket.gethostname()
        self.pid = os.getpid()
        self.start_time = datetime.now().isoformat()
        self.tasks_processed = 0
        self.tasks_failed = 0
        self.current_task_id = None
        self.current_task_start = None
        self.running = False
        self.paused = False
        self.pause_reason = None
        self.stop_event = Event()
        self.worker_thread = None
        self.redis = get_redis().client
        
        # Register the worker
        self._register_worker()
        
        # Start heartbeat thread
        self._start_heartbeat()
        
        logging.info(f"Worker {self.worker_id} initialized for {queue_type} queue")
    
    def _register_worker(self):
        """Register the worker with the worker registry."""
        registry = get_worker_registry()
        worker = registry.register_worker(
            queue_type=self.queue_type,
            worker_id=self.worker_id
        )
        
        if not worker:
            logging.error(f"Failed to register worker {self.worker_id}")
            raise RuntimeError(f"Failed to register worker {self.worker_id}")
        
        # Initialize worker state
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(self.worker_id, {
            'status': 'initialized',
            'start_time': self.start_time,
            'queue_type': self.queue_type,
            'hostname': self.hostname,
            'pid': self.pid
        })
    
    def _start_heartbeat(self):
        """Start the heartbeat thread."""
        self.heartbeat_thread = Thread(
            target=self._heartbeat_loop, 
            name=f"heartbeat-{self.worker_id}",
            daemon=True
        )
        self.heartbeat_thread.start()
        logging.info(f"Started heartbeat thread for worker {self.worker_id}")
    
    def _heartbeat_loop(self):
        """Send heartbeats to indicate the worker is alive."""
        heartbeat_manager = get_heartbeat_manager()
        registry = get_worker_registry()
        state_manager = get_worker_state_manager()
        
        while not self.stop_event.is_set():
            try:
                # Determine current status
                if self.paused:
                    status = WorkerStatus.PAUSED
                elif self.current_task_id:
                    task_type = "deployment" if self.queue_type == ChallengeQueue.QUEUE_DEPLOYMENT else "termination"
                    status = WorkerStatus.DEPLOYMENT if task_type == "deployment" else WorkerStatus.TERMINATION
                else:
                    status = WorkerStatus.IDLE
                
                # Get worker stats
                stats = {
                    'tasks_processed': self.tasks_processed,
                    'tasks_failed': self.tasks_failed,
                    'current_task_id': self.current_task_id
                }
                
                # Try to collect system stats if psutil is available
                try:
                    import psutil
                    process = psutil.Process()
                    stats['cpu_usage'] = process.cpu_percent(interval=0.1)
                    stats['memory_usage'] = process.memory_info().rss / (1024 * 1024)  # MB
                except ImportError:
                    # psutil not available, skip these stats
                    pass
                
                # Send heartbeat
                heartbeat_manager.send_heartbeat(
                    self.worker_id, 
                    task_id=self.current_task_id,
                    stats=stats
                )
                
                # Update worker in registry
                registry.update_worker_status(self.worker_id, status)
                
                # Check for pause/resume commands in worker state
                worker_state = state_manager.get_worker_state_data(self.worker_id)
                command = worker_state.get('command')
                
                if command == 'pause' and not self.paused:
                    self.paused = True
                    self.pause_reason = worker_state.get('reason', 'Paused by admin')
                    logging.info(f"Worker {self.worker_id} paused: {self.pause_reason}")
                    # Update status after pausing
                    registry.update_worker_status(self.worker_id, WorkerStatus.PAUSED)
                elif command == 'resume' and self.paused:
                    self.paused = False
                    self.pause_reason = None
                    logging.info(f"Worker {self.worker_id} resumed")
                    # Update status after resuming
                    idle_status = WorkerStatus.IDLE
                    registry.update_worker_status(self.worker_id, idle_status)
                elif command == 'stop' and not self.stop_event.is_set():
                    logging.info(f"Worker {self.worker_id} received stop command")
                    self.stop()
            except Exception as e:
                logging.error(f"Error in heartbeat loop for worker {self.worker_id}: {e}")
                logging.error(traceback.format_exc())
            
            # Wait for next heartbeat (5 seconds)
            self.stop_event.wait(5)

    def start(self, callback):
        """
        Start processing items from the queue.
        
        Args:
            callback: Function to process queue items
            
        Returns:
            bool: True if worker started successfully, False otherwise
        """
        if self.running:
            logging.warning(f"Worker {self.worker_id} is already running")
            return False
        
        self.running = True
        self.callback = callback
        
        # Update worker state and status
        registry = get_worker_registry()
        registry.update_worker_status(self.worker_id, WorkerStatus.ACTIVE)
        
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(self.worker_id, {
            'status': 'active',
            'command': 'run'
        })
        
        def worker_loop():
            """Main worker loop processing queue items."""
            queue = get_queue(self.queue_type)
            
            logging.info(f"Worker {self.worker_id} started processing {self.queue_type} queue")
            
            while self.running and not self.stop_event.is_set():
                try:
                    # If paused, wait until resumed
                    if self.paused:
                        logging.debug(f"Worker {self.worker_id} is paused: {self.pause_reason}")
                        time.sleep(1)
                        continue
                    
                    # Check for and process items
                    item = queue.dequeue()
                    
                    if item:
                        self._process_item(item, callback)
                    else:
                        # No items in queue, wait a bit
                        time.sleep(0.2)
                except Exception as e:
                    logging.error(f"Error in worker loop for {self.worker_id}: {e}")
                    logging.error(traceback.format_exc())
                    time.sleep(5)  # Wait a bit after an error
            
            logging.info(f"Worker {self.worker_id} stopped")
            
            # Update worker state and status
            try:
                registry = get_worker_registry()
                registry.update_worker_status(self.worker_id, WorkerStatus.STOPPED)
                
                state_manager = get_worker_state_manager()
                state_manager.update_worker_state(self.worker_id, {
                    'status': 'stopped'
                })
            except Exception as e:
                logging.error(f"Error updating worker state on stop: {e}")
        
        # Start worker thread
        self.worker_thread = Thread(
            target=worker_loop,
            name=f"worker-{self.worker_id}",
            daemon=True
        )
        self.worker_thread.start()
        
        return True

    def stop(self):
        """Stop the worker."""
        if not self.running:
            logging.warning(f"Worker {self.worker_id} is not running")
            return False
        
        self.running = False
        self.stop_event.set()
        
        logging.info(f"Stopping worker {self.worker_id}...")
        
        # Update registry
        registry = get_worker_registry()
        registry.update_worker_status(self.worker_id, WorkerStatus.STOPPED)
        
        # Update state
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(self.worker_id, {
            'status': 'stopped',
            'command': 'stop'
        })
        
        # Wait for worker thread to finish (with timeout)
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=10)
            if self.worker_thread.is_alive():
                logging.warning(f"Worker thread for {self.worker_id} did not terminate within timeout")
        
        # Deregister worker
        try:
            registry.deregister_worker(self.worker_id)
            logging.info(f"Worker {self.worker_id} deregistered")
        except Exception as e:
            logging.error(f"Error deregistering worker {self.worker_id}: {e}")
        
        return True

    def _process_item(self, item, callback):
        """
        Process a queue item.
        
        Args:
            item: Queue item to process
            callback: Function to process the item
        """
        # Get task ID from metadata
        metadata = item.get('metadata', {})
        self.current_task_id = metadata.get('task_id')
        self.current_task_start = time.time()
        
        # Update registry and state
        registry = get_worker_registry()
        status = WorkerStatus.DEPLOYMENT if self.queue_type == ChallengeQueue.QUEUE_DEPLOYMENT else WorkerStatus.TERMINATION
        registry.update_worker_status(self.worker_id, status)
        
        state_manager = get_worker_state_manager()
        state_manager.update_worker_state(self.worker_id, {
            'status': 'processing',
            'current_task': {
                'id': self.current_task_id,
                'type': self.queue_type,
                'start_time': self.current_task_start
            }
        })
        
        logging.info(f"Worker {self.worker_id} processing task {self.current_task_id}")
        
        # Process the item
        success = False
        error_msg = None
        result = None
        
        try:
            # Process the item using callback
            queue = get_queue(self.queue_type)
            result = callback(item)
            
            # Mark as success if the result indicates success
            if isinstance(result, dict) and result.get('success') is True:
                success = True
                queue.complete_task(self.current_task_id, success=True, result=result)
            else:
                # Mark as failed with error message
                error_msg = result.get('error') if isinstance(result, dict) else "Unknown error"
                queue.complete_task(self.current_task_id, success=False, result=result)
                
        except Exception as e:
            logging.error(f"Error processing task {self.current_task_id}: {e}")
            logging.error(traceback.format_exc())
            error_msg = str(e)
            
            # Mark the task as failed in the queue
            try:
                queue = get_queue(self.queue_type)
                queue.complete_task(self.current_task_id, success=False, result={"error": error_msg})
            except Exception as queue_e:
                logging.error(f"Error marking task as failed in queue: {queue_e}")
        
        # Update counters
        if success:
            self.tasks_processed += 1
        else:
            self.tasks_failed += 1
        
        # Update worker state after task completion
        task_duration = time.time() - self.current_task_start
        state_manager.update_worker_state(self.worker_id, {
            'status': 'idle',
            'last_task': {
                'id': self.current_task_id,
                'type': self.queue_type,
                'success': success,
                'error': error_msg,
                'duration': task_duration,
                'result': result
            },
            'current_task': None
        })
        
        # Reset current task
        self.current_task_id = None
        self.current_task_start = None
        
        # Update registry
        registry.update_worker_status(self.worker_id, WorkerStatus.IDLE)
        
        return success 