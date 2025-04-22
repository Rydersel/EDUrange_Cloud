"""
Distributed locking implementation using Redis.

This module provides a Redis-based distributed lock mechanism to coordinate
access to shared resources among multiple queue workers.
"""

import logging
import time
import os
import threading
import uuid
from typing import Optional, Callable

# Import Redis manager from the same package
from .redis_manager import get_redis

class DistributedLock:
    """
    Redis-based distributed lock implementation.
    
    This class provides a lock mechanism that can be used across multiple processes
    or servers to ensure exclusive access to critical sections or resources.
    """
    
    def __init__(self, 
                 resource_name: str, 
                 expire_seconds: int = 10,
                 retry_interval_ms: int = 100,
                 retry_times: int = 50,
                 lock_prefix: str = "dlock"):
        """
        Initialize a distributed lock.
        
        Args:
            resource_name: Name of the resource to lock
            expire_seconds: Time in seconds after which the lock automatically expires
            retry_interval_ms: Milliseconds to wait between retry attempts
            retry_times: Number of times to retry acquiring the lock before giving up
            lock_prefix: Prefix for the lock keys in Redis
        """
        self.resource_name = resource_name
        self.expire_seconds = expire_seconds
        self.retry_interval_ms = retry_interval_ms
        self.retry_times = retry_times
        self.lock_prefix = lock_prefix
        
        # Generate a unique ID for this lock instance
        self.lock_id = f"{os.getpid()}-{threading.get_ident()}-{uuid.uuid4()}"
        
        # The full key used in Redis
        self.redis_key = f"{self.lock_prefix}:{self.resource_name}"
        
        # Get the Redis connection
        self.redis = get_redis()
        
        # Lock status
        self.is_locked = False
    
    def acquire(self, blocking: bool = True) -> bool:
        """
        Acquire the distributed lock.
        
        Args:
            blocking: If True, wait until the lock is acquired or timeout.
                    If False, return immediately if lock cannot be acquired.
        
        Returns:
            True if the lock was acquired, False otherwise.
        """
        if not self.redis.is_connected:
            logging.error("Cannot acquire lock: Redis connection not available")
            return False
        
        # Non-blocking attempt
        acquired = self._try_acquire_lock()
        if acquired or not blocking:
            return acquired
        
        # Blocking with retry
        for attempt in range(self.retry_times):
            if self._try_acquire_lock():
                return True
            
            # Wait before retrying
            time.sleep(self.retry_interval_ms / 1000.0)
        
        # Failed to acquire lock after all retries
        logging.warning(f"Failed to acquire lock for resource '{self.resource_name}' after {self.retry_times} attempts")
        return False
    
    def release(self) -> bool:
        """
        Release the distributed lock.
        
        Returns:
            True if the lock was released, False if it wasn't held or couldn't be released.
        """
        if not self.redis.is_connected:
            logging.error("Cannot release lock: Redis connection not available")
            return False
        
        if not self.is_locked:
            logging.warning(f"Attempted to release an unlocked lock for resource '{self.resource_name}'")
            return False
        
        try:
            # We use a Lua script to ensure we only delete the lock if it belongs to us
            release_script = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """
            
            # Execute the script
            result = self.redis.client.eval(release_script, 1, self.redis_key, self.lock_id)
            
            # Check if the lock was released
            if result == 1:
                self.is_locked = False
                logging.debug(f"Released lock for resource '{self.resource_name}'")
                return True
            else:
                logging.warning(f"Failed to release lock for resource '{self.resource_name}': lock is owned by another instance")
                self.is_locked = False  # We no longer consider ourselves the owner
                return False
            
        except Exception as e:
            logging.error(f"Error releasing lock for resource '{self.resource_name}': {e}")
            return False
    
    def _try_acquire_lock(self) -> bool:
        """
        Attempt to acquire the lock once without blocking.
        
        Returns:
            True if the lock was acquired, False otherwise.
        """
        try:
            # Use SET NX (not exists) with expiration to atomically acquire the lock
            acquired = self.redis.client.set(
                self.redis_key, 
                self.lock_id,
                nx=True,  # Only set if key doesn't exist
                ex=self.expire_seconds  # Set expiration time
            )
            
            if acquired:
                self.is_locked = True
                logging.debug(f"Acquired lock for resource '{self.resource_name}'")
                return True
            
            return False
            
        except Exception as e:
            logging.error(f"Error acquiring lock for resource '{self.resource_name}': {e}")
            return False
    
    def __enter__(self):
        """
        Context manager protocol support.
        
        Returns:
            True if the lock was acquired, False otherwise.
        """
        self.acquire()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """
        Context manager protocol support - release the lock when exiting the context.
        """
        self.release()


def acquire_lock(resource_name: str, expire_seconds: int = 10, timeout_seconds: int = 5) -> Optional[DistributedLock]:
    """
    Helper function to acquire a distributed lock.
    
    Args:
        resource_name: Name of the resource to lock
        expire_seconds: Time in seconds after which the lock automatically expires
        timeout_seconds: Maximum time to wait for the lock
        
    Returns:
        A DistributedLock instance if the lock was acquired, None otherwise.
    """
    # Calculate retry parameters based on timeout
    retry_interval_ms = 100  # 100ms between retries
    retry_times = int(timeout_seconds * 1000 / retry_interval_ms)
    
    lock = DistributedLock(
        resource_name=resource_name,
        expire_seconds=expire_seconds,
        retry_interval_ms=retry_interval_ms,
        retry_times=retry_times
    )
    
    if lock.acquire(blocking=True):
        return lock
    
    return None


def with_lock(resource_name: str, expire_seconds: int = 10, timeout_seconds: int = 5):
    """
    Decorator to execute a function with a distributed lock.
    
    Args:
        resource_name: Name of the resource to lock
        expire_seconds: Time in seconds after which the lock automatically expires
        timeout_seconds: Maximum time to wait for the lock
        
    Returns:
        Decorator function
    """
    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            lock = acquire_lock(resource_name, expire_seconds, timeout_seconds)
            if not lock:
                logging.error(f"Failed to acquire lock for resource '{resource_name}'")
                return None
            
            try:
                return func(*args, **kwargs)
            finally:
                lock.release()
        
        return wrapper
    
    return decorator 