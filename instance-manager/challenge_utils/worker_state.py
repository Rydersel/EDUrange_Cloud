"""
Worker State Management

This module provides functionality for managing worker state transitions,
task assignments, and state coordination between multiple workers.
"""

import os
import logging
import threading
import time
import json
from enum import Enum
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime

from .worker_registry import get_worker_registry, Worker, WorkerStatus
from .redis_manager import get_redis
from .distributed_lock import acquire_lock, DistributedLock


class StateTransitionError(Exception):
    """Exception raised when a worker state transition is invalid."""
    pass


class WorkerState:
    """Class for managing worker state."""
    
    # Redis key prefixes
    STATE_HISTORY_KEY_PREFIX = "worker:state_history:"
    STATE_TRANSITION_KEY_PREFIX = "worker:state_transition:"
    STATE_LOCK_PREFIX = "worker:state_lock:"
    WORKER_STATE_PREFIX = "worker:state:"
    
    # Maximum number of state history entries to keep
    MAX_STATE_HISTORY = 50
    
    def __init__(self):
        """Initialize worker state manager."""
        self.redis = get_redis()
        self.registry = get_worker_registry()
        self.state_lock = threading.RLock()
        
        # Allowed state transitions
        self.allowed_transitions = {
            WorkerStatus.IDLE: [WorkerStatus.ACTIVE, WorkerStatus.PAUSED, WorkerStatus.STOPPED, WorkerStatus.FAILED, WorkerStatus.DEPLOYMENT, WorkerStatus.TERMINATION],
            WorkerStatus.ACTIVE: [WorkerStatus.IDLE, WorkerStatus.PAUSED, WorkerStatus.STOPPED, WorkerStatus.FAILED],
            WorkerStatus.PAUSED: [WorkerStatus.IDLE, WorkerStatus.ACTIVE, WorkerStatus.STOPPED, WorkerStatus.FAILED],
            WorkerStatus.STOPPED: [WorkerStatus.FAILED],
            WorkerStatus.FAILED: [],  # Terminal state, no transitions allowed
            WorkerStatus.DEPLOYMENT: [WorkerStatus.IDLE, WorkerStatus.ACTIVE, WorkerStatus.FAILED, WorkerStatus.STOPPED],
            WorkerStatus.TERMINATION: [WorkerStatus.IDLE, WorkerStatus.ACTIVE, WorkerStatus.FAILED, WorkerStatus.STOPPED]
        }
        
        # State transition handlers
        self.transition_handlers = {}
        
        logging.info("Worker state manager initialized")
    
    def register_transition_handler(self, from_state: WorkerStatus, to_state: WorkerStatus, 
                                     handler: Callable[[Worker], None]):
        """
        Register a handler for a state transition.
        
        Args:
            from_state: The starting state
            to_state: The target state
            handler: Function to call when this transition occurs
        """
        key = (from_state, to_state)
        self.transition_handlers[key] = handler
        logging.debug(f"Registered transition handler for {from_state.value} -> {to_state.value}")
    
    def get_worker_state(self, worker_id: str) -> Optional[WorkerStatus]:
        """
        Get the current state of a worker.
        
        Args:
            worker_id: ID of the worker
            
        Returns:
            Current worker status or None if worker not found
        """
        worker = self.registry.get_worker(worker_id)
        if not worker:
            return None
        return worker.status
    
    def transition_state(self, worker_id: str, new_state: WorkerStatus, 
                         metadata: Dict[str, Any] = None) -> bool:
        """
        Transition a worker to a new state.
        
        Args:
            worker_id: ID of the worker
            new_state: The new state to transition to
            metadata: Optional metadata about the transition
            
        Returns:
            True if transition was successful, False otherwise
            
        Raises:
            StateTransitionError: If the state transition is not allowed
        """
        # Get a lock for this worker's state
        lock_key = f"{self.STATE_LOCK_PREFIX}{worker_id}"
        lock = acquire_lock(lock_key, expire_seconds=30, timeout_seconds=10)
        
        if not lock:
            logging.error(f"Failed to acquire lock for worker state transition: {worker_id}")
            return False
        
        try:
            # Get the worker
            worker = self.registry.get_worker(worker_id)
            if not worker:
                logging.warning(f"Worker not found for state transition: {worker_id}")
                return False
            
            current_state = worker.status
            
            # Check if transition is allowed
            if new_state not in self.allowed_transitions.get(current_state, []):
                error_msg = f"Invalid state transition: {current_state.value} -> {new_state.value}"
                logging.error(error_msg)
                raise StateTransitionError(error_msg)
            
            # Prepare transition metadata
            transition_data = {
                "worker_id": worker_id,
                "from_state": current_state.value,
                "to_state": new_state.value,
                "timestamp": datetime.now().isoformat(),
                "metadata": metadata or {}
            }
            
            # Record transition in Redis
            transition_key = f"{self.STATE_TRANSITION_KEY_PREFIX}{worker_id}:{int(time.time())}"
            self.redis.client.set(transition_key, json.dumps(transition_data), ex=86400)  # 24 hour TTL
            
            # Add to state history
            history_key = f"{self.STATE_HISTORY_KEY_PREFIX}{worker_id}"
            self.redis.client.lpush(history_key, json.dumps(transition_data))
            self.redis.client.ltrim(history_key, 0, self.MAX_STATE_HISTORY - 1)  # Keep only recent history
            self.redis.client.expire(history_key, 86400)  # 24 hour TTL
            
            # Update worker status
            prev_state = worker.status
            worker.status = new_state
            success = self.registry.update_worker(worker)
            
            if success:
                # Call any registered transition handlers
                handler_key = (prev_state, new_state)
                if handler_key in self.transition_handlers:
                    try:
                        self.transition_handlers[handler_key](worker)
                    except Exception as e:
                        logging.error(f"Error in transition handler for {prev_state.value} -> {new_state.value}: {e}")
                
                logging.info(f"Worker {worker_id} transitioned from {prev_state.value} to {new_state.value}")
            
            return success
            
        finally:
            # Release the lock
            lock.release()
    
    def pause_worker(self, worker_id: str, reason: str = None) -> bool:
        """
        Pause a worker.
        
        Args:
            worker_id: ID of the worker to pause
            reason: Optional reason for pausing
            
        Returns:
            True if worker was paused, False otherwise
        """
        metadata = {"reason": reason} if reason else {}
        try:
            return self.transition_state(worker_id, WorkerStatus.PAUSED, metadata)
        except StateTransitionError:
            # If direct transition not allowed, try to go through IDLE first
            current_state = self.get_worker_state(worker_id)
            if current_state == WorkerStatus.ACTIVE:
                success = self.transition_state(worker_id, WorkerStatus.IDLE, {"reason": "transitioning to paused"})
                if success:
                    return self.transition_state(worker_id, WorkerStatus.PAUSED, metadata)
            return False
    
    def resume_worker(self, worker_id: str) -> bool:
        """
        Resume a paused worker.
        
        Args:
            worker_id: ID of the worker to resume
            
        Returns:
            True if worker was resumed, False otherwise
        """
        current_state = self.get_worker_state(worker_id)
        if current_state == WorkerStatus.PAUSED:
            return self.transition_state(worker_id, WorkerStatus.IDLE, {"reason": "resumed"})
        return False
    
    def stop_worker(self, worker_id: str, reason: str = None) -> bool:
        """
        Signal a worker to stop.
        
        Args:
            worker_id: ID of the worker to stop
            reason: Optional reason for stopping
            
        Returns:
            True if worker was signaled to stop, False otherwise
        """
        metadata = {"reason": reason} if reason else {}
        try:
            return self.transition_state(worker_id, WorkerStatus.STOPPED, metadata)
        except StateTransitionError as e:
            logging.error(f"Error stopping worker {worker_id}: {e}")
            return False
    
    def mark_worker_failed(self, worker_id: str, error: str = None) -> bool:
        """
        Mark a worker as failed.
        
        Args:
            worker_id: ID of the worker to mark as failed
            error: Optional error message
            
        Returns:
            True if worker was marked as failed, False otherwise
        """
        metadata = {"error": error} if error else {}
        try:
            return self.transition_state(worker_id, WorkerStatus.FAILED, metadata)
        except StateTransitionError as e:
            logging.error(f"Error marking worker {worker_id} as failed: {e}")
            return False
    
    def get_state_history(self, worker_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get the state transition history for a worker.
        
        Args:
            worker_id: ID of the worker
            limit: Maximum number of history entries to retrieve
            
        Returns:
            List of state transition records
        """
        history_key = f"{self.STATE_HISTORY_KEY_PREFIX}{worker_id}"
        history_data = self.redis.client.lrange(history_key, 0, limit - 1)
        
        history = []
        for item in history_data:
            try:
                if isinstance(item, bytes):
                    item = item.decode('utf-8')
                history.append(json.loads(item))
            except Exception as e:
                logging.error(f"Error parsing state history item: {e}")
        
        return history
    
    def update_worker_state(self, worker_id: str, state_data: Dict[str, Any]) -> bool:
        """
        Update worker state without requiring a full state transition.
        
        Args:
            worker_id: ID of the worker
            state_data: Dictionary containing state data to update
            
        Returns:
            True if successful, False otherwise
        """
        # Get a lock for this worker's state
        lock_key = f"{self.STATE_LOCK_PREFIX}{worker_id}"
        lock = acquire_lock(lock_key, expire_seconds=30, timeout_seconds=10)
        
        if not lock:
            logging.error(f"Failed to acquire lock for worker state update: {worker_id}")
            return False
        
        try:
            # Store state data in Redis
            state_key = f"{self.WORKER_STATE_PREFIX}{worker_id}"
            
            # Get existing state data
            existing_data_bytes = self.redis.client.get(state_key)
            existing_data = {}
            
            if existing_data_bytes:
                try:
                    if isinstance(existing_data_bytes, bytes):
                        existing_data_bytes = existing_data_bytes.decode('utf-8')
                    existing_data = json.loads(existing_data_bytes)
                except Exception as e:
                    logging.error(f"Error parsing existing state data for worker {worker_id}: {e}")
            
            # Update with new data
            existing_data.update(state_data)
            
            # Add timestamp
            existing_data["last_updated"] = datetime.now().isoformat()
            
            # Store updated data
            self.redis.client.set(state_key, json.dumps(existing_data), ex=86400)  # 24 hour TTL
            
            # If status is included in the update, update worker status
            if "status" in state_data and state_data["status"]:
                try:
                    worker = self.registry.get_worker(worker_id)
                    if worker:
                        # Map string status to enum
                        status_str = state_data["status"]
                        for status in WorkerStatus:
                            if status.value == status_str:
                                self.registry.update_worker_status(worker_id, status)
                                break
                except Exception as e:
                    logging.error(f"Error updating worker status during state update: {e}")
            
            return True
            
        except Exception as e:
            logging.error(f"Error updating worker state for {worker_id}: {e}")
            return False
        finally:
            # Release the lock
            lock.release()
    
    def get_worker_state_data(self, worker_id: str) -> Dict[str, Any]:
        """
        Get the full state data for a worker.
        
        Args:
            worker_id: ID of the worker
            
        Returns:
            Dictionary with worker state data
        """
        state_key = f"{self.WORKER_STATE_PREFIX}{worker_id}"
        state_data_bytes = self.redis.client.get(state_key)
        
        if not state_data_bytes:
            return {}
            
        try:
            if isinstance(state_data_bytes, bytes):
                state_data_bytes = state_data_bytes.decode('utf-8')
            return json.loads(state_data_bytes)
        except Exception as e:
            logging.error(f"Error parsing state data for worker {worker_id}: {e}")
            return {}


# Singleton state manager instance
_worker_state_manager = None

def get_worker_state_manager():
    """Get the worker state manager singleton instance."""
    global _worker_state_manager
    if _worker_state_manager is None:
        _worker_state_manager = WorkerState()
    return _worker_state_manager 