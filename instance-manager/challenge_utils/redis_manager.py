"""
Redis Connection Manager

This module provides a robust Redis connection manager with:
- Connection pooling
- Automatic reconnection
- Health checks
- Fallback mechanisms
"""

import logging
import time
import threading
import os
from functools import wraps
from redis import Redis, ConnectionPool, ConnectionError, RedisError
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [REDIS] - %(levelname)s - %(message)s'
)

# Load environment variables
load_dotenv()

class RedisManager:
    """
    Redis connection manager with enhanced reliability features.
    
    This class provides a robust Redis client with:
    - Connection pooling
    - Automatic reconnection
    - Health checks
    - Fallback mechanisms
    - Connection status caching
    """
    
    def __init__(self, redis_url=None, max_connections=10, health_check_interval=30):
        """
        Initialize the Redis manager.
        
        Args:
            redis_url (str, optional): Redis connection URL
            max_connections (int): Maximum number of connections in the pool
            health_check_interval (int): Interval in seconds for health checks
        """
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://redis:6379/0")
        self.max_connections = max_connections
        self.health_check_interval = health_check_interval
        
        # Connection state
        self.pool = None
        self.client = None
        self.connected = False
        self.healthy = False
        self.last_error = None
        self.last_connection_attempt = 0
        self.connection_failures = 0
        
        # Connection status caching
        self.last_status_check = 0
        self.status_cache_ttl = float(os.getenv("REDIS_CACHE_TTL", "1.0"))  # Cache status for 1 second by default
        self.status_cache_lock = threading.RLock()
        
        # Thread for health checks
        self.health_check_thread = None
        self.should_stop = False
        
        # Try to connect immediately
        self._connect()
        
        # Start health check thread
        self._start_health_check()
        
    def _connect(self):
        """
        Establish connection to Redis.
        """
        try:
            # Only attempt reconnection if sufficient time has passed
            current_time = time.time()
            if current_time - self.last_connection_attempt < 5 and self.connection_failures > 0:
                return False
                
            self.last_connection_attempt = current_time
            
            # Create connection pool
            self.pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=self.max_connections,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                socket_keepalive=True,
                health_check_interval=30
            )
            
            # Create Redis client
            self.client = Redis(connection_pool=self.pool)
            
            # Test connection
            self.client.ping()
            
            # Update state
            self.connected = True
            self.healthy = True
            self.connection_failures = 0
            self.last_error = None
            
            # Update status cache timestamp
            with self.status_cache_lock:
                self.last_status_check = time.time()
            
            logging.info(f"Successfully connected to Redis at {self.redis_url}")
            return True
            
        except Exception as e:
            self.connection_failures += 1
            self.connected = False
            self.healthy = False
            self.last_error = str(e)
            
            # Update status cache timestamp
            with self.status_cache_lock:
                self.last_status_check = time.time()
            
            # Log error (less verbosely for repeated failures)
            if self.connection_failures <= 3 or self.connection_failures % 10 == 0:
                logging.warning(f"Failed to connect to Redis at {self.redis_url}: {e}")
                
            return False
            
    def _start_health_check(self):
        """
        Start a health check thread to monitor Redis connection.
        """
        def health_check_worker():
            logging.info("Starting Redis health check thread")
            
            while not self.should_stop:
                try:
                    # Perform health check
                    if self.client and self.connected:
                        self.client.ping()
                        if not self.healthy:
                            logging.info("Redis connection restored to healthy state")
                        self.healthy = True
                    elif not self.connected or not self.healthy:
                        # Try to reconnect
                        self._connect()
                        
                    # Update status cache timestamp after health check
                    with self.status_cache_lock:
                        self.last_status_check = time.time()
                        
                except Exception as e:
                    if self.healthy:
                        logging.warning(f"Redis health check failed: {e}")
                    self.healthy = False
                    self.last_error = str(e)
                    
                    # Update status cache timestamp after failed health check
                    with self.status_cache_lock:
                        self.last_status_check = time.time()
                    
                # Sleep until next check
                for _ in range(self.health_check_interval * 2):  # Check every half second if should stop
                    if self.should_stop:
                        break
                    time.sleep(0.5)
                    
            logging.info("Redis health check thread stopped")
            
        # Create and start thread
        self.health_check_thread = threading.Thread(target=health_check_worker, daemon=True)
        self.health_check_thread.start()
        
    def stop(self):
        """
        Stop the health check thread and clean up resources.
        """
        self.should_stop = True
        
        if self.health_check_thread and self.health_check_thread.is_alive():
            self.health_check_thread.join(timeout=5)
            
        if self.pool:
            self.pool.disconnect()
            
    @property
    def is_connected(self):
        """
        Check if Redis is connected, with caching for performance.
        
        Instead of checking actual connection on every call, cache the status
        for a short period to reduce overhead on frequent operations.
        """
        current_time = time.time()
        
        # Fast path: return cached status if recent enough
        with self.status_cache_lock:
            if current_time - self.last_status_check < self.status_cache_ttl:
                return self.connected and self.healthy
                
            # Update cache timestamp
            self.last_status_check = current_time
            
        # Regular status check - the actual connection status hasn't been verified recently
        return self.connected and self.healthy
        
    def execute(self, method_name, *args, **kwargs):
        """
        Execute a Redis command with automatic reconnection.
        
        Args:
            method_name (str): The Redis method to call
            *args, **kwargs: Arguments to pass to the method
            
        Returns:
            The result of the Redis command
            
        Raises:
            ConnectionError: If Redis is not available
        """
        # Ensure we're connected (using cached status check)
        if not self.is_connected:
            if not self._connect():
                raise ConnectionError(f"Not connected to Redis: {self.last_error}")
                
        try:
            # Get the method
            method = getattr(self.client, method_name)
            if not callable(method):
                raise AttributeError(f"Invalid Redis method: {method_name}")
                
            # Execute the method
            result = method(*args, **kwargs)
            return result
            
        except (ConnectionError, RedisError) as e:
            # Mark as disconnected
            self.connected = False
            self.healthy = False
            self.last_error = str(e)
            
            # Update status cache timestamp
            with self.status_cache_lock:
                self.last_status_check = time.time()
            
            # Try to reconnect and retry once
            if self._connect():
                # Try again with the new connection
                method = getattr(self.client, method_name)
                return method(*args, **kwargs)
            else:
                # Still can't connect
                raise ConnectionError(f"Failed to execute Redis command: {e}")
                
    def __getattr__(self, name):
        """
        Proxy Redis methods with enhanced error handling.
        
        This allows using this class as a drop-in replacement for the Redis client.
        """
        # Check if the attribute exists on the Redis client
        if self.client and hasattr(self.client, name):
            attr = getattr(self.client, name)
            
            # If it's a callable, wrap it with our error handling
            if callable(attr):
                @wraps(attr)
                def wrapped(*args, **kwargs):
                    return self.execute(name, *args, **kwargs)
                return wrapped
            else:
                # Non-callable attributes are returned as-is
                return attr
                
        # Default behavior for missing attributes
        raise AttributeError(f"'RedisManager' has no attribute '{name}'")
        
    def get_stats(self):
        """
        Get connection statistics.
        
        Returns:
            dict: Connection statistics
        """
        return {
            "connected": self.connected,
            "healthy": self.healthy,
            "last_error": self.last_error,
            "connection_failures": self.connection_failures,
            "last_connection_attempt": self.last_connection_attempt,
            "cache_info": {
                "last_status_check": self.last_status_check,
                "status_cache_ttl": self.status_cache_ttl,
                "time_since_check": time.time() - self.last_status_check
            }
        }

# Singleton instance
_redis_manager = None

def get_redis():
    """Get the Redis manager instance."""
    global _redis_manager
    if _redis_manager is None:
        # Configure from environment
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        max_connections = int(os.getenv("REDIS_MAX_CONNECTIONS", "10"))
        health_check_interval = int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "30"))
        
        _redis_manager = RedisManager(
            redis_url=redis_url,
            max_connections=max_connections,
            health_check_interval=health_check_interval
        )
    return _redis_manager 