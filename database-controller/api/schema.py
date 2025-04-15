# Schema validation for CDF and Pack Manifest
# This file should be kept in sync with the canonical schemas in:
# - ingress-instance-manager/schemas/cdf.schema.json
# - ingress-instance-manager/schemas/cdf-pack.schema.json

import os
import logging
import json
import requests
from typing import Dict, Any, Optional, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Get instance manager URL from environment variable
INSTANCE_MANAGER_URL = os.environ.get('INSTANCE_MANAGER_URL', 'http://instance-manager.default.svc.cluster.local')

# Schema cache
_schema_cache = {
    "cdf_schema": None,
    "last_updated": 0
}

# Cache TTL in seconds (1 hour)
SCHEMA_CACHE_TTL = 3600

def fetch_latest_schema() -> Tuple[bool, Dict[str, Any]]:
    """
    Fetch the latest CDF schema from the instance manager.
    
    Returns:
        Tuple[bool, Dict[str, Any]]: A tuple containing:
            - bool: True if fetch was successful, False otherwise
            - Dict: The fetched schema if successful, or the cached/default schema if not
    """
    import time
    current_time = int(time.time())
    
    # Check if we have a cached schema that's still valid
    if _schema_cache["cdf_schema"] and (current_time - _schema_cache["last_updated"] < SCHEMA_CACHE_TTL):
        logger.info("Using cached CDF schema")
        return True, _schema_cache["cdf_schema"]
    
    # Attempt to fetch the latest schema
    try:
        # Properly handle URL construction to avoid duplicate /api
        base_url = INSTANCE_MANAGER_URL.rstrip('/')
        if '/api' in base_url:
            schema_url = f"{base_url}/schema"
        else:
            schema_url = f"{base_url}/api/schema"
            
        logger.info(f"Fetching latest CDF schema from {schema_url}")
        response = requests.get(schema_url, 
                                headers={"Accept": "application/json"},
                                timeout=5)
        
        if response.status_code != 200:
            logger.error(f"Failed to fetch schema: HTTP {response.status_code}")
            # Fall back to cached schema if available
            if _schema_cache["cdf_schema"]:
                logger.warning("Using cached schema as fallback")
                return False, _schema_cache["cdf_schema"]
            # Otherwise use local schema
            return False, CDF_SCHEMA
            
        # Parse schema
        schema = response.json()
        
        # Update cache
        _schema_cache["cdf_schema"] = schema
        _schema_cache["last_updated"] = current_time
        
        logger.info("Successfully fetched and cached latest CDF schema")
        return True, schema
        
    except Exception as e:
        logger.error(f"Error fetching schema from instance manager: {e}")
        # Fall back to cached schema if available
        if _schema_cache["cdf_schema"]:
            logger.warning("Using cached schema as fallback")
            return False, _schema_cache["cdf_schema"]
        # Otherwise use local schema
        return False, CDF_SCHEMA

# Default schema definitions
PACK_JSON_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EDURange CDF Pack Manifest",
    "type": "object",
    "required": ["id", "name", "version", "challenges"],
    "properties": {
        "$schema": {
            "type": "string",
            "format": "uri",
            "description": "Reference to the JSON schema definition for this file."
        },
        "id": {
            "type": "string",
            "description": "Unique identifier for the pack",
            "pattern": "^[a-z0-9-_]+$"
        },
        "name": {"type": "string", "description": "Human-readable name of the pack"},
        "version": {
            "type": "string",
            "description": "Pack version (semantic versioning)",
            "pattern": "^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$"
        },
        "description": {"type": "string", "description": "Optional description of the pack"},
        "author": {"type": "string", "description": "Optional author name"},
        "license": {"type": "string", "description": "Optional license identifier"},
        "website": {"type": "string", "format": "uri", "description": "Optional URL for the pack"},
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional tags for categorization",
            "uniqueItems": True
        },
        "prerequisites": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional list of prerequisites",
            "uniqueItems": True
        },
        "challenges": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of relative paths to challenge files",
            "minItems": 1,
            "uniqueItems": True
        },
        "shared_resources": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional list of shared resources",
            "uniqueItems": True
        },
        "dependencies": {
            "type": "object",
            "description": "Other packs that this pack depends on",
            "additionalProperties": {"type": "string"}
        },
        "metadata": {
            "type": "object",
            "description": "Additional metadata about the pack"
        }
    },
    "additionalProperties": False  # Disallow properties not defined in the schema
}

# Component schema definitions for CDF validation
CONTAINER_CONFIG_SCHEMA = {
    "type": "object",
    "required": ["image"],
    "properties": {
        "image": {"type": "string"},
        "command": {
            "type": "array",
            "items": {"type": "string"}
        },
        "args": {
            "type": "array",
            "items": {"type": "string"}
        },
        "env": {
            "type": "object",
            "additionalProperties": {"type": "string"}
        },
        "ports": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["containerPort"],
                "properties": {
                    "containerPort": {"type": "number"},
                    "hostPort": {"type": "number"},
                    "protocol": {"type": "string", "enum": ["TCP", "UDP"]}
                }
            }
        },
        "volumes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "mountPath"],
                "properties": {
                    "name": {"type": "string"},
                    "mountPath": {"type": "string"}
                }
            }
        },
        "resources": {
            "type": "object",
            "properties": {
                "limits": {
                    "type": "object",
                    "properties": {
                        "cpu": {"type": "string"},
                        "memory": {"type": "string"}
                    }
                },
                "requests": {
                    "type": "object",
                    "properties": {
                        "cpu": {"type": "string"},
                        "memory": {"type": "string"}
                    }
                }
            }
        }
    }
}

WEBOS_APP_CONFIG_SCHEMA = {
    "type": "object",
    "required": ["app_type"],
    "properties": {
        "app_type": {
            "type": "string",
            "enum": ["terminal", "editor", "browser", "custom"]
        },
        "target": {"type": "string"},
        "url": {"type": "string", "format": "uri"},
        "icon": {"type": "string"},
        "position": {
            "type": "object",
            "properties": {
                "x": {"type": "number"},
                "y": {"type": "number"},
                "width": {"type": "number"},
                "height": {"type": "number"}
            }
        }
    }
}

QUESTION_CONFIG_SCHEMA = {
    "type": "object",
    "required": ["type", "text"],
    "properties": {
        "type": {
            "type": "string",
            "enum": ["text", "multiple_choice", "checkboxes", "flag"]
        },
        "text": {"type": "string"},
        "points": {"type": "number"},
        "options": {
            "type": "array",
            "items": {"type": "string"}
        },
        "answer": {
            # This one is complex: can be string, number, or array
            # Python schema validation can't easily express oneOf, so we'll check in code
        },
        "explanation": {"type": "string"}
    }
}

CONFIG_MAP_SCHEMA = {
    "type": "object",
    "required": ["data"],
    "properties": {
        "data": {
            "type": "object",
            "additionalProperties": {"type": "string"}
        }
    }
}

SECRET_CONFIG_SCHEMA = {
    "type": "object",
    "required": ["data"],
    "properties": {
        "data": {
            "type": "object",
            "additionalProperties": {"type": "string"}
        }
    }
}

CDF_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EDURange Challenge Definition Format",
    "type": "object",
    "required": ["metadata", "components"],
    "properties": {
        "$schema": {
            "type": "string",
            "description": "JSON Schema URI for the CDF schema being used"
        },
        "metadata": {
            "type": "object",
            "required": ["name", "version", "challenge_type"],
            "properties": {
                "name": {"type": "string"},
                "version": {"type": "string"},
                "description": {"type": "string"},
                "challenge_type": {
                    "type": "string",
                    # TODO: Replace this hardcoded enum with a dynamic lookup of available challenge types from instance manager.
                    # This should query the instance manager's /api/types endpoint to get all installed challenge types.
                    "enum": ["fullOS", "web", "container", "metasploit", "sql-injection"]
                },
                "difficulty": {
                    "type": "string",
                    "enum": ["beginner", "intermediate", "advanced", "expert"]
                },
                "estimated_time": {"type": "number"},
                "learning_objectives": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "pack_id": {"type": "string"},
                "author": {"type": "string"},
                "license": {"type": "string"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        },
        "components": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["type", "id", "config"],
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["container", "webosApp", "question", "configMap", "secret"]
                    },
                    "id": {"type": "string"},
                    "config": {"type": "object"}
                }
            },
            "minItems": 1
        },
        "typeConfig": {
            "type": "object",
            "description": "Configuration specific to this challenge type",
            "additionalProperties": True
        },
        "variables": {
            "type": "object",
            "additionalProperties": True
        },
        "templates": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "path", "destination"],
                "properties": {
                    "name": {"type": "string"},
                    "path": {"type": "string"},
                    "destination": {"type": "string"}
                }
            }
        }
    },
    "additionalProperties": False
}

# Helper function to validate component configs based on type
def validate_component_config(component_type, config):
    """Validate the configuration for a specific component type."""
    
    # Validate question components
    if component_type == "question":
        if not isinstance(config, dict):
            return False, "Question component config must be an object"
        
        if "text" not in config:
            return False, "Question component requires 'text' field"
        
        if "type" not in config:
            return False, "Question component requires 'type' field"
            
        if config["type"] not in ["text", "multiple_choice", "checkboxes", "flag"]:
            return False, f"type must be one of: text, multiple_choice, checkboxes, flag (found: {config['type']})"
        
        # Further validation based on question type
        if config["type"] == "multiple_choice" or config["type"] == "checkboxes":
            if "options" not in config or not isinstance(config["options"], list):
                return False, f"{config['type']} question requires 'options' array"
    
    # All validations passed
    return True, None

# At the bottom of the file, add this to initialize the schema cache:
# Try to fetch schema on module load, but don't block initialization if it fails
try:
    success, loaded_schema = fetch_latest_schema()
    if success:
        CDF_SCHEMA = loaded_schema
        logger.info("Initialized with latest schema from instance manager")
    else:
        logger.warning("Using default CDF schema definitions")
except Exception as e:
    logger.error(f"Error during schema initialization: {e}")
    logger.warning("Using default CDF schema definitions") 