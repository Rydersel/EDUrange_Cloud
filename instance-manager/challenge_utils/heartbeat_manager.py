"""
Heartbeat Manager for Worker Health Monitoring

This module provides functionality for implementing and monitoring
worker heartbeats to ensure system health and handle worker failures.
"""

import os
import logging
import threading
import time
import traceback
from typing import Dict, Any, Optional, List, Callable
import json

from .worker_registry import get_worker_registry, WorkerStatus
from .redis_manager import get_redis

class HeartbeatManager:
    """
    Manager for worker heartbeats.
    
    Provides functionality for:
    - Sending periodic heartbeats from workers
    - Monitoring worker health
    - Detecting and handling worker failures
    """
    
    # Redis key prefixes
    HEARTBEAT_KEY_PREFIX = "worker:heartbeat:"
    
    # Default settings
    DEFAULT_HEARTBEAT_INTERVAL = 15  # seconds
    DEFAULT_CHECK_INTERVAL = 60      # seconds
    DEFAULT_HEARTBEAT_TIMEOUT = 60   # seconds
    
    def __init__(self):
        """Initialize the heartbeat manager."""
        self.redis = get_redis()
        self.registry = get_worker_registry()
        
        # Load configuration from environment
        self.heartbeat_interval = int(os.getenv("WORKER_HEARTBEAT_INTERVAL", 
                                                str(self.DEFAULT_HEARTBEAT_INTERVAL)))
        self.check_interval = int(os.getenv("WORKER_CHECK_INTERVAL", 
                                            str(self.DEFAULT_CHECK_INTERVAL)))
        self.heartbeat_timeout = int(os.getenv("WORKER_HEARTBEAT_TIMEOUT", 
                                                str(self.DEFAULT_HEARTBEAT_TIMEOUT)))
        
        # Thread for checking heartbeats
        self.checker_thread = None
        self.should_stop_checker = False
        
        # Callback for handling stale workers
        self.stale_worker_handler = None
        
        logging.info(f"Heartbeat manager initialized with interval: {self.heartbeat_interval}s, "
                      f"check interval: {self.check_interval}s, timeout: {self.heartbeat_timeout}s")
    
    def send_heartbeat(self, worker_id: str, task_id: str = None, stats: Dict[str, Any] = None):
        """
        Send a heartbeat for a worker.
        
        Args:
            worker_id: ID of the worker sending heartbeat
            task_id: Current task ID if processing a task
            stats: Optional worker statistics
        """
        try:
            # Update heartbeat timestamp
            heartbeat_key = f"{self.HEARTBEAT_KEY_PREFIX}{worker_id}"
            heartbeat_data = {
                "timestamp": time.time(),
                "task_id": task_id,
                "stats": stats or {}
            }
            
            # Store heartbeat data in Redis with TTL
            self.redis.client.set(
                heartbeat_key, 
                json.dumps(heartbeat_data),
                ex=self.heartbeat_timeout * 2  # TTL twice the timeout
            )
            
            # Update worker heartbeat in registry
            self.registry.update_worker_heartbeat(worker_id, task_id, stats)
        except Exception as e:
            logging.error(f"Error sending heartbeat for worker {worker_id}: {e}")
    
    def start_health_checker(self, stale_handler: Callable[[List[str]], None] = None):
        """
        Start the background thread that checks for stale workers.
        
        Args:
            stale_handler: Optional callback function that is called with a list of stale worker IDs
        """
        if self.checker_thread and self.checker_thread.is_alive():
            logging.warning("Health checker thread already running")
            return False
        
        self.should_stop_checker = False
        self.stale_worker_handler = stale_handler
        
        def checker_loop():
            """Background thread that checks for stale workers."""
            try:
                logging.info("Started health checker thread")
                
                while not self.should_stop_checker:
                    try:
                        # Detect stale workers
                        stale_workers = self.registry.detect_stale_workers()
                        
                        if stale_workers:
                            stale_worker_ids = [w.worker_id for w in stale_workers]
                            logging.warning(f"Detected {len(stale_workers)} stale workers: {stale_worker_ids}")
                            
                            # Call stale worker handler if provided
                            if self.stale_worker_handler:
                                try:
                                    self.stale_worker_handler(stale_worker_ids)
                                except Exception as e:
                                    logging.error(f"Error in stale worker handler: {e}")
                            
                            # Clean up stale workers
                            cleaned = self.registry.cleanup_stale_workers()
                            logging.info(f"Cleaned up {cleaned} stale workers")
                        
                        # Sleep until next check
                        for _ in range(self.check_interval * 2):  # Check twice per second
                            if self.should_stop_checker:
                                break
                            time.sleep(0.5)
                            
                    except Exception as e:
                        logging.error(f"Error in health checker loop: {e}")
                        logging.error(traceback.format_exc())
                        time.sleep(5)  # Wait a bit longer on error
            finally:
                logging.info("Health checker thread stopped")
        
        # Start checker thread
        self.checker_thread = threading.Thread(
            target=checker_loop, 
            name="health-checker",
            daemon=True
        )
        self.checker_thread.start()
        
        return True
    
    def stop_health_checker(self):
        """Stop the health checker thread."""
        if not self.checker_thread or not self.checker_thread.is_alive():
            logging.warning("No active health checker thread to stop")
            return False
        
        self.should_stop_checker = True
        
        # Wait for thread to finish
        self.checker_thread.join(timeout=5)
        
        if self.checker_thread.is_alive():
            logging.warning("Health checker thread did not stop in time")
            return False
        
        return True
    
    def get_worker_health(self, worker_id: str) -> Dict[str, Any]:
        """
        Get health information for a worker.
        
        Args:
            worker_id: ID of the worker to check
            
        Returns:
            Dictionary with health information
        """
        worker = self.registry.get_worker(worker_id)
        if not worker:
            return {"status": "not_found", "error": f"Worker {worker_id} not found"}
        
        health_info = {
            "status": worker.status.value,
            "last_heartbeat": worker.last_heartbeat,
            "uptime": None,
            "cpu_usage": worker.cpu_usage,
            "memory_usage": worker.memory_usage,
            "tasks_processed": worker.tasks_processed,
            "tasks_failed": worker.tasks_failed,
            "current_task": worker.current_task_id
        }
        
        # Calculate uptime if possible
        if worker.start_time:
            try:
                from datetime import datetime
                start_time = datetime.fromisoformat(worker.start_time)
                now = datetime.now()
                uptime_seconds = int((now - start_time).total_seconds())
                health_info["uptime"] = uptime_seconds
            except Exception as e:
                logging.error(f"Error calculating uptime for worker {worker_id}: {e}")
        
        # Check if worker is stale
        if worker.last_heartbeat:
            try:
                from datetime import datetime
                last_heartbeat = datetime.fromisoformat(worker.last_heartbeat)
                now = datetime.now()
                seconds_since_heartbeat = int((now - last_heartbeat).total_seconds())
                health_info["seconds_since_heartbeat"] = seconds_since_heartbeat
                
                if seconds_since_heartbeat > self.heartbeat_timeout:
                    health_info["stale"] = True
                else:
                    health_info["stale"] = False
            except Exception as e:
                logging.error(f"Error checking staleness for worker {worker_id}: {e}")
                health_info["stale"] = "unknown"
        else:
            health_info["stale"] = "unknown"
        
        return health_info


# Singleton heartbeat manager instance
_heartbeat_manager = None

def get_heartbeat_manager() -> HeartbeatManager:
    """Get the heartbeat manager singleton instance."""
    global _heartbeat_manager
    if _heartbeat_manager is None:
        _heartbeat_manager = HeartbeatManager()
    return _heartbeat_manager 