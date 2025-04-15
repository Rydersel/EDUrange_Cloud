"""
Queue Manager for Challenge Deployment

This module implements a priority queue system for challenge deployments
using Redis as the backend. It provides functionality to:
- Enqueue challenge deployment requests with different priorities
- Dequeue requests in priority order
- Track queue status and metrics
"""

import json
import logging
import time
from datetime import datetime
import os
from dotenv import load_dotenv
import threading
from .redis_manager import get_redis

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [QUEUE] - %(levelname)s - %(message)s'
)

class ChallengeQueue:
    """
    A priority-based queue for challenge deployments using Redis.
    
    The queue uses Redis sorted sets to implement priority queuing.
    Lower priority values are processed first (higher priority).
    """
    
    # Queue priority levels (lower number = higher priority)
    PRIORITY_HIGH = 1       # Instructor/admin deployments
    PRIORITY_NORMAL = 2     # Regular student deployments
    PRIORITY_LOW = 3        # Batch deployments, maintenance tasks
    
    # Queue types
    QUEUE_DEPLOYMENT = "deployment"  # Challenge deployment queue
    QUEUE_TERMINATION = "termination"  # Challenge termination queue
    
    def __init__(self, redis_url=None, queue_type=QUEUE_DEPLOYMENT):
        """
        Initialize the challenge queue with Redis connection.
        
        Args:
            redis_url (str, optional): Redis connection URL.
                Defaults to the REDIS_URL environment variable.
            queue_type (str, optional): Type of queue to use.
                Defaults to QUEUE_DEPLOYMENT.
        """
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://redis:6379/0")
        self.queue_type = queue_type
        
        # Set keys based on queue type
        prefix = f"challenge_{queue_type}"
        self.queue_key = f"{prefix}_queue"
        self.processing_key = f"{prefix}_processing"
        self.metrics_key = f"{prefix}_metrics"
        
        self.worker_thread = None
        self.should_stop = False
        
        # Connection status caching
        self.op_cache = {
            'last_connect_check': 0,
            'is_connected': False,
            'cache_ttl': float(os.getenv("REDIS_CACHE_TTL", "1.0"))
        }
        self.cache_lock = threading.RLock()
        
        # Get the Redis manager instance instead of creating a new connection
        self.redis = get_redis()
        logging.info(f"ChallengeQueue initialized with Redis manager for {queue_type} operations")
            
    def is_connected(self):
        """
        Check if the Redis connection is active with connection status caching.
        
        This method caches the connection status for a short period to reduce
        the overhead of frequent connection checks during high-volume operations.
        
        Returns:
            bool: True if Redis is connected, False otherwise.
        """
        current_time = time.time()
        cache_ttl = self.op_cache['cache_ttl']
        
        # Fast path: use cached value if recent enough
        with self.cache_lock:
            if current_time - self.op_cache['last_connect_check'] < cache_ttl:
                return self.op_cache['is_connected']
            
            # Slow path: actual check and update cache
            is_connected = self.redis and self.redis.is_connected
            self.op_cache['is_connected'] = is_connected
            self.op_cache['last_connect_check'] = current_time
            
            return is_connected
            
    def enqueue(self, challenge_data, priority=PRIORITY_NORMAL, task_id=None):
        """
        Add a challenge deployment request to the queue.
        
        Args:
            challenge_data (dict): The challenge deployment data.
            priority (int, optional): Priority level. Defaults to PRIORITY_NORMAL.
            task_id (str, optional): Custom task ID to use. If not provided, a new one is generated.
                
        Returns:
            str: The task ID if successful, None otherwise.
        """
        if not self.is_connected():
            logging.error("Cannot enqueue: Redis connection not available")
            return None
            
        try:
            # Use provided task_id or generate a unique task ID
            if not task_id:
                task_id = f"task_{int(time.time())}_{os.urandom(4).hex()}"
            
            # Add deployment metadata
            challenge_data['metadata'] = {
                'task_id': task_id,
                'enqueued_at': datetime.now().isoformat(),
                'priority': priority,
                'status': 'queued'
            }
            
            # Store the task data
            self.redis.set(f"challenge_task:{task_id}", json.dumps(challenge_data))
            
            # Add to the sorted set with priority as score
            # Lower score = higher priority in Redis sorted sets
            score = priority * 1000000000 + int(time.time())  # Use time to order within priority
            self.redis.zadd(self.queue_key, {task_id: score})
            
            # Update metrics
            self.redis.hincrby(self.metrics_key, "total_enqueued", 1)
            self.redis.hincrby(self.metrics_key, f"priority_{priority}_enqueued", 1)
            
            logging.info(f"Enqueued task {task_id} with priority {priority}")
            return task_id
            
        except Exception as e:
            logging.error(f"Error enqueuing challenge: {e}")
            return None
            
    def dequeue(self):
        """
        Get the next highest priority task from the queue.
        
        Returns:
            dict: The challenge deployment data if available, None otherwise.
        """
        if not self.is_connected():
            logging.error("Cannot dequeue: Redis connection not available")
            return None
            
        try:
            # Use a pipeline to ensure atomicity
            pipe = self.redis.pipeline()
            
            # Get the highest priority task (lowest score)
            pipe.zrange(self.queue_key, 0, 0)
            # Remove it from the queue
            pipe.zremrangebyrank(self.queue_key, 0, 0)
            
            # Execute the pipeline
            result = pipe.execute()
            
            # Check if we got a task
            if not result[0]:
                return None
                
            task_id = result[0][0].decode('utf-8') if isinstance(result[0][0], bytes) else result[0][0]
            
            # Get the task data
            task_data_json = self.redis.get(f"challenge_task:{task_id}")
            if not task_data_json:
                logging.error(f"Task {task_id} found in queue but data is missing")
                return None
                
            # Parse the task data
            task_data = json.loads(task_data_json)
            
            # Update the task status
            task_data['metadata']['status'] = 'processing'
            task_data['metadata']['dequeued_at'] = datetime.now().isoformat()
            
            # Store the updated task data
            self.redis.set(f"challenge_task:{task_id}", json.dumps(task_data))
            
            # Move to processing set with timestamp as score
            self.redis.zadd(self.processing_key, {task_id: int(time.time())})
            
            # Update metrics
            self.redis.hincrby(self.metrics_key, "total_dequeued", 1)
            self.redis.hincrby(self.metrics_key, f"priority_{task_data['metadata']['priority']}_dequeued", 1)
            
            logging.info(f"Dequeued task {task_id} with priority {task_data['metadata']['priority']}")
            return task_data
            
        except Exception as e:
            logging.error(f"Error dequeuing challenge: {e}")
            return None
            
    def complete_task(self, task_id, success=True, result=None):
        """
        Mark a task as completed and store the result.
        
        Args:
            task_id (str): The ID of the task to mark as completed.
            success (bool, optional): Whether the task completed successfully.
            result (dict, optional): The result of the task.
                
        Returns:
            bool: True if successful, False otherwise.
        """
        if not self.is_connected():
            logging.error("Cannot complete task: Redis connection not available")
            return False
            
        try:
            # Get the task data
            task_data_json = self.redis.get(f"challenge_task:{task_id}")
            if not task_data_json:
                logging.error(f"Task {task_id} not found")
                return False
                
            # Parse the task data
            task_data = json.loads(task_data_json)
            
            # Update the task status and result
            task_data['metadata']['status'] = 'completed' if success else 'failed'
            task_data['metadata']['completed_at'] = datetime.now().isoformat()
            
            if result:
                task_data['result'] = result
                
            # Store the updated task data
            self.redis.set(f"challenge_task:{task_id}", json.dumps(task_data))
            
            # Remove from processing set
            self.redis.zrem(self.processing_key, task_id)
            
            # Update metrics
            self.redis.hincrby(self.metrics_key, "total_completed", 1)
            if success:
                self.redis.hincrby(self.metrics_key, "successful_completions", 1)
            else:
                self.redis.hincrby(self.metrics_key, "failed_completions", 1)
                
            logging.info(f"Completed task {task_id} with {'success' if success else 'failure'}")
            return True
            
        except Exception as e:
            logging.error(f"Error completing task {task_id}: {e}")
            return False
            
    def get_task_status(self, task_id):
        """
        Get the current status of a task.
        
        Args:
            task_id (str): The ID of the task to check.
                
        Returns:
            dict: The task data if found, None otherwise.
        """
        if not self.is_connected():
            logging.error("Cannot get task status: Redis connection not available")
            return None
            
        try:
            # Get the task data
            task_data_json = self.redis.get(f"challenge_task:{task_id}")
            if not task_data_json:
                return None
                
            # Parse the task data
            task_data = json.loads(task_data_json)
            return task_data
            
        except Exception as e:
            logging.error(f"Error getting task status for {task_id}: {e}")
            return None
            
    def get_queue_stats(self):
        """
        Get statistics about the queue.
        
        Returns:
            dict: Queue statistics.
        """
        if not self.is_connected():
            logging.error("Cannot get queue stats: Redis connection not available")
            return {
                "error": "Redis connection not available",
                "connected": False,
                "redis_stats": self.redis.get_stats() if hasattr(self.redis, 'get_stats') else {"error": "Stats not available"},
                "connection_cache": {
                    "status": "disconnected",
                    "last_check": self.op_cache['last_connect_check'],
                    "cache_ttl": self.op_cache['cache_ttl'],
                    "time_since_check": time.time() - self.op_cache['last_connect_check']
                }
            }
            
        try:
            # Get queue lengths
            queued_count = self.redis.zcard(self.queue_key)
            processing_count = self.redis.zcard(self.processing_key)
            
            # Get counts by priority
            priority_counts = {}
            for priority in [self.PRIORITY_HIGH, self.PRIORITY_NORMAL, self.PRIORITY_LOW]:
                min_score = priority * 1000000000
                max_score = (priority + 1) * 1000000000 - 1
                count = self.redis.zcount(self.queue_key, min_score, max_score)
                priority_counts[f"priority_{priority}"] = count
                
            # Get metrics
            metrics = {}
            raw_metrics = self.redis.hgetall(self.metrics_key)
            for key, value in raw_metrics.items():
                if isinstance(key, bytes):
                    key = key.decode('utf-8')
                if isinstance(value, bytes):
                    value = value.decode('utf-8')
                metrics[key] = int(value)
                
            # Add Redis connection stats
            redis_stats = self.redis.get_stats() if hasattr(self.redis, 'get_stats') else {"status": "connected"}
            
            # Add connection cache stats
            current_time = time.time()
            connection_cache = {
                "status": "active" if self.op_cache['is_connected'] else "inactive",
                "last_check": self.op_cache['last_connect_check'],
                "cache_ttl": self.op_cache['cache_ttl'],
                "time_since_check": current_time - self.op_cache['last_connect_check'],
                "cache_fresh": (current_time - self.op_cache['last_connect_check']) < self.op_cache['cache_ttl']
            }
                
            return {
                "queued": queued_count,
                "processing": processing_count,
                "priority_counts": priority_counts,
                "metrics": metrics,
                "connected": True,
                "redis_stats": redis_stats,
                "connection_cache": connection_cache
            }
            
        except Exception as e:
            logging.error(f"Error getting queue stats: {e}")
            return {
                "error": str(e),
                "connected": False,
                "redis_stats": self.redis.get_stats() if hasattr(self.redis, 'get_stats') else {"error": "Stats not available"},
                "connection_cache": {
                    "status": "error",
                    "last_check": self.op_cache['last_connect_check'],
                    "cache_ttl": self.op_cache['cache_ttl'],
                    "time_since_check": time.time() - self.op_cache['last_connect_check'],
                    "error": str(e)
                }
            }
            
    def clear_queue(self):
        """
        Clear all tasks from the queue (for admin use only).
        
        Returns:
            bool: True if successful, False otherwise.
        """
        if not self.is_connected():
            logging.error("Cannot clear queue: Redis connection not available")
            return False
            
        try:
            # Get all task IDs
            queued_tasks = self.redis.zrange(self.queue_key, 0, -1)
            processing_tasks = self.redis.zrange(self.processing_key, 0, -1)
            
            # Create a pipeline
            pipe = self.redis.pipeline()
            
            # Delete all task data
            for task_id in queued_tasks + processing_tasks:
                task_id = task_id.decode('utf-8') if isinstance(task_id, bytes) else task_id
                pipe.delete(f"challenge_task:{task_id}")
                
            # Clear the queues
            pipe.delete(self.queue_key)
            pipe.delete(self.processing_key)
            
            # Reset metrics
            pipe.delete(self.metrics_key)
            
            # Execute the pipeline
            pipe.execute()
            
            logging.warning("Challenge queue cleared")
            return True
            
        except Exception as e:
            logging.error(f"Error clearing queue: {e}")
            return False

    def start_worker(self, callback, interval=1):
        """
        Start a worker thread that processes queue items.
        
        Args:
            callback (callable): Function to call with task data.
            interval (int, optional): Polling interval in seconds.
                
        Returns:
            bool: True if the worker was started, False otherwise.
        """
        if self.worker_thread and self.worker_thread.is_alive():
            logging.warning("Worker thread already running")
            return False
            
        def worker():
            logging.info("Starting queue worker thread")
            self.should_stop = False
            
            # Track consecutive empty polls for adaptive sleep
            consecutive_empty = 0
            max_sleep = 0.5  # Maximum sleep time in seconds
            
            # Task timeout configuration
            task_timeout = float(os.getenv("TASK_TIMEOUT_SECONDS", "600"))  # Default: 10 minutes
            
            while not self.should_stop:
                try:
                    # Check Redis connection status using cached check
                    if not self.is_connected():
                        logging.warning("Redis connection lost, waiting before continuing...")
                        time.sleep(5)  # Wait longer when disconnected
                        continue
                    
                    # Get the next task
                    task_data = self.dequeue()
                    
                    if task_data:
                        # Process the task
                        task_id = task_data['metadata']['task_id']
                        logging.info(f"Processing task {task_id}")
                        
                        # Reset consecutive empty counter when we process a task
                        consecutive_empty = 0
                        
                        try:
                            # Create a timeout thread to monitor task execution
                            task_completed = False
                            task_result = {"error": "Task timed out"}
                            task_success = False
                            
                            def execute_task():
                                nonlocal task_completed, task_result, task_success
                                try:
                                    # Call the callback with the task data
                                    result = callback(task_data)
                                    task_result = result
                                    task_success = True
                                except Exception as e:
                                    logging.error(f"Error processing task {task_id}: {e}")
                                    task_result = {"error": str(e)}
                                    task_success = False
                                finally:
                                    task_completed = True
                            
                            # Start task execution in a separate thread
                            task_thread = threading.Thread(target=execute_task)
                            task_thread.daemon = True
                            task_thread.start()
                            
                            # Wait for completion or timeout
                            start_time = time.time()
                            while not task_completed and (time.time() - start_time) < task_timeout:
                                time.sleep(0.5)  # Check for completion every 500ms
                                
                                # Check if we should stop the worker
                                if self.should_stop:
                                    logging.warning(f"Worker stopping during task {task_id} execution")
                                    break
                            
                            if not task_completed:
                                logging.warning(f"Task {task_id} timed out after {task_timeout} seconds")
                                # We can't terminate the thread safely in Python, but we'll stop waiting for it
                                # and mark the task as failed
                                task_result = {
                                    "error": f"Task execution timed out after {task_timeout} seconds",
                                    "status": "timeout"
                                }
                                task_success = False
                            
                            # Mark as completed with appropriate status
                            self.complete_task(task_id, success=task_success, result=task_result)
                            
                            # If task timed out, add to metrics
                            if not task_completed:
                                self.redis.hincrby(self.metrics_key, "timed_out_tasks", 1)
                                
                        except Exception as e:
                            logging.error(f"Error processing task {task_id}: {e}")
                            self.complete_task(task_id, success=False, result={"error": str(e)})
                    else:
                        # No tasks available, increment empty counter
                        consecutive_empty += 1
                        
                        # Use adaptive sleep time based on consecutive empty polls
                        # This reduces Redis query frequency when the queue is consistently empty
                        sleep_time = min(max_sleep, interval * (1 + consecutive_empty // 10))
                        time.sleep(sleep_time)
                        continue
                    
                    # Short sleep to prevent CPU hogging
                    time.sleep(interval)
                    
                except Exception as e:
                    logging.error(f"Error in worker thread: {e}")
                    time.sleep(interval)
                    
            logging.info("Queue worker thread stopped")
                
        # Create and start the worker thread
        self.worker_thread = threading.Thread(target=worker, daemon=True)
        self.worker_thread.start()
        return True
            
    def stop_worker(self):
        """
        Stop the worker thread.
        
        Returns:
            bool: True if the worker was stopped, False otherwise.
        """
        if not self.worker_thread or not self.worker_thread.is_alive():
            logging.warning("No active worker thread to stop")
            return False
            
        logging.info("Stopping queue worker thread...")
        self.should_stop = True
        
        # Wait for the thread to finish
        self.worker_thread.join(timeout=5)
        
        if self.worker_thread.is_alive():
            logging.warning("Worker thread did not stop in time")
            return False
            
        return True
            
    def recover_stalled_tasks(self, max_age_seconds=300):
        """
        Recover tasks that have been stuck in 'processing' for too long.
        
        Args:
            max_age_seconds (int, optional): Maximum time a task can be in 
                processing state. Defaults to 300 (5 minutes).
                
        Returns:
            int: Number of recovered tasks.
        """
        if not self.is_connected():
            logging.error("Cannot recover tasks: Redis connection not available")
            return 0
            
        try:
            # Get current time
            now = int(time.time())
            cutoff = now - max_age_seconds
            
            # Get tasks that have been processing for too long
            stalled_tasks = self.redis.zrangebyscore(
                self.processing_key, 0, cutoff
            )
            
            recovered = 0
            
            for task_id in stalled_tasks:
                task_id = task_id.decode('utf-8') if isinstance(task_id, bytes) else task_id
                
                # Get the task data
                task_data_json = self.redis.get(f"challenge_task:{task_id}")
                if not task_data_json:
                    # Task data is missing, just remove from processing
                    self.redis.zrem(self.processing_key, task_id)
                    continue
                    
                # Parse the task data
                task_data = json.loads(task_data_json)
                
                # Update the task status
                task_data['metadata']['status'] = 'recovered'
                task_data['metadata']['recovered_at'] = datetime.now().isoformat()
                task_data['metadata']['recovery_reason'] = f"Task processing time exceeded {max_age_seconds} seconds"
                
                # Re-queue the task
                priority = task_data['metadata'].get('priority', self.PRIORITY_NORMAL)
                
                # Store the updated task data
                self.redis.set(f"challenge_task:{task_id}", json.dumps(task_data))
                
                # Remove from processing set
                self.redis.zrem(self.processing_key, task_id)
                
                # Add back to queue
                score = priority * 1000000000 + int(time.time())
                self.redis.zadd(self.queue_key, {task_id: score})
                
                logging.info(f"Recovered stalled task {task_id} with priority {priority}")
                recovered += 1
                
            if recovered > 0:
                # Update metrics
                self.redis.hincrby(self.metrics_key, "recovered_tasks", recovered)
                
            return recovered
            
        except Exception as e:
            logging.error(f"Error recovering stalled tasks: {e}")
            return 0

# Create singleton instances for different queue types
_deployment_queue = None
_termination_queue = None

def get_queue(queue_type=ChallengeQueue.QUEUE_DEPLOYMENT):
    """
    Get the queue instance for the specified queue type.
    
    Args:
        queue_type (str, optional): Type of queue to get.
            Defaults to ChallengeQueue.QUEUE_DEPLOYMENT.
            
    Returns:
        ChallengeQueue: The queue instance for the specified type.
    """
    global _deployment_queue, _termination_queue
    
    if queue_type == ChallengeQueue.QUEUE_DEPLOYMENT:
        if _deployment_queue is None:
            _deployment_queue = ChallengeQueue(queue_type=ChallengeQueue.QUEUE_DEPLOYMENT)
        return _deployment_queue
    elif queue_type == ChallengeQueue.QUEUE_TERMINATION:
        if _termination_queue is None:
            _termination_queue = ChallengeQueue(queue_type=ChallengeQueue.QUEUE_TERMINATION)
        return _termination_queue
    else:
        raise ValueError(f"Invalid queue type: {queue_type}") 