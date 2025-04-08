"""
Input validation utilities for instance-manager API endpoints.
Provides standardized validation functions for common parameters.
"""

import re
import logging
from typing import Dict, Any, Optional, Tuple, List, Union

# Import the challenge_types module for type validation
from challenge_utils.challenge_types import validate_challenge_type as validate_challenge_type_impl


def validate_instance_name(instance_name: str) -> Tuple[bool, Optional[str]]:
    """
    Validate an instance name.
    
    Args:
        instance_name: The instance name to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not instance_name:
        return False, "Instance name cannot be empty"
    
    # Check if it's a valid UUID pattern (allowing dashed format UUIDs)
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if re.match(uuid_pattern, instance_name.lower()):
        return True, None
    
    # Only allow alphanumeric characters, dashes, and lowercase letters
    # Must start with a letter and be 5-63 characters (DNS requirements)
    pattern = r'^[a-z]([-a-z0-9]*[a-z0-9])?$'
    if not re.match(pattern, instance_name) or len(instance_name) > 63:
        return False, "Instance name must consist of lowercase letters, numbers, and dashes, start with a letter, and be no longer than 63 characters"
    
    return True, None


def validate_challenge_type(challenge_type: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a challenge type.
    
    Args:
        challenge_type: The challenge type to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    # Use the implementation from challenge_types module
    return validate_challenge_type_impl(challenge_type)


def validate_namespace(namespace: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a Kubernetes namespace.
    
    Args:
        namespace: The namespace to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not namespace:
        return False, "Namespace cannot be empty"
    
    # Namespace must be a valid DNS label
    pattern = r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
    if not re.match(pattern, namespace) or len(namespace) > 63:
        return False, "Namespace must consist of lowercase letters, numbers, and dashes, and be no longer than 63 characters"
    
    return True, None


def validate_command(command: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a command for execution in a pod.
    
    Args:
        command: The command to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not command:
        return False, "Command cannot be empty"
    
    # Basic validation to prevent shell injection
    # Blacklist potentially dangerous commands/characters
    dangerous_patterns = [
        # Command chaining and redirection
        r'[|;&$]',                      # Shell command chaining/piping
        r'>>?',                         # Output redirection
        r'<',                           # Input redirection
        r'`.*`',                        # Command substitution with backticks
        r'\$\(.*\)',                    # Command substitution with $()
        r'\${.*}',                      # Variable expansion that might be used for injection
        
        # System manipulation commands
        r'\bsudo\b',                    # Sudo attempts
        r'\bsu\b',                      # Switch user
        r'\bdoas\b',                    # Another privilege escalation tool
        r'\bpkexec\b',                  # Policy kit execution
        
        # Destructive file operations
        r'\brm\s+.*-[rf]',              # Recursive/force remove
        r'\bmv\b.*\s+\/\b',             # Moving to root
        r'\bcp\b.*\s+\/\b',             # Copying to root
        r'\bchmod\b.*\s+[0-7]777\b',    # Overly permissive chmod
        r'\bchown\b',                   # Change ownership
        r'\bchattr\b',                  # Change file attributes
        
        # System control commands
        r'\binit\b',                    # System init commands
        r'\bsystemctl\b',               # Systemd control
        r'\bservice\b',                 # Service control
        r'\bshutdown\b',                # System shutdown
        r'\breboot\b',                  # System reboot
        r'\bpoweroff\b',                # Power off
        r'\bhalt\b',                    # Halt system
        
        # Network tools that could be used for attacks
        r'\bnmap\b',                    # Network scanning
        r'\bnetcat\b|\bnc\b',           # Netcat
        r'\bcurl\b.*\s+\|\s+bash',      # Piping curl to bash
        r'\bwget\b.*\s+\|\s+bash',      # Piping wget to bash
        r'\bcurl\b.*\s+-o\b',           # Downloading files with curl
        r'\bwget\b.*\s+-O\b',           # Downloading files with wget
        r'\bssh\b',                     # SSH connections
        r'\btelnet\b',                  # Telnet connections
        
        # Process manipulation
        r'\bkill\b\s+-9',               # Force kill
        r'\bpkill\b',                   # Process kill
        r'\bkillall\b',                 # Kill all processes
        
        # Package management (could install malicious software)
        r'\bapt\b',                     # Apt package manager
        r'\bapt-get\b',                 # Apt-get package manager
        r'\byum\b',                     # Yum package manager
        r'\bdnf\b',                     # DNF package manager
        r'\bpip\b',                     # Python package installer
        r'\bnpm\b\s+install',           # Node.js package manager install
        
        # File content viewing/modification of sensitive areas
        r'\bcat\b.*\s+\/etc\/passwd',   # Viewing passwd file
        r'\bcat\b.*\s+\/etc\/shadow',   # Viewing shadow file
        r'\bvi\b|\bvim\b|\bnano\b',     # Text editors
        r'\btouch\b.*\s+\/etc\/',       # Creating files in /etc
        r'\becho\b.*\s+>>\s+\/etc\/',   # Appending to files in /etc
        
        # Information gathering
        r'\bfind\b\s+\/\s+-type',       # Searching entire filesystem
        r'\bgrep\b\s+-r\s+\/\b',        # Recursive grep from root
        r'\bawk\b.*\s+\/etc\/',         # Awk on system files
        r'\bsed\b.*\s+-i\s+.*\/etc\/',  # In-place sed on system files
        
        # Kernel operations
        r'\binsmod\b',                  # Insert kernel module
        r'\brmmod\b',                   # Remove kernel module
        r'\bmodprobe\b',                # Modify kernel modules
        r'\bsysctl\b',                  # Change kernel parameters
        
        # Special devices access
        r'\/dev\/mem',                  # Memory device
        r'\/dev\/kmem',                 # Kernel memory
        r'\/dev\/port',                 # I/O ports
        r'\/proc\/kcore',               # Kernel core
        
        # Time-based attacks
        r'\bsleep\b\s+[0-9]{3,}',       # Very long sleep
        r'while\s+true',                # Infinite loops
        r'for\s+\(\(.*\)\)',            # Bash for loops that might be infinite
        
        # Execution context modification
        r'\benv\b\s+-i',                # Clean environment
        r'\benv\b\s+PATH=',             # PATH modification
        r'\bexport\s+PATH=',            # Export PATH
        r'\bexport\s+LD_',              # Library path modification
        
        # Obfuscation techniques
        r'\\x[0-9a-fA-F]{2}',           # Hex encoded characters
        r'base64',                      # Base64 encoding/decoding
        r'\\u[0-9a-fA-F]{4}',           # Unicode escape sequences
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, command):
            return False, "Command contains potentially dangerous operations"
    
    return True, None


def validate_request_json(json_data: Dict[str, Any], required_fields: List[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate request JSON data by checking for required fields.
    
    Args:
        json_data: The JSON data to validate.
        required_fields: List of required field names.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if json_data is None:
        return False, "Request body must be valid JSON"
    
    missing_fields = [field for field in required_fields if field not in json_data]
    
    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"
    
    return True, None


def validate_pod_name(pod_name: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a pod name.
    
    Args:
        pod_name: The pod name to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not pod_name:
        return False, "Pod name cannot be empty"
    
    # Pod name must be a valid DNS label
    pattern = r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
    if not re.match(pattern, pod_name) or len(pod_name) > 63:
        return False, "Pod name must consist of lowercase letters, numbers, and dashes, start with a letter or number, and be no longer than 63 characters"
    
    return True, None


def validate_container_name(container_name: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a container name.
    
    Args:
        container_name: The container name to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not container_name:
        return False, "Container name cannot be empty"
    
    # Container name must be a valid DNS label
    pattern = r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
    if not re.match(pattern, container_name) or len(container_name) > 63:
        return False, "Container name must consist of lowercase letters, numbers, and dashes, start with a letter or number, and be no longer than 63 characters"
    
    return True, None


def validate_flag_format(flag: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a flag format.
    
    Args:
        flag: The flag to validate.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not flag:
        return False, "Flag cannot be empty"
    
    # Prevent extremely long flags
    if len(flag) > 1000:
        return False, "Flag is too long (max 1000 characters)"
    
    return True, None


def validate_template_variables(variables: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate template variables.
    
    Args:
        variables: Dictionary of template variables.
        
    Returns:
        Tuple of (is_valid, error_message).
        If valid, error_message will be None.
    """
    if not variables:
        return True, None  # Empty variables dict is valid
    
    for key, value in variables.items():
        # Validate keys
        if not isinstance(key, str):
            return False, f"Variable key must be a string: {key}"
        
        if not key:
            return False, "Variable key cannot be empty"
        
        # Check for valid key format (alphanumeric and underscores)
        if not re.match(r'^[A-Za-z0-9_]+$', key):
            return False, f"Variable key contains invalid characters: {key}"
        
        # Validate values - they should be strings or simple types
        if isinstance(value, (dict, list)):
            return False, f"Complex variable values are not supported for key: {key}"
        
        # Convert value to string and check for reasonable length
        str_value = str(value)
        if len(str_value) > 1000:
            return False, f"Variable value too long for key: {key}"
    
    return True, None


def validate_parameters(parameters: Dict[str, Any]) -> Dict[str, Tuple[bool, Optional[str]]]:
    """
    Validate multiple parameters at once.
    
    Args:
        parameters: Dictionary mapping parameter names to validation functions
                   and values. Format: {'param_name': (validation_fn, value)}
    
    Returns:
        Dictionary with validation results for each parameter:
        {'param_name': (is_valid, error_message)}
    """
    results = {}
    
    for param_name, (validation_fn, value) in parameters.items():
        is_valid, error_message = validation_fn(value)
        results[param_name] = (is_valid, error_message)
    
    return results 