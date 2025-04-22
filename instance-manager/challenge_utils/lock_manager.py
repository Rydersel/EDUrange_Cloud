"""
Lock Manager for centralized distributed lock management.

This module provides a centralized interface for acquiring and releasing
distributed locks to coordinate access to shared resources.
"""

import logging
import os
from typing import Dict, Optional

from .distributed_lock import DistributedLock

class LockManager:
    """
    Centralized manager for distributed locks.
    
    This class provides a singleton interface for acquiring and releasing
    distributed locks throughout the application.
    """
    
    # Default lock settings
    DEFAULT_EXPIRY = int(os.getenv("LOCK_EXPIRY_SECONDS", "30"))
    DEFAULT_RETRY_INTERVAL = int(os.getenv("LOCK_RETRY_INTERVAL_MS", "100"))
    DEFAULT_TIMEOUT = int(os.getenv("LOCK_TIMEOUT_SECONDS", "10"))
    
    # Lock type prefixes
    CHALLENGE_LOCK_PREFIX = "challenge"
    QUEUE_LOCK_PREFIX = "queue"
    RESOURCE_LOCK_PREFIX = "resource"
    
    def __init__(self):
        """Initialize the lock manager."""
        # Store active locks by resource name
        self.active_locks: Dict[str, DistributedLock] = {}
        
        # Lock configuration by resource type
        self.lock_configs = {
            self.CHALLENGE_LOCK_PREFIX: {
                "expire_seconds": int(os.getenv("CHALLENGE_LOCK_EXPIRY_SECONDS", str(self.DEFAULT_EXPIRY))),
                "retry_interval_ms": int(os.getenv("CHALLENGE_LOCK_RETRY_MS", str(self.DEFAULT_RETRY_INTERVAL))),
                "retry_times": int(os.getenv("CHALLENGE_LOCK_RETRY_TIMES", "50"))
            },
            self.QUEUE_LOCK_PREFIX: {
                "expire_seconds": int(os.getenv("QUEUE_LOCK_EXPIRY_SECONDS", str(self.DEFAULT_EXPIRY))),
                "retry_interval_ms": int(os.getenv("QUEUE_LOCK_RETRY_MS", str(self.DEFAULT_RETRY_INTERVAL))),
                "retry_times": int(os.getenv("QUEUE_LOCK_RETRY_TIMES", "50"))
            },
            self.RESOURCE_LOCK_PREFIX: {
                "expire_seconds": int(os.getenv("RESOURCE_LOCK_EXPIRY_SECONDS", str(self.DEFAULT_EXPIRY))),
                "retry_interval_ms": int(os.getenv("RESOURCE_LOCK_RETRY_MS", str(self.DEFAULT_RETRY_INTERVAL))),
                "retry_times": int(os.getenv("RESOURCE_LOCK_RETRY_TIMES", "50"))
            }
        }
        
        logging.info("Lock Manager initialized with configuration:")
        for lock_type, config in self.lock_configs.items():
            logging.info(f"  - {lock_type}: expiry={config['expire_seconds']}s, retry={config['retry_interval_ms']}ms, attempts={config['retry_times']}")
    
    def lock_challenge(self, challenge_id: str, blocking: bool = True) -> Optional[DistributedLock]:
        """
        Acquire a lock for a specific challenge.
        
        Args:
            challenge_id: ID of the challenge to lock
            blocking: If True, wait until the lock is acquired or timeout
        
        Returns:
            The lock object if acquired, None otherwise
        """
        resource_name = f"{self.CHALLENGE_LOCK_PREFIX}:{challenge_id}"
        return self._acquire_lock(resource_name, self.CHALLENGE_LOCK_PREFIX, blocking)
    
    def lock_queue(self, queue_name: str, blocking: bool = True) -> Optional[DistributedLock]:
        """
        Acquire a lock for a specific queue.
        
        Args:
            queue_name: Name of the queue to lock
            blocking: If True, wait until the lock is acquired or timeout
        
        Returns:
            The lock object if acquired, None otherwise
        """
        resource_name = f"{self.QUEUE_LOCK_PREFIX}:{queue_name}"
        return self._acquire_lock(resource_name, self.QUEUE_LOCK_PREFIX, blocking)
    
    def lock_resource(self, resource_name: str, blocking: bool = True) -> Optional[DistributedLock]:
        """
        Acquire a lock for a generic resource.
        
        Args:
            resource_name: Name of the resource to lock
            blocking: If True, wait until the lock is acquired or timeout
        
        Returns:
            The lock object if acquired, None otherwise
        """
        qualified_name = f"{self.RESOURCE_LOCK_PREFIX}:{resource_name}"
        return self._acquire_lock(qualified_name, self.RESOURCE_LOCK_PREFIX, blocking)
    
    def release(self, lock: DistributedLock) -> bool:
        """
        Release a distributed lock.
        
        Args:
            lock: The lock to release
        
        Returns:
            True if the lock was released, False otherwise
        """
        if lock.release():
            # Remove from active locks if it's tracked
            if lock.redis_key in self.active_locks:
                del self.active_locks[lock.redis_key]
            return True
        return False
    
    def _acquire_lock(self, resource_name: str, lock_type: str, blocking: bool) -> Optional[DistributedLock]:
        """
        Internal method to acquire a lock with the appropriate configuration.
        
        Args:
            resource_name: Name of the resource to lock
            lock_type: Type of lock (determines configuration)
            blocking: If True, wait until the lock is acquired or timeout
        
        Returns:
            The lock object if acquired, None otherwise
        """
        # Get config for this lock type
        config = self.lock_configs.get(lock_type, {})
        
        # Create the lock
        lock = DistributedLock(
            resource_name=resource_name,
            expire_seconds=config.get("expire_seconds", self.DEFAULT_EXPIRY),
            retry_interval_ms=config.get("retry_interval_ms", self.DEFAULT_RETRY_INTERVAL),
            retry_times=config.get("retry_times", 50),
            lock_prefix="dlock"  # Common prefix for all locks
        )
        
        # Try to acquire
        if lock.acquire(blocking=blocking):
            # Track the active lock
            self.active_locks[lock.redis_key] = lock
            return lock
        
        return None


# Singleton instance
_lock_manager = None

def get_lock_manager() -> LockManager:
    """Get the Lock Manager singleton instance."""
    global _lock_manager
    if _lock_manager is None:
        _lock_manager = LockManager()
    return _lock_manager 