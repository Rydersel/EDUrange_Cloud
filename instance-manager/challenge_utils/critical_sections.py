"""
Critical section identification and locking utility.

This module provides functions to identify and protect critical sections
in the queue worker code that need distributed locks to prevent race conditions.
"""

import logging
import os
from functools import wraps
from typing import Callable, Dict, Any, Optional

from .lock_manager import get_lock_manager
from .distributed_lock import DistributedLock

# Lock timeout in seconds for various operations
DEFAULT_TIMEOUT = int(os.getenv("CRITICAL_SECTION_TIMEOUT", "30"))
DEPLOYMENT_TIMEOUT = int(os.getenv("DEPLOYMENT_LOCK_TIMEOUT", "120"))
TERMINATION_TIMEOUT = int(os.getenv("TERMINATION_LOCK_TIMEOUT", "60"))

def with_challenge_lock(func):
    """
    Decorator to ensure a function runs with a lock on a challenge.
    Expects the first argument to be a task_data dictionary with a challenge_id.
    """
    @wraps(func)
    def wrapper(task_data, *args, **kwargs):
        challenge_id = task_data.get("challenge_id") or task_data.get("id")
        if not challenge_id:
            # Try to extract from metadata if available
            if isinstance(task_data, dict) and "metadata" in task_data:
                if "challenge_id" in task_data["metadata"]:
                    challenge_id = task_data["metadata"]["challenge_id"]
        
        if not challenge_id:
            # Log more details about the task_data to help diagnose the issue
            if isinstance(task_data, dict):
                keys = list(task_data.keys())
                logging.error(f"Cannot acquire lock: No challenge_id found in task data. Available keys: {keys}")
                if "metadata" in task_data and isinstance(task_data["metadata"], dict):
                    metadata_keys = list(task_data["metadata"].keys())
                    logging.error(f"Metadata keys available: {metadata_keys}")
                if "deployment_name" in task_data:
                    logging.warning(f"Using deployment_name as fallback for challenge_id: {task_data['deployment_name']}")
                    challenge_id = task_data["deployment_name"]
                    task_data["challenge_id"] = challenge_id
                    logging.info(f"Added challenge_id {challenge_id} to task_data")
            else:
                logging.error(f"Cannot acquire lock: task_data is not a dictionary: {type(task_data)}")
            
            # If still no challenge_id, return error
            if not challenge_id:
                return {"error": "No challenge_id found in task data", "success": False}
        
        # Get appropriate timeout based on operation type
        operation = task_data.get("operation", "")
        if "deploy" in operation.lower():
            timeout = DEPLOYMENT_TIMEOUT
        elif "terminate" in operation.lower():
            timeout = TERMINATION_TIMEOUT
        else:
            timeout = DEFAULT_TIMEOUT
        
        lock_manager = get_lock_manager()
        lock = lock_manager.lock_challenge(str(challenge_id), blocking=True)
        
        if not lock:
            error_msg = f"Failed to acquire lock for challenge {challenge_id}"
            logging.error(error_msg)
            return {"error": error_msg, "success": False}
        
        try:
            logging.debug(f"Acquired lock for challenge {challenge_id}")
            return func(task_data, *args, **kwargs)
        finally:
            lock_manager.release(lock)
            logging.debug(f"Released lock for challenge {challenge_id}")
    
    return wrapper

def with_queue_lock(queue_name: str):
    """
    Decorator to ensure a function runs with a lock on a specific queue.
    
    Args:
        queue_name: Name of the queue to lock
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            lock_manager = get_lock_manager()
            lock = lock_manager.lock_queue(queue_name, blocking=True)
            
            if not lock:
                error_msg = f"Failed to acquire lock for queue {queue_name}"
                logging.error(error_msg)
                return None
            
            try:
                logging.debug(f"Acquired lock for queue {queue_name}")
                return func(*args, **kwargs)
            finally:
                lock_manager.release(lock)
                logging.debug(f"Released lock for queue {queue_name}")
        
        return wrapper
    
    return decorator

def with_resource_lock(resource_name: str):
    """
    Decorator to ensure a function runs with a lock on a specific resource.
    
    Args:
        resource_name: Name of the resource to lock
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            lock_manager = get_lock_manager()
            lock = lock_manager.lock_resource(resource_name, blocking=True)
            
            if not lock:
                error_msg = f"Failed to acquire lock for resource {resource_name}"
                logging.error(error_msg)
                return None
            
            try:
                logging.debug(f"Acquired lock for resource {resource_name}")
                return func(*args, **kwargs)
            finally:
                lock_manager.release(lock)
                logging.debug(f"Released lock for resource {resource_name}")
        
        return wrapper
    
    return decorator

class CriticalSectionManager:
    """
    Manager class for critical section identification and protection.
    
    This class provides methods to acquire locks for various types of
    critical sections in the application.
    """
    
    @staticmethod
    def lock_resource(resource_name: str) -> Optional[DistributedLock]:
        """
        Acquire a lock for a generic resource.
        
        Args:
            resource_name: Name of the resource
            
        Returns:
            The acquired lock or None if it couldn't be acquired
        """
        return get_lock_manager().lock_resource(resource_name)
    
    @staticmethod
    def lock_challenge_resource(challenge_id: str) -> Optional[DistributedLock]:
        """
        Acquire a lock for a specific challenge's resources.
        
        Args:
            challenge_id: ID of the challenge
            
        Returns:
            The acquired lock or None if it couldn't be acquired
        """
        return get_lock_manager().lock_challenge(str(challenge_id))
    
    @staticmethod
    def lock_operation(operation_name: str) -> Optional[DistributedLock]:
        """
        Acquire a lock for a specific operation.
        
        Args:
            operation_name: Name of the operation
            
        Returns:
            The acquired lock or None if it couldn't be acquired
        """
        return get_lock_manager().lock_resource(f"operation:{operation_name}")
    
    @staticmethod
    def lock_resource_allocation(resource_type: str) -> Optional[DistributedLock]:
        """
        Acquire a lock for resource allocation operations.
        
        Args:
            resource_type: Type of resource (e.g., 'namespace', 'network', 'storage')
            
        Returns:
            The acquired lock or None if it couldn't be acquired
        """
        return get_lock_manager().lock_resource(f"allocation:{resource_type}")
    
    @staticmethod
    def lock_queue_operation(queue_name: str) -> Optional[DistributedLock]:
        """
        Acquire a lock for queue-wide operations.
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            The acquired lock or None if it couldn't be acquired
        """
        return get_lock_manager().lock_queue(queue_name)
    
    @staticmethod
    def release_lock(lock: DistributedLock) -> bool:
        """
        Release a previously acquired lock.
        
        Args:
            lock: The lock to release
            
        Returns:
            True if the lock was released, False otherwise
        """
        return get_lock_manager().release(lock) 