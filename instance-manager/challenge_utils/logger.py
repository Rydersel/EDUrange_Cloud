import logging
import os
import threading
import time
from typing import Dict, Tuple, Set, Optional

class RateLimitedLogger:
    """
    A logger wrapper that implements rate limiting for repetitive logs.
    This helps reduce log spam for frequently repeating operations.

    Key features:
    - Environment-aware logging levels (more verbose in dev, less in prod)
    - Rate limiting for repeated log messages
    - State tracking to only log changes in monitored resources
    """

    def __init__(self, name: str = 'instance-manager'):
        """Initialize the rate-limited logger with config based on environment."""
        self.name = name
        self.logger = logging.getLogger(name)
        
        # Default to INFO level, but use DEBUG in development
        default_level = logging.DEBUG if os.getenv('FLASK_ENV') == 'development' else logging.INFO
        level_name = os.getenv('LOG_LEVEL', 'INFO').upper()
        level = getattr(logging, level_name, default_level)
        
        # Configure the logger if it hasn't been configured already
        if not self.logger.handlers:
            self.logger.setLevel(level)
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
        
        # Message rate limiting
        self._message_timestamps: Dict[str, float] = {}
        self._rate_limit_lock = threading.Lock()
        
        # State tracking
        self._pod_statuses: Dict[str, str] = {}
        self._pod_statuses_lock = threading.Lock()
        
        # Secret tracking to avoid repetitive logs
        self._secret_access_timestamps: Dict[str, float] = {}
        self._secret_lock = threading.Lock()
        
        # Store static configuration messages to avoid repetition
        self._static_messages: Set[str] = set()
        self._static_lock = threading.Lock()
        
        # Environment
        self.is_production = os.getenv('FLASK_ENV') != 'development'
        
        # Log once on startup
        self.logger.info(f"Logger initialized with level {level_name} ({level})")
        if self.is_production:
            self.logger.info("Running in PRODUCTION mode - verbose logs reduced")
        else:
            self.logger.info("Running in DEVELOPMENT mode - verbose logs enabled")

    def _should_log_message(self, msg: str, rate_limit_seconds: Optional[float] = None) -> bool:
        """
        Determine if a message should be logged based on rate limiting.
        
        Args:
            msg: The message to check
            rate_limit_seconds: If provided, only allow logging this message once per
                              this many seconds. If None, no rate limiting is applied.
                              
        Returns:
            True if the message should be logged, False if it should be suppressed
        """
        if rate_limit_seconds is None:
            return True
            
        message_hash = hash(msg)
        
        with self._rate_limit_lock:
            now = time.time()
            last_time = self._message_timestamps.get(message_hash, 0)
            
            if now - last_time < rate_limit_seconds:
                return False
                
            self._message_timestamps[message_hash] = now
            return True
    
    def debug(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log a debug message, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.debug(msg)
    
    def info(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log an info message, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.info(msg)
    
    def warning(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log a warning message, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.warning(msg)
    
    def error(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log an error message, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.error(msg)
    
    def critical(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log a critical message, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.critical(msg)
    
    def exception(self, msg: str, rate_limit_seconds: Optional[float] = None):
        """Log an exception message with traceback, possibly rate-limited."""
        if self._should_log_message(msg, rate_limit_seconds):
            self.logger.exception(msg)
    
    # Pod status tracking to avoid repetitive logs
    def pod_status(self, pod_id: str, status: str) -> bool:
        """
        Log pod status only when it changes or if this is the first status check.
        
        Args:
            pod_id: The ID of the pod
            status: The current status of the pod
            
        Returns:
            True if the status was logged (changed), False if suppressed (unchanged)
        """
        with self._pod_statuses_lock:
            previous_status = self._pod_statuses.get(pod_id)
            status_changed = previous_status != status
            
            if status_changed or previous_status is None:
                # Status has changed or this is the first time we're seeing this pod
                # Use DEBUG in production for routine status checks, INFO for changes
                level = logging.INFO if status_changed else logging.DEBUG
                
                if self.is_production and level == logging.DEBUG:
                    # In production, don't log routine DEBUG checks at all
                    pass
                else:
                    change_msg = "changed" if status_changed else "checked"
                    self.logger.log(level, f"Pod {pod_id} status {change_msg}: {status}")
                    
                # Update our tracked status
                self._pod_statuses[pod_id] = status
                return True
            return False
    
    def challenge_pods_count(self, count: int):
        """Log the number of challenge pods found with appropriate level."""
        # In production, this is a routine check we only want to log occasionally
        if self.is_production:
            self.debug(f"Found {count} challenge pods", rate_limit_seconds=60)
        else:
            self.info(f"Found {count} challenge pods")
    
    def log_static_once(self, msg: str, level=logging.INFO):
        """
        Log a static configuration message only once during the application's lifetime.
        For example "DOMAIN not set, using INGRESS_URL: edurange.cloud"
        """
        with self._static_lock:
            if msg not in self._static_messages:
                self._static_messages.add(msg)
                self.logger.log(level, msg)
    
    def secret_operation(self, operation: str, secret_name: str, success: bool, value_length: Optional[int] = None):
        """
        Log secret operations with appropriate level and rate limiting.
        
        Args:
            operation: The operation being performed (retrieve, create, etc.)
            secret_name: The name of the secret
            success: Whether the operation was successful
            value_length: Optional length of the secret value (for successful retrievals)
        """
        with self._secret_lock:
            # Generate a key for this specific operation + secret
            key = f"{operation}:{secret_name}"
            now = time.time()
            last_time = self._secret_access_timestamps.get(key, 0)
            
            # For failed operations, always log warnings
            if not success:
                warning_msg = f"Secret '{secret_name}' not found or operation failed"
                self.warning(warning_msg)
                self._secret_access_timestamps[key] = now
                return
            
            # For successful operations in production, reduce verbosity
            if self.is_production:
                # Only log successful operations every 5 minutes in production
                if now - last_time > 300:  # 5 minutes
                    if value_length:
                        self.debug(f"Successfully {operation} secret '{secret_name}' (length: {value_length})")
                    else:
                        self.debug(f"Successfully {operation} secret '{secret_name}'")
                    self._secret_access_timestamps[key] = now
            else:
                # In development, log all secret operations
                if value_length:
                    self.info(f"Successfully {operation} secret '{secret_name}' (length: {value_length})")
                else:
                    self.info(f"Successfully {operation} secret '{secret_name}'")
                self._secret_access_timestamps[key] = now


# Create a global instance for import
_logger_instance = None

def get_logger(name: str = 'instance-manager') -> RateLimitedLogger:
    """Get or create the rate-limited logger."""
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = RateLimitedLogger(name)
    return _logger_instance 