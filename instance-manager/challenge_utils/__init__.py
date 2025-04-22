"""
Challenge Utilities Package

This package provides utilities for challenge deployment, queue management,
and distributed coordination.
"""

# Import the utility modules for easier access
from .redis_manager import get_redis
from .queue_manager import get_queue, ChallengeQueue
from .queue_workers import init_worker, init_all_workers

# Import distributed locking mechanisms
from .distributed_lock import DistributedLock, acquire_lock, with_lock
from .lock_manager import get_lock_manager
from .critical_sections import with_challenge_lock, with_queue_lock, with_resource_lock, CriticalSectionManager

# Import worker coordination components
from .worker_registry import get_worker_registry, Worker, WorkerStatus
from .heartbeat_manager import get_heartbeat_manager
from .worker_state import get_worker_state_manager, StateTransitionError
