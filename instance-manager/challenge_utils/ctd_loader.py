import json
import logging
import os
import jsonschema
from challenge_utils.cdf_parser import substitute_variables

# Path to CTD schema
CTD_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), '..', 'schemas', 'ctd.schema.json')
# Directory for CTD files
CTD_DIR = os.path.join(os.path.dirname(__file__), '..', 'challenge_types')

# Load CTD schema
try:
    with open(CTD_SCHEMA_PATH, 'r') as f:
        CTD_SCHEMA = json.load(f)
    logging.info(f"Successfully loaded CTD schema from {CTD_SCHEMA_PATH}")
except Exception as e:
    logging.error(f"Error loading CTD schema: {e}")
    CTD_SCHEMA = None

# Cache for loaded CTDs
_ctd_cache = {}

def get_ctd_schema():
    """Return the CTD schema."""
    return CTD_SCHEMA

def load_ctd(challenge_type):
    """
    Load a Challenge Type Definition from the challenge_types directory.
    
    Args:
        challenge_type: The challenge type identifier (e.g., 'fullOS')
        
    Returns:
        The CTD as a dictionary, or None if not found
    """
    # Check cache first
    if challenge_type in _ctd_cache:
        logging.info(f"Using cached CTD for challenge type '{challenge_type}'")
        return _ctd_cache[challenge_type]
    
    ctd_path = os.path.join(CTD_DIR, f"{challenge_type}.ctd.json")
    logging.info(f"Attempting to load CTD from: {ctd_path}")
    
    # Check if file exists before trying to open
    if not os.path.exists(ctd_path):
        logging.error(f"CTD file not found at path: {ctd_path}")
        
        # List all available files in the CTD directory for debugging
        try:
            ctd_files = [f for f in os.listdir(CTD_DIR) if f.endswith('.ctd.json')]
            if ctd_files:
                logging.error(f"Available CTD files: {', '.join(ctd_files)}")
            else:
                logging.error(f"No CTD files found in directory: {CTD_DIR}")
        except Exception as dir_e:
            logging.error(f"Error listing CTD directory: {dir_e}")
        
        return None
    
    try:
        with open(ctd_path, 'r') as f:
            ctd_data = json.load(f)
        
        # Log CTD structure for debugging
        logging.info(f"Loaded CTD for challenge type '{challenge_type}' with keys: {list(ctd_data.keys())}")
        
        # Basic sanity checks
        if 'typeId' not in ctd_data:
            logging.warning(f"CTD for challenge type '{challenge_type}' is missing 'typeId' field")
        
        if ctd_data.get('typeId', '') != challenge_type:
            logging.warning(f"CTD typeId '{ctd_data.get('typeId')}' does not match expected type '{challenge_type}'")
        
        # Validate against schema
        if CTD_SCHEMA:
            try:
                jsonschema.validate(instance=ctd_data, schema=CTD_SCHEMA)
                logging.info(f"CTD validation successful for '{challenge_type}'")
            except jsonschema.ValidationError as schema_error:
                # Provide detailed validation error information
                error_path = '/'.join(str(part) for part in schema_error.path) if schema_error.path else "root"
                schema_path = '/'.join(str(part) for part in schema_error.schema_path) if schema_error.schema_path else "unknown"
                
                logging.error(f"CTD validation error for '{challenge_type}' at path '{error_path}': {schema_error.message}")
                logging.error(f"Schema path for error: {schema_path}")
                
                # Continue despite validation error (log but don't fail)
                logging.warning(f"Using CTD despite validation error for '{challenge_type}'")
        else:
            logging.warning(f"CTD schema not available, skipping validation for '{challenge_type}'")
        
        # Cache and return
        _ctd_cache[challenge_type] = ctd_data
        logging.info(f"Successfully loaded and cached CTD for challenge type '{challenge_type}'")
        return ctd_data
    
    except FileNotFoundError:
        logging.error(f"CTD file not found for challenge type '{challenge_type}'")
        return None
    except json.JSONDecodeError as e:
        logging.error(f"Invalid JSON in CTD file for challenge type '{challenge_type}': {e}")
        logging.error(f"Error location: line {e.lineno}, column {e.colno}")
        return None
    except jsonschema.ValidationError as e:
        logging.error(f"CTD validation failed for challenge type '{challenge_type}': {e}")
        return None
    except Exception as e:
        import traceback
        logging.error(f"Unexpected error loading CTD for challenge type '{challenge_type}': {e}")
        logging.error(f"Stack trace: {traceback.format_exc()}")
        return None

def resolve_ctd_template(ctd_data, variables):
    """
    Resolve template variables in a CTD.
    
    Args:
        ctd_data: The CTD data
        variables: Dictionary of variables to substitute
        
    Returns:
        CTD with variables substituted
    """
    return substitute_variables(ctd_data, variables)

def list_available_challenge_types():
    """
    List all available challenge types by scanning the challenge_types directory.
    
    Returns:
        List of challenge type identifiers
    """
    challenge_types = []
    
    try:
        for filename in os.listdir(CTD_DIR):
            if filename.endswith('.ctd.json'):
                challenge_type = filename.replace('.ctd.json', '')
                challenge_types.append(challenge_type)
    except Exception as e:
        logging.error(f"Error listing challenge types: {e}")
    
    return challenge_types 