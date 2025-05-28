"""
Challenge Type Management System for the instance-manager.
This module centralizes the management of challenge types, normalizing type references,
and ensuring consistent type handling across the application.
"""
import logging
import os
from typing import Dict, Set, List, Optional, Tuple, Any
from enum import Enum
import json
import difflib

# Directory containing Challenge Type Definition (CTD) files
CTD_DIR = os.path.join(os.path.dirname(__file__), '..', 'challenge_types')


class ChallengeType(Enum):
    """
    Standard challenge type identifiers.
    These are the canonical, normalized names used throughout the system.
    """
    FULL_OS = "full-os"     # Full operating system challenges
    WEB = "web"            # Web application challenges 
    METASPLOIT = "metasploit"  # Metasploit framework challenges
    CONTAINER = "container"    # General containerized challenges
    SQL_INJECTION = "sql-injection"  # SQL injection challenges
    RED_BLUE = "redblue"  # Red-Blue challenge with shared defender

    @classmethod
    def from_string(cls, value: str) -> Optional['ChallengeType']:
        """Convert string to enum value with normalization."""
        normalized = normalize_challenge_type(value)
        try:
            # Find by normalized value
            return next(t for t in cls if t.value == normalized)
        except StopIteration:
            return None

    @classmethod
    def get_all_values(cls) -> List[str]:
        """Get list of all challenge type values."""
        return [t.value for t in cls]


# Legacy type mapping - used for backward compatibility
# Maps legacy/alternative names to canonical ChallengeType values
LEGACY_TYPE_MAP: Dict[str, str] = {
    # FullOS variants
    "fullos": ChallengeType.FULL_OS.value,
    "full_os": ChallengeType.FULL_OS.value,
    "fulloschallengespackage": ChallengeType.FULL_OS.value,
    "fullochallenge": ChallengeType.FULL_OS.value,
    # Web variants
    "webchallenge": ChallengeType.WEB.value,
    "webchallengespackage": ChallengeType.WEB.value,
    # Metasploit variants
    "metasploitchallenge": ChallengeType.METASPLOIT.value,
    "msf": ChallengeType.METASPLOIT.value,
    # Container variants
    "cont": ChallengeType.CONTAINER.value,
    "containerchallenge": ChallengeType.CONTAINER.value,
    # SQL Injection variants
    "sqlinjection": ChallengeType.SQL_INJECTION.value,
    "sql_injection": ChallengeType.SQL_INJECTION.value,
    "sqli": ChallengeType.SQL_INJECTION.value,
    # Red-Blue variants
    "red_blue": ChallengeType.RED_BLUE.value,
    "red-blue": ChallengeType.RED_BLUE.value,
    "redbluechallenge": ChallengeType.RED_BLUE.value,
}


def normalize_challenge_type(challenge_type: str) -> str:
    """
    Normalize a challenge type string to its canonical form.
    
    Args:
        challenge_type: The challenge type string to normalize
        
    Returns:
        The normalized challenge type string
    """
    if not challenge_type:
        return ""
        
    # Convert to lowercase for case-insensitive matching
    lower_type = challenge_type.lower()
    
    # First check exact match with canonical types
    if lower_type in {t.value.lower() for t in ChallengeType}:
        # Return the properly cased version
        for t in ChallengeType:
            if t.value.lower() == lower_type:
                return t.value
                
    # Handle special case for fullOS (mixed casing) manually if needed
    if lower_type == "fullos":
        return ChallengeType.FULL_OS.value
        
    # Check for legacy type mapping
    if lower_type in LEGACY_TYPE_MAP:
        normalized = LEGACY_TYPE_MAP[lower_type]
        logging.info(f"Normalized legacy challenge type '{challenge_type}' to '{normalized}'")
        return normalized
        
    # If no matching found, return original value (if valid)
    if is_valid_ctd_type(challenge_type):
        logging.info(f"Using non-standard but valid challenge type: {challenge_type}")
        return challenge_type
        
    # Return original if no normalization can be applied
    logging.warning(f"Couldn't normalize unknown challenge type: {challenge_type}")
    return challenge_type


def is_valid_ctd_type(challenge_type: str) -> bool:
    """
    Verify if a challenge type has a valid CTD file.
    
    Args:
        challenge_type: The challenge type to check
        
    Returns:
        True if the type has a CTD file, False otherwise
    """
    if not challenge_type:
        return False
        
    # Check if a CTD file exists for this type
    ctd_path = os.path.join(CTD_DIR, f"{challenge_type}.ctd.json")
    return os.path.isfile(ctd_path)


def get_all_challenge_types() -> List[str]:
    """
    Get a list of all valid challenge types from both enum and CTD files.
    
    Returns:
        List of challenge type strings
    """
    # Start with the standard types from the enum
    types = ChallengeType.get_all_values()
    
    # Add types from CTD files
    try:
        for filename in os.listdir(CTD_DIR):
            if filename.endswith('.ctd.json'):
                ctd_type = filename.replace('.ctd.json', '')
                if ctd_type not in types:
                    types.append(ctd_type)
    except Exception as e:
        logging.error(f"Error listing challenge types from CTD directory: {e}")
    
    return types


def get_handler_types() -> Set[str]:
    """
    Get the set of challenge types that have handlers registered.
    Used to determine what types should appear in the CHALLENGE_HANDLERS mapping.
    
    Returns:
        Set of challenge type strings that should have handlers
    """
    # This should return all types that have valid CTD files or are standard types
    return set(get_all_challenge_types())


def validate_challenge_type(challenge_type: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a challenge type string.
    
    Args:
        challenge_type: The challenge type to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not challenge_type:
        logging.error("Validation failed: Empty challenge type")
        return False, "Challenge type cannot be empty"
    
    # Log the original type for debugging
    logging.info(f"Validating challenge type: '{challenge_type}'")
    
    # Normalize the type
    normalized_type = normalize_challenge_type(challenge_type)
    if normalized_type != challenge_type:
        logging.info(f"Normalized challenge type from '{challenge_type}' to '{normalized_type}'")
    
    # Check if it's a standard type
    if normalized_type in ChallengeType.get_all_values():
        logging.info(f"Challenge type '{normalized_type}' is a standard type")
        return True, None
        
    # Check if it has a valid CTD
    if is_valid_ctd_type(normalized_type):
        ctd_path = os.path.join(CTD_DIR, f"{normalized_type}.ctd.json")
        logging.info(f"Challenge type '{normalized_type}' has a valid CTD file at {ctd_path}")
        return True, None
    
    # If we get here, the type is invalid
    valid_types = get_all_challenge_types()
    
    # Check if it's close to a valid type (typo detection)
    close_matches = difflib.get_close_matches(normalized_type, valid_types, n=3, cutoff=0.7)
    
    # Log available CTD files
    try:
        ctd_files = [f for f in os.listdir(CTD_DIR) if f.endswith('.ctd.json')]
        logging.error(f"Available CTD files: {ctd_files}")
    except Exception as e:
        logging.error(f"Error listing CTD files: {e}")
    
    if close_matches:
        error_msg = f"Invalid challenge type '{challenge_type}'. Did you mean: {', '.join(close_matches)}? Valid types: {', '.join(valid_types)}"
        logging.error(error_msg)
        return False, error_msg
    else:
        error_msg = f"Invalid challenge type '{challenge_type}'. Must be one of: {', '.join(valid_types)}"
        logging.error(error_msg)
        return False, error_msg 