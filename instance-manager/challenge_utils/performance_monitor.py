"""
Performance Monitoring System for Challenge Deployments

This module provides a comprehensive performance monitoring system for tracking
the time it takes from receiving a challenge deployment request to full deployment.
It tracks various phases of the deployment process and provides metrics for analysis.

Key features:
- Track overall deployment time from request to completion
- Break down timing by deployment phases (queuing, processing, k8s creation, etc.)
- Store historical metrics for trend analysis
- Expose API for retrieving performance data
- Low-overhead implementation to avoid impacting deployment performance
"""

import time
import logging
import json
import threading
from datetime import datetime, timedelta
import statistics
from .redis_manager import get_redis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [PERF] - %(levelname)s - %(message)s'
)

class DeploymentTracker:
    """
    Tracks the performance of a single deployment process.
    
    This class is used to measure the time spent in different phases of the
    deployment process for a specific challenge.
    """
    
    def __init__(self, task_id, user_id=None, challenge_type=None):
        """
        Initialize a new deployment tracker.
        
        Args:
            task_id (str): The unique identifier for this deployment task
            user_id (str, optional): The user ID initiating the deployment
            challenge_type (str, optional): Type of challenge being deployed
        """
        self.task_id = task_id
        self.user_id = user_id
        self.challenge_type = challenge_type
        self.start_time = time.time()
        self.end_time = None
        self.phases = {}
        self.current_phase = None
        self.current_phase_start = None
        self.metadata = {
            "created_at": datetime.now().isoformat(),
            "user_id": user_id,
            "challenge_type": challenge_type
        }
        
    def start_phase(self, phase_name):
        """
        Start timing a new phase of the deployment process.
        
        Args:
            phase_name (str): Name of the deployment phase to start timing
            
        Returns:
            float: The start timestamp
        """
        # If another phase is in progress, end it first
        if self.current_phase and self.current_phase_start:
            self.end_phase()
            
        self.current_phase = phase_name
        self.current_phase_start = time.time()
        return self.current_phase_start
        
    def end_phase(self):
        """
        End timing the current phase and record its duration.
        
        Returns:
            float: The duration of the phase in seconds
        """
        if not self.current_phase or self.current_phase_start is None:
            return 0
            
        end_time = time.time()
        duration = end_time - self.current_phase_start
        
        # Record the phase
        self.phases[self.current_phase] = {
            "start": self.current_phase_start,
            "end": end_time,
            "duration": duration
        }
        
        # Reset current phase
        self.current_phase = None
        self.current_phase_start = None
        
        return duration
        
    def add_tag(self, key, value):
        """
        Add a tag or metadata to this deployment tracker.
        
        Args:
            key (str): Tag name
            value: Tag value
        """
        self.metadata[key] = value
        
    def complete(self):
        """
        Mark the deployment as complete and calculate total time.
        
        Returns:
            dict: Summary of the deployment timing
        """
        # End any active phase
        if self.current_phase:
            self.end_phase()
            
        # Record end time
        self.end_time = time.time()
        
        # Calculate total duration
        total_duration = self.end_time - self.start_time
        
        # Prepare summary
        summary = {
            "task_id": self.task_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "total_duration": total_duration,
            "phases": self.phases,
            "metadata": self.metadata
        }
        
        return summary
        
    def to_dict(self):
        """
        Convert the tracker to a dictionary for storage.
        
        Returns:
            dict: Dictionary representation of the tracker
        """
        return {
            "task_id": self.task_id,
            "user_id": self.user_id,
            "challenge_type": self.challenge_type,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "phases": self.phases,
            "metadata": self.metadata
        }
        
class PerformanceMonitor:
    """
    System-wide performance monitoring for challenge deployments.
    
    This class manages tracking of all deployments and provides methods
    to retrieve and analyze performance metrics.
    """
    
    # Phase names for standardization
    PHASE_QUEUE = "queue_wait"
    PHASE_VALIDATION = "validation"
    PHASE_PREPARE = "preparation"
    PHASE_K8S_RESOURCES = "k8s_resources_creation"
    PHASE_WAIT_RUNNING = "wait_for_running"
    PHASE_CONFIG = "configuration"
    PHASE_NETWORK = "network_setup"
    
    def __init__(self, redis_key_prefix="perf_monitor"):
        """
        Initialize the performance monitoring system.
        
        Args:
            redis_key_prefix (str): Prefix for Redis keys used by this monitor
        """
        self.redis = get_redis()
        self.redis_key_prefix = redis_key_prefix
        self.trackers = {}  # In-memory cache of active trackers
        self.lock = threading.RLock()
        
        # Redis keys
        self.trackers_key = f"{redis_key_prefix}:trackers"  # Hash mapping task_id to tracker data
        self.recent_key = f"{redis_key_prefix}:recent"      # Sorted set of recent task_ids by time
        self.metrics_key = f"{redis_key_prefix}:metrics"    # Hash of aggregated metrics
        
        logging.info("Performance monitoring system initialized")
        
    def start_tracking(self, task_id, user_id=None, challenge_type=None):
        """
        Start tracking a new deployment.
        
        Args:
            task_id (str): The unique identifier for this deployment task
            user_id (str, optional): The user ID initiating the deployment
            challenge_type (str, optional): Type of challenge being deployed
            
        Returns:
            DeploymentTracker: The tracker object for this deployment
        """
        with self.lock:
            # Create new tracker
            tracker = DeploymentTracker(task_id, user_id, challenge_type)
            
            # Store in memory
            self.trackers[task_id] = tracker
            
            # Start initial phase (queue wait)
            tracker.start_phase(self.PHASE_QUEUE)
            
            logging.debug(f"Started tracking deployment task {task_id}")
            return tracker
            
    def get_tracker(self, task_id):
        """
        Get the tracker for a specific task.
        
        Args:
            task_id (str): The task ID to retrieve
            
        Returns:
            DeploymentTracker: The tracker object, or None if not found
        """
        with self.lock:
            # Check in-memory cache first
            if task_id in self.trackers:
                return self.trackers[task_id]
                
            # Try to load from Redis
            try:
                tracker_json = self.redis.hget(self.trackers_key, task_id)
                if tracker_json:
                    tracker_data = json.loads(tracker_json)
                    
                    # Create and reconstruct tracker
                    tracker = DeploymentTracker(
                        task_id, 
                        tracker_data.get("user_id"),
                        tracker_data.get("challenge_type")
                    )
                    tracker.start_time = tracker_data.get("start_time", tracker.start_time)
                    tracker.end_time = tracker_data.get("end_time")
                    tracker.phases = tracker_data.get("phases", {})
                    tracker.metadata = tracker_data.get("metadata", {})
                    
                    return tracker
            except Exception as e:
                logging.error(f"Error loading tracker for task {task_id}: {e}")
                
            return None
            
    def start_phase(self, task_id, phase_name):
        """
        Start a new phase for the specified deployment task.
        
        Args:
            task_id (str): The task ID
            phase_name (str): Name of the phase to start
            
        Returns:
            bool: True if successful, False otherwise
        """
        tracker = self.get_tracker(task_id)
        if not tracker:
            logging.warning(f"Cannot start phase {phase_name}: No tracker for task {task_id}")
            return False
            
        tracker.start_phase(phase_name)
        return True
        
    def end_phase(self, task_id):
        """
        End the current phase for the specified deployment task.
        
        Args:
            task_id (str): The task ID
            
        Returns:
            float: The duration of the phase, or 0 if no active phase
        """
        tracker = self.get_tracker(task_id)
        if not tracker:
            logging.warning(f"Cannot end phase: No tracker for task {task_id}")
            return 0
            
        return tracker.end_phase()
        
    def add_tag(self, task_id, key, value):
        """
        Add a tag or metadata to a deployment tracker.
        
        Args:
            task_id (str): The task ID
            key (str): Tag name
            value: Tag value
            
        Returns:
            bool: True if successful, False otherwise
        """
        tracker = self.get_tracker(task_id)
        if not tracker:
            logging.warning(f"Cannot add tag {key}: No tracker for task {task_id}")
            return False
            
        tracker.add_tag(key, value)
        return True
        
    def complete_tracking(self, task_id, success=True):
        """
        Mark a deployment as complete and store its metrics.
        
        Args:
            task_id (str): The task ID
            success (bool): Whether the deployment was successful
            
        Returns:
            dict: Summary of the deployment timing, or None if tracker not found
        """
        with self.lock:
            tracker = self.get_tracker(task_id)
            if not tracker:
                logging.warning(f"Cannot complete tracking: No tracker for task {task_id}")
                return None
                
            # Add success tag
            tracker.add_tag("success", success)
            
            # Complete the tracker
            summary = tracker.complete()
            
            # Store in Redis
            try:
                # Store the tracker data
                self.redis.hset(
                    self.trackers_key,
                    task_id,
                    json.dumps(tracker.to_dict())
                )
                
                # Add to recent trackers with score = timestamp
                self.redis.zadd(
                    self.recent_key,
                    {task_id: tracker.end_time}
                )
                
                # Limit the number of stored trackers (keep last 1000)
                self.redis.zremrangebyrank(self.recent_key, 0, -1001)
                
                # Update metrics
                self._update_metrics(tracker, success)
                
            except Exception as e:
                logging.error(f"Error storing tracker for task {task_id}: {e}")
                
            # Remove from in-memory cache
            if task_id in self.trackers:
                del self.trackers[task_id]
                
            return summary
            
    def _update_metrics(self, tracker, success):
        """
        Update aggregate metrics with data from a completed tracker.
        
        Args:
            tracker (DeploymentTracker): The completed tracker
            success (bool): Whether the deployment was successful
        """
        try:
            # Get the challenge type for categorization
            challenge_type = tracker.challenge_type or "unknown"
            
            # Calculate total duration
            if tracker.start_time and tracker.end_time:
                total_duration = tracker.end_time - tracker.start_time
            else:
                return
                
            # Increment total count
            self.redis.hincrby(self.metrics_key, "total_deployments", 1)
            
            # Increment success/failure counts
            if success:
                self.redis.hincrby(self.metrics_key, "successful_deployments", 1)
            else:
                self.redis.hincrby(self.metrics_key, "failed_deployments", 1)
                
            # Update by challenge type
            self.redis.hincrby(self.metrics_key, f"type:{challenge_type}:count", 1)
            
            # Update durations using sorted sets for statistical analysis
            self.redis.zadd(f"{self.redis_key_prefix}:durations", {tracker.task_id: total_duration})
            self.redis.zadd(f"{self.redis_key_prefix}:durations:{challenge_type}", {tracker.task_id: total_duration})
            
            # Limit the number of duration samples (keep last 1000)
            self.redis.zremrangebyrank(f"{self.redis_key_prefix}:durations", 0, -1001)
            self.redis.zremrangebyrank(f"{self.redis_key_prefix}:durations:{challenge_type}", 0, -1001)
            
            # Update phase durations
            for phase_name, phase_data in tracker.phases.items():
                if "duration" in phase_data:
                    # Add to phase durations set
                    self.redis.zadd(
                        f"{self.redis_key_prefix}:phase:{phase_name}",
                        {tracker.task_id: phase_data["duration"]}
                    )
                    
                    # Limit the number of samples
                    self.redis.zremrangebyrank(f"{self.redis_key_prefix}:phase:{phase_name}", 0, -1001)
                    
        except Exception as e:
            logging.error(f"Error updating metrics: {e}")
            
    def get_metrics(self):
        """
        Get comprehensive performance metrics.
        
        Returns:
            dict: Performance metrics
        """
        try:
            # Get basic counts
            metrics = {}
            raw_metrics = self.redis.hgetall(self.metrics_key)
            
            for key, value in raw_metrics.items():
                if isinstance(key, bytes):
                    key = key.decode('utf-8')
                if isinstance(value, bytes):
                    value = value.decode('utf-8')
                metrics[key] = int(value)
                
            # Calculate success rate
            total = metrics.get("total_deployments", 0)
            successful = metrics.get("successful_deployments", 0)
            
            if total > 0:
                metrics["success_rate"] = (successful / total) * 100
            else:
                metrics["success_rate"] = 0
                
            # Get overall statistics
            metrics["duration_stats"] = self._get_duration_stats(f"{self.redis_key_prefix}:durations")
            
            # Get statistics by challenge type
            metrics["challenge_types"] = {}
            
            for key in raw_metrics:
                if isinstance(key, bytes):
                    key = key.decode('utf-8')
                    
                if key.startswith("type:") and key.endswith(":count"):
                    type_name = key.split(":")[1]
                    metrics["challenge_types"][type_name] = {
                        "count": int(raw_metrics[key].decode('utf-8') if isinstance(raw_metrics[key], bytes) else raw_metrics[key]),
                        "duration_stats": self._get_duration_stats(f"{self.redis_key_prefix}:durations:{type_name}")
                    }
                    
            # Get phase statistics
            metrics["phases"] = {}
            
            phase_keys = [key for key in self.redis.keys(f"{self.redis_key_prefix}:phase:*")]
            for key in phase_keys:
                phase_name = key.decode('utf-8').split(":")[-1] if isinstance(key, bytes) else key.split(":")[-1]
                metrics["phases"][phase_name] = self._get_duration_stats(key)
                
            return metrics
            
        except Exception as e:
            logging.error(f"Error getting metrics: {e}")
            return {"error": str(e)}
            
    def _get_duration_stats(self, key):
        """
        Calculate statistics for durations in a sorted set.
        
        Args:
            key (str): Redis key for the sorted set containing durations
            
        Returns:
            dict: Statistical metrics
        """
        try:
            # Get all durations
            durations = self.redis.zrange(key, 0, -1, withscores=True)
            
            if not durations:
                return {
                    "count": 0,
                    "min": 0,
                    "max": 0,
                    "avg": 0,
                    "median": 0,
                    "p95": 0,
                    "p99": 0
                }
                
            # Extract just the scores (durations)
            duration_values = [float(d[1]) for d in durations]
            
            # Calculate statistics
            stats = {
                "count": len(duration_values),
                "min": min(duration_values),
                "max": max(duration_values),
                "avg": statistics.mean(duration_values),
                "median": statistics.median(duration_values)
            }
            
            # Calculate percentiles
            duration_values.sort()
            stats["p95"] = duration_values[int(len(duration_values) * 0.95)]
            stats["p99"] = duration_values[int(len(duration_values) * 0.99)]
            
            return stats
            
        except Exception as e:
            logging.error(f"Error calculating duration stats for {key}: {e}")
            return {"error": str(e)}
            
    def get_recent_deployments(self, limit=20):
        """
        Get details of recent deployments.
        
        Args:
            limit (int): Maximum number of deployments to return
            
        Returns:
            list: List of recent deployment details
        """
        try:
            # Get recent task IDs from sorted set
            recent_task_ids = self.redis.zrevrange(self.recent_key, 0, limit - 1)
            
            if not recent_task_ids:
                return []
                
            # Get tracker data for each task
            recent_deployments = []
            
            for task_id in recent_task_ids:
                task_id = task_id.decode('utf-8') if isinstance(task_id, bytes) else task_id
                tracker_json = self.redis.hget(self.trackers_key, task_id)
                
                if tracker_json:
                    tracker_data = json.loads(tracker_json.decode('utf-8') if isinstance(tracker_json, bytes) else tracker_json)
                    
                    # Add summary details
                    deployment = {
                        "task_id": task_id,
                        "user_id": tracker_data.get("user_id"),
                        "challenge_type": tracker_data.get("challenge_type"),
                        "start_time": tracker_data.get("start_time"),
                        "end_time": tracker_data.get("end_time"),
                        "total_duration": tracker_data.get("end_time", 0) - tracker_data.get("start_time", 0),
                        "success": tracker_data.get("metadata", {}).get("success", False),
                        "phases": {}
                    }
                    
                    # Extract phase durations
                    for phase_name, phase_data in tracker_data.get("phases", {}).items():
                        deployment["phases"][phase_name] = phase_data.get("duration", 0)
                        
                    recent_deployments.append(deployment)
                    
            return recent_deployments
            
        except Exception as e:
            logging.error(f"Error getting recent deployments: {e}")
            return {"error": str(e)}

    def clear_old_data(self, days=30):
        """
        Clear performance data older than the specified number of days.
        
        Args:
            days (int): Number of days to keep
            
        Returns:
            int: Number of records cleared
        """
        try:
            # Calculate cutoff timestamp
            cutoff_time = time.time() - (days * 24 * 60 * 60)
            
            # Remove old entries from recent sorted set
            removed = self.redis.zremrangebyscore(self.recent_key, 0, cutoff_time)
            
            # Get remaining task IDs
            remaining_task_ids = self.redis.zrange(self.recent_key, 0, -1)
            
            # Convert to set for faster lookups
            remaining_ids_set = set(task_id.decode('utf-8') if isinstance(task_id, bytes) else task_id 
                                   for task_id in remaining_task_ids)
            
            # Get all tracker IDs
            all_tracker_ids = self.redis.hkeys(self.trackers_key)
            
            # Find trackers to remove
            to_remove = []
            for tracker_id in all_tracker_ids:
                tracker_id = tracker_id.decode('utf-8') if isinstance(tracker_id, bytes) else tracker_id
                if tracker_id not in remaining_ids_set:
                    to_remove.append(tracker_id)
                    
            # Remove trackers in batches
            if to_remove:
                # Use pipeline for efficiency
                pipe = self.redis.pipeline()
                for i in range(0, len(to_remove), 100):
                    batch = to_remove[i:i+100]
                    pipe.hdel(self.trackers_key, *batch)
                pipe.execute()
                
            return len(to_remove) + removed
            
        except Exception as e:
            logging.error(f"Error clearing old data: {e}")
            return 0

# Singleton instance
_performance_monitor = None

def get_performance_monitor():
    """Get the performance monitor instance."""
    global _performance_monitor
    if _performance_monitor is None:
        _performance_monitor = PerformanceMonitor()
    return _performance_monitor 