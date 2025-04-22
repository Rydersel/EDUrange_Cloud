"""
Worker Registry System

This module provides functionality for tracking and coordinating multiple 
queue workers across the system, enabling effective parallel processing.
"""

import os
import logging
import threading
import socket
import uuid
import time
import json
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any

from .redis_manager import get_redis
from .distributed_lock import acquire_lock, DistributedLock


class WorkerStatus(Enum):
    """Enum for worker status."""
    IDLE = "idle"
    ACTIVE = "active"
    PAUSED = "paused"
    FAILED = "failed"
    STOPPED = "stopped"
    DEPLOYMENT = "deployment"
    TERMINATION = "termination"


class Worker:
    """
    Class representing a worker instance.
    
    Contains information about worker identity, status,
    and processing statistics.
    """
    
    def __init__(self, 
                 worker_id: str, 
                 queue_type: str,
                 hostname: str = None,
                 pid: int = None,
                 status: WorkerStatus = WorkerStatus.IDLE):
        """
        Initialize a worker.
        
        Args:
            worker_id: Unique ID for this worker
            queue_type: Type of queue this worker processes
            hostname: Worker's hostname, defaults to current host
            pid: Process ID, defaults to current process
            status: Initial worker status
        """
        self.worker_id = worker_id
        self.queue_type = queue_type
        self.hostname = hostname or socket.gethostname()
        self.pid = pid or os.getpid()
        self.status = status
        self.start_time = datetime.now().isoformat()
        self.last_heartbeat = None
        self.tasks_processed = 0
        self.tasks_failed = 0
        self.current_task_id = None
        self.cpu_usage = 0.0
        self.memory_usage = 0
        self.resource_allocation = {}
        self.metadata = {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert worker to dictionary for serialization."""
        return {
            "worker_id": self.worker_id,
            "queue_type": self.queue_type,
            "hostname": self.hostname,
            "pid": self.pid,
            "status": self.status.value,
            "start_time": self.start_time,
            "last_heartbeat": self.last_heartbeat,
            "tasks_processed": self.tasks_processed,
            "tasks_failed": self.tasks_failed,
            "current_task_id": self.current_task_id,
            "cpu_usage": self.cpu_usage,
            "memory_usage": self.memory_usage,
            "resource_allocation": self.resource_allocation,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Worker':
        """Create worker instance from dictionary."""
        worker = cls(
            worker_id=data["worker_id"],
            queue_type=data["queue_type"],
            hostname=data["hostname"],
            pid=data["pid"],
            status=WorkerStatus(data["status"])
        )
        worker.start_time = data["start_time"]
        worker.last_heartbeat = data["last_heartbeat"]
        worker.tasks_processed = data["tasks_processed"]
        worker.tasks_failed = data["tasks_failed"]
        worker.current_task_id = data["current_task_id"]
        worker.cpu_usage = data["cpu_usage"]
        worker.memory_usage = data["memory_usage"]
        worker.resource_allocation = data["resource_allocation"]
        worker.metadata = data["metadata"]
        return worker


class WorkerRegistry:
    """
    Registry for managing worker instances across the system.
    
    Provides functions for registering, updating, and monitoring workers.
    """
    
    # Redis key prefixes
    WORKER_KEY_PREFIX = "worker:registry:"
    WORKER_ID_SET = "worker:ids"
    WORKER_LOCK_PREFIX = "worker:lock:"
    
    # Default expiry times (in seconds)
    DEFAULT_WORKER_EXPIRY = 3600  # 1 hour
    DEFAULT_HEARTBEAT_INTERVAL = 30
    DEFAULT_HEARTBEAT_TIMEOUT = 90
    
    def __init__(self):
        """Initialize the worker registry."""
        self.redis = get_redis()
        self.worker_cache = {}
        self.cache_lock = threading.RLock()
        self.heartbeat_interval = int(os.getenv("WORKER_HEARTBEAT_INTERVAL", 
                                                str(self.DEFAULT_HEARTBEAT_INTERVAL)))
        self.heartbeat_timeout = int(os.getenv("WORKER_HEARTBEAT_TIMEOUT", 
                                               str(self.DEFAULT_HEARTBEAT_TIMEOUT)))
        self.worker_expiry = int(os.getenv("WORKER_EXPIRY_SECONDS", 
                                           str(self.DEFAULT_WORKER_EXPIRY)))
        
        logging.info(f"Worker registry initialized with heartbeat interval: {self.heartbeat_interval}s, "
                     f"timeout: {self.heartbeat_timeout}s, expiry: {self.worker_expiry}s")
    
    def generate_worker_id(self, queue_type: str) -> str:
        """
        Generate a unique worker ID.
        
        Args:
            queue_type: The type of queue this worker processes
            
        Returns:
            A unique worker ID
        """
        hostname = socket.gethostname()
        pid = os.getpid()
        random_id = uuid.uuid4().hex[:8]
        timestamp = int(time.time())
        
        return f"{queue_type}-{hostname}-{pid}-{random_id}-{timestamp}"
    
    def register_worker(self, queue_type: str, worker_id: str = None) -> Worker:
        """
        Register a new worker in the registry.
        
        Args:
            queue_type: Type of queue this worker processes
            worker_id: Optional worker ID, will be generated if not provided
            
        Returns:
            The registered Worker instance
        """
        if not worker_id:
            worker_id = self.generate_worker_id(queue_type)
        
        # Create worker instance
        worker = Worker(worker_id=worker_id, queue_type=queue_type)
        
        # Get a lock for this worker
        worker_lock_key = f"{self.WORKER_LOCK_PREFIX}{worker_id}"
        lock = acquire_lock(worker_lock_key, expire_seconds=30, timeout_seconds=10)
        
        if not lock:
            logging.error(f"Failed to acquire lock for worker registration: {worker_id}")
            raise RuntimeError(f"Failed to register worker {worker_id}")
        
        try:
            # Add to Redis
            worker_key = f"{self.WORKER_KEY_PREFIX}{worker_id}"
            worker_data = json.dumps(worker.to_dict())
            
            pipe = self.redis.client.pipeline()
            # Store worker data with expiry
            pipe.set(worker_key, worker_data, ex=self.worker_expiry)
            # Add to worker ID set
            pipe.sadd(self.WORKER_ID_SET, worker_id)
            pipe.execute()
            
            # Add to local cache
            with self.cache_lock:
                self.worker_cache[worker_id] = worker
            
            logging.info(f"Worker registered: {worker_id} for queue type: {queue_type}")
            return worker
            
        finally:
            # Release the lock
            lock.release()
    
    def update_worker(self, worker: Worker) -> bool:
        """
        Update worker information in the registry.
        
        Args:
            worker: Worker instance to update
            
        Returns:
            True if successful, False otherwise
        """
        # Get a lock for this worker
        worker_lock_key = f"{self.WORKER_LOCK_PREFIX}{worker.worker_id}"
        lock = acquire_lock(worker_lock_key, expire_seconds=30, timeout_seconds=10)
        
        if not lock:
            logging.error(f"Failed to acquire lock for worker update: {worker.worker_id}")
            return False
        
        try:
            # Update in Redis
            worker_key = f"{self.WORKER_KEY_PREFIX}{worker.worker_id}"
            worker_data = json.dumps(worker.to_dict())
            
            # Check if worker exists
            if not self.redis.client.exists(worker_key):
                logging.warning(f"Worker not found during update: {worker.worker_id}")
                return False
            
            # Update worker data and reset expiry
            self.redis.client.set(worker_key, worker_data, ex=self.worker_expiry)
            
            # Update local cache
            with self.cache_lock:
                self.worker_cache[worker.worker_id] = worker
            
            return True
            
        finally:
            # Release the lock
            lock.release()
    
    def get_worker(self, worker_id: str) -> Optional[Worker]:
        """
        Get worker information by ID.
        
        Args:
            worker_id: ID of the worker to retrieve
            
        Returns:
            Worker instance if found, None otherwise
        """
        # Check local cache first
        with self.cache_lock:
            if worker_id in self.worker_cache:
                return self.worker_cache[worker_id]
        
        # Not in cache, check Redis
        worker_key = f"{self.WORKER_KEY_PREFIX}{worker_id}"
        worker_data = self.redis.client.get(worker_key)
        
        if not worker_data:
            return None
        
        # Parse and cache the worker
        try:
            worker_dict = json.loads(worker_data)
            worker = Worker.from_dict(worker_dict)
            
            # Add to local cache
            with self.cache_lock:
                self.worker_cache[worker_id] = worker
            
            return worker
        except Exception as e:
            logging.error(f"Error parsing worker data for {worker_id}: {e}")
            return None
    
    def list_workers(self, queue_type: str = None) -> List[Worker]:
        """
        List all registered workers.
        
        Args:
            queue_type: Optional queue type to filter by
            
        Returns:
            List of Worker instances
        """
        # Get all worker IDs from Redis
        worker_ids = list(self.redis.client.smembers(self.WORKER_ID_SET))
        workers = []
        
        for worker_id in worker_ids:
            if isinstance(worker_id, bytes):
                worker_id = worker_id.decode('utf-8')
            
            worker = self.get_worker(worker_id)
            if worker:
                if queue_type is None or worker.queue_type == queue_type:
                    workers.append(worker)
        
        return workers
    
    def count_active_workers(self, queue_type: str = None) -> int:
        """
        Count the number of active workers.
        
        Args:
            queue_type: Optional queue type to filter by
            
        Returns:
            Count of active workers
        """
        workers = self.list_workers(queue_type)
        return sum(1 for w in workers if w.status == WorkerStatus.ACTIVE)
    
    def update_worker_status(self, worker_id: str, status: WorkerStatus) -> bool:
        """
        Update a worker's status.
        
        Args:
            worker_id: ID of the worker to update
            status: New worker status
            
        Returns:
            True if successful, False otherwise
        """
        worker = self.get_worker(worker_id)
        if not worker:
            logging.warning(f"Worker not found for status update: {worker_id}")
            return False
        
        worker.status = status
        return self.update_worker(worker)
    
    def update_worker_heartbeat(self, worker_id: str, task_id: str = None, 
                                stats: Dict[str, Any] = None) -> bool:
        """
        Update a worker's heartbeat timestamp and optional stats.
        
        Args:
            worker_id: ID of the worker to update
            task_id: Current task ID if processing
            stats: Optional dictionary of worker statistics
            
        Returns:
            True if successful, False otherwise
        """
        worker = self.get_worker(worker_id)
        if not worker:
            logging.warning(f"Worker not found for heartbeat: {worker_id}")
            return False
        
        # Update heartbeat and stats
        worker.last_heartbeat = datetime.now().isoformat()
        if task_id is not None:
            worker.current_task_id = task_id
        
        if stats:
            # Update worker statistics
            for key, value in stats.items():
                if key == 'cpu_usage':
                    worker.cpu_usage = value
                elif key == 'memory_usage':
                    worker.memory_usage = value
                elif key == 'tasks_processed':
                    worker.tasks_processed = value
                elif key == 'tasks_failed':
                    worker.tasks_failed = value
                else:
                    worker.metadata[key] = value
        
        return self.update_worker(worker)
    
    def deregister_worker(self, worker_id: str) -> bool:
        """
        Remove a worker from the registry.
        
        Args:
            worker_id: ID of the worker to remove
            
        Returns:
            True if successful, False otherwise
        """
        # Get a lock for this worker
        worker_lock_key = f"{self.WORKER_LOCK_PREFIX}{worker_id}"
        lock = acquire_lock(worker_lock_key, expire_seconds=30, timeout_seconds=10)
        
        if not lock:
            logging.error(f"Failed to acquire lock for worker deregistration: {worker_id}")
            return False
        
        try:
            # Remove from Redis
            worker_key = f"{self.WORKER_KEY_PREFIX}{worker_id}"
            pipe = self.redis.client.pipeline()
            pipe.delete(worker_key)
            pipe.srem(self.WORKER_ID_SET, worker_id)
            pipe.execute()
            
            # Remove from local cache
            with self.cache_lock:
                if worker_id in self.worker_cache:
                    del self.worker_cache[worker_id]
            
            logging.info(f"Worker deregistered: {worker_id}")
            return True
            
        finally:
            # Release the lock
            lock.release()
    
    def detect_stale_workers(self) -> List[Worker]:
        """
        Detect workers that haven't sent a heartbeat recently.
        
        Returns:
            List of stale Worker instances
        """
        current_time = datetime.now()
        stale_workers = []
        
        for worker in self.list_workers():
            if worker.last_heartbeat:
                try:
                    last_heartbeat = datetime.fromisoformat(worker.last_heartbeat)
                    difference = (current_time - last_heartbeat).total_seconds()
                    
                    if difference > self.heartbeat_timeout:
                        stale_workers.append(worker)
                except Exception as e:
                    logging.error(f"Error parsing heartbeat timestamp for {worker.worker_id}: {e}")
            else:
                # If no heartbeat has been recorded, check against start time
                try:
                    start_time = datetime.fromisoformat(worker.start_time)
                    difference = (current_time - start_time).total_seconds()
                    
                    if difference > self.heartbeat_timeout:
                        stale_workers.append(worker)
                except Exception as e:
                    logging.error(f"Error parsing start time for {worker.worker_id}: {e}")
        
        return stale_workers
    
    def cleanup_stale_workers(self) -> int:
        """
        Clean up workers that haven't sent a heartbeat recently.
        
        Returns:
            Number of workers cleaned up
        """
        stale_workers = self.detect_stale_workers()
        count = 0
        
        for worker in stale_workers:
            # Update status to FAILED before deregistering
            self.update_worker_status(worker.worker_id, WorkerStatus.FAILED)
            
            if self.deregister_worker(worker.worker_id):
                count += 1
        
        if count > 0:
            logging.info(f"Cleaned up {count} stale workers")
        
        return count


# Singleton registry instance
_worker_registry = None

def get_worker_registry() -> WorkerRegistry:
    """Get the worker registry singleton instance."""
    global _worker_registry
    if _worker_registry is None:
        _worker_registry = WorkerRegistry()
    return _worker_registry 