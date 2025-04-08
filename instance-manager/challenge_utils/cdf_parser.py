import json
import yaml
import logging
import jsonschema
import os
from copy import deepcopy

# Load schemas (adjust path as needed relative to instance-manager execution context)
SCHEMA_DIR = os.path.join(os.path.dirname(__file__), '..', 'schemas') # Assumes schemas dir is one level up from utils dir
CDF_SCHEMA_PATH = os.path.join(SCHEMA_DIR, 'cdf.schema.json')

try:
    with open(CDF_SCHEMA_PATH, 'r') as f:
        CDF_SCHEMA = json.load(f)
    logging.info(f"Successfully loaded CDF schema from {CDF_SCHEMA_PATH}")
except FileNotFoundError:
    logging.error(f"CDF schema file not found at {CDF_SCHEMA_PATH}. Validation will fail.")
    CDF_SCHEMA = None
except json.JSONDecodeError as e:
    logging.error(f"Error decoding CDF schema JSON from {CDF_SCHEMA_PATH}: {e}. Validation will fail.")
    CDF_SCHEMA = None
except Exception as e:
    logging.error(f"An unexpected error occurred loading CDF schema: {e}")
    CDF_SCHEMA = None

def load_schema():
    """
    Returns the loaded CDF schema.
    
    Returns:
        dict: The CDF schema as a dictionary, or None if it couldn't be loaded
    """
    if CDF_SCHEMA is None:
        logging.error("Schema was not loaded properly during initialization")
        return None
    
    return CDF_SCHEMA

def load_cdf(content_string: str) -> dict:
    """Parses a JSON or YAML string into a Python dictionary.

    Args:
        content_string: The string content of the CDF file, or a dictionary.

    Returns:
        A dictionary representing the CDF content.

    Raises:
        ValueError: If parsing fails for both JSON and YAML.
    """
    # If content_string is already a dict, return it
    if isinstance(content_string, dict):
        logging.debug("Content is already a dictionary, using as is.")
        return content_string

    try:
        # Try parsing as JSON first
        data = json.loads(content_string)
        logging.debug("Successfully parsed CDF content as JSON.")
        return data
    except json.JSONDecodeError:
        logging.debug("Failed to parse CDF as JSON, trying YAML...")
        try:
            # Try parsing as YAML
            data = yaml.safe_load(content_string)
            if not isinstance(data, dict):
                 raise ValueError("YAML content did not parse into a dictionary.")
            logging.debug("Successfully parsed CDF content as YAML.")
            return data
        except yaml.YAMLError as e:
            logging.error(f"Failed to parse CDF content as YAML: {e}")
            raise ValueError(f"Failed to parse CDF content as JSON or YAML: {e}")
        except Exception as e:
             logging.error(f"Unexpected error parsing YAML: {e}")
             raise ValueError(f"Unexpected error parsing YAML: {e}")
    except Exception as e:
         logging.error(f"Unexpected error parsing JSON: {e}")
         raise ValueError(f"Unexpected error parsing JSON: {e}")

def validate_cdf(cdf_data: dict):
    """Validates the parsed CDF data against the loaded JSON Schema.

    Args:
        cdf_data: The dictionary representation of the CDF.

    Raises:
        jsonschema.ValidationError: If validation fails.
        ValueError: If the schema itself was not loaded correctly.
    """
    if CDF_SCHEMA is None:
        raise ValueError("CDF JSON Schema was not loaded correctly. Cannot validate.")
    try:
        # Log the structure of the data being validated
        logging.info(f"Validating CDF with metadata: {json.dumps(cdf_data.get('metadata', {}), indent=2)}")
        
        # Check for common issues before validation
        if not isinstance(cdf_data, dict):
            logging.error(f"CDF data is not a dictionary. Type: {type(cdf_data)}")
            raise ValueError(f"CDF data must be a dictionary, got {type(cdf_data)}")
            
        # Check for required top-level keys
        required_keys = ['metadata', 'components']
        missing_keys = [key for key in required_keys if key not in cdf_data]
        if missing_keys:
            logging.error(f"CDF missing required top-level keys: {missing_keys}")
            # Continue to full schema validation to get detailed errors
            
        # Run the schema validation
        try:
            jsonschema.validate(instance=cdf_data, schema=CDF_SCHEMA)
            logging.info("CDF data validation successful.")
        except jsonschema.ValidationError as e:
            # Provide more detailed error information
            error_path = '/'.join(str(part) for part in e.path) if e.path else "root"
            logging.error(f"CDF validation error at path '{error_path}': {e.message}")
            
            # Try to provide context about the data that failed validation
            if e.path:
                # Navigate to the problematic part of the document if possible
                context_data = cdf_data
                try:
                    for path_part in e.path:
                        context_data = context_data[path_part]
                    logging.error(f"Validation failed on: {json.dumps(context_data, indent=2)[:500]}")
                except (KeyError, TypeError, IndexError):
                    logging.error("Could not extract context data for the error")
            
            # Include schema information if relevant
            if e.schema_path:
                schema_path = '/'.join(str(part) for part in e.schema_path)
                logging.error(f"Schema path for error: {schema_path}")
                
            raise
    except Exception as e:
        if not isinstance(e, jsonschema.ValidationError):
            logging.error(f"An unexpected error occurred during validation: {e}")
        raise

def _recursive_substitute(item, variables_map):
    """Recursively substitutes placeholders in strings within nested structures."""
    if isinstance(item, dict):
        # Process each key-value pair in the dictionary
        result = {}
        for k, v in item.items():
            result[k] = _recursive_substitute(v, variables_map)
        return result
    elif isinstance(item, list):
        # Process each element in the list
        return [_recursive_substitute(elem, variables_map) for elem in item]
    elif isinstance(item, str):
        # Simple substitution logic: replace {{ VAR_NAME }} with value
        substituted_item = item
        
        # Pre-process for common patterns like {{INSTANCE_NAME}}.{{DOMAIN}}
        # First look for this specific pattern and replace it
        if "{{INSTANCE_NAME}}.{{DOMAIN}}" in substituted_item:
            if "INSTANCE_NAME.DOMAIN" in variables_map:
                substituted_item = substituted_item.replace(
                    "{{INSTANCE_NAME}}.{{DOMAIN}}", 
                    str(variables_map["INSTANCE_NAME.DOMAIN"])
                )
            elif "INSTANCE_NAME" in variables_map and "DOMAIN" in variables_map:
                # Fallback to joining individual variables
                joined_value = f"{variables_map['INSTANCE_NAME']}.{variables_map['DOMAIN']}"
                substituted_item = substituted_item.replace(
                    "{{INSTANCE_NAME}}.{{DOMAIN}}", 
                    joined_value
                )
                
        # Check if the entire string is a template variable (like "{{FLAG_SECRET_NAME}}")
        if item.startswith("{{") and item.endswith("}}"):
            var_name = item[2:-2].strip()
            if var_name in variables_map:
                # Special case for complete replacement to handle non-string types better
                return str(variables_map[var_name])
            else:
                logging.warning(f"Template variable {var_name} not found in variables map")
                # return substituted_item
        
        # Process all template variables in the string
        import re
        pattern = r"{{([^{}]+)}}"
        
        def replace_var(match):
            var_name = match.group(1).strip()
            if var_name in variables_map:
                return str(variables_map[var_name])
            else:
                logging.warning(f"Template variable {var_name} not found in variables map")
                return match.group(0)  # Return the original template string
        
        # Replace all occurrences of template variables
        substituted_item = re.sub(pattern, replace_var, substituted_item)
        
        return substituted_item
    else:
        # Return non-string items as is (int, bool, float, None, etc.)
        return item

def substitute_variables(cdf_data: dict, variables_map: dict) -> dict:
    """Performs variable substitution throughout the CDF data structure.

    Args:
        cdf_data: The dictionary representation of the CDF.
        variables_map: A dictionary where keys are variable names (placeholders)
                       and values are the values to substitute.

    Returns:
        A new dictionary with variables substituted.
    """
    if not variables_map:
        return cdf_data # No variables to substitute
    
    # Create a deep copy to avoid modifying the original data
    data_copy = deepcopy(cdf_data)
    
    logging.info(f"Starting variable substitution with keys: {list(variables_map.keys())}")
    substituted_data = _recursive_substitute(data_copy, variables_map)
    logging.info("Variable substitution complete.")
    return substituted_data 