import logging
import os
import time
import zipfile  # For zip extraction
import tempfile  # For temporary directory
import shutil  # For directory cleanup
from flask import Flask, request, jsonify, send_from_directory
from prisma import Prisma
from dotenv import load_dotenv
import asyncio
from flask_cors import CORS
from datetime import datetime
import json
from enum import Enum
from typing import Optional, Dict, Any
from werkzeug.utils import secure_filename
import jsonschema  # For JSON schema validation
from prisma.models import Challenge, ChallengePack  # Import models for type hints

# Import schemas from schema.py
from schema import PACK_JSON_SCHEMA, CDF_SCHEMA, fetch_latest_schema


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

load_dotenv()  # Load environmental variables

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = '/tmp/pack_uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Example: Limit uploads to 16 MB
CORS(app)

# Get connection configuration from environment variables or use defaults
DB_CONNECTION_LIMIT = int(os.environ.get('DATABASE_CONNECTION_LIMIT', '5'))
DB_CONNECTION_RETRY_INTERVAL = int(os.environ.get('DATABASE_CONNECTION_RETRY_INTERVAL', '5'))
DB_CONNECTION_MAX_RETRIES = int(os.environ.get('DATABASE_CONNECTION_MAX_RETRIES', '10'))

# Use DIRECT_DATABASE_URL if available, otherwise fall back to DATABASE_URL
direct_database_url = os.environ.get('DIRECT_DATABASE_URL')
pooled_database_url = os.environ.get('DATABASE_URL')
database_url = direct_database_url or pooled_database_url

if database_url:
    logger.info("Using database URL from environment variables")

    # Check if we're using PgBouncer and log warning if it's the primary URL
    if 'pgbouncer:6432' in database_url:
        if direct_database_url:
            logger.info("Using direct PostgreSQL connection")
        else:
            logger.warning(
                "Using PgBouncer connection pool in the DATABASE_URL. This may cause issues with Prisma schema operations.")
            logger.warning("Consider setting DIRECT_DATABASE_URL to point directly to PostgreSQL.")
else:
    logger.warning("No database URL found in environment variables")

# Initialize Prisma with database_url
prisma = None
try:
    # First try with direct connection if available
    if direct_database_url:
        logger.info("Attempting to connect with direct PostgreSQL URL")
        prisma = Prisma(datasource={'url': direct_database_url})
    else:
        # If no direct URL available, use the pooled URL
        logger.info("No direct URL available, using pooled connection")
        prisma = Prisma(datasource={'url': database_url})
except Exception as e:
    # If direct connection fails and we have a pooled URL that's different, try that as fallback
    if direct_database_url and pooled_database_url and direct_database_url != pooled_database_url:
        logger.warning(f"Direct database connection failed: {str(e)}")
        logger.info("Falling back to pooled connection via PgBouncer")
        try:
            prisma = Prisma(datasource={'url': pooled_database_url})
        except Exception as fallback_error:
            logger.error(f"Fallback connection also failed: {str(fallback_error)}")
            raise
    else:
        logger.error(f"Database connection failed: {str(e)}")
        raise

# Track connection state
connection_state = {
    "is_connected": False,
    "last_connected": None,
    "reconnect_attempts": 0,
    "last_error": None
}

# Create an event loop
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# Define upload folder and allowed extensions (adjust as needed)
UPLOAD_FOLDER = '/tmp/pack_uploads'
ALLOWED_EXTENSIONS = {'zip'}


# Helper function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Ensure the upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# Function to connect to the database with retry logic
def connect_to_database():
    global connection_state

    connection_state["reconnect_attempts"] += 1
    try:
        loop.run_until_complete(prisma.connect())
        connection_state["is_connected"] = True
        connection_state["last_connected"] = datetime.now()
        connection_state["last_error"] = None
        connection_state["reconnect_attempts"] = 0
        logger.info("Successfully connected to database")
        return True
    except Exception as e:
        connection_state["is_connected"] = False
        connection_state["last_error"] = str(e)
        logger.error(f"Failed to connect to database: {str(e)}")
        return False


# Initial connection attempt
connect_to_database()


# Function to ensure database connection is active
def ensure_database_connection():
    global connection_state

    # If we're already connected, just return
    if prisma.is_connected:
        return True

    # If we've exceeded max retries, raise an exception
    if connection_state["reconnect_attempts"] > DB_CONNECTION_MAX_RETRIES:
        logger.error(f"Exceeded maximum reconnection attempts ({DB_CONNECTION_MAX_RETRIES})")
        return False

    # Try to reconnect
    logger.info(
        f"Database connection lost. Attempting to reconnect (attempt {connection_state['reconnect_attempts'] + 1}/{DB_CONNECTION_MAX_RETRIES})...")

    # Wait before reconnecting
    time.sleep(DB_CONNECTION_RETRY_INTERVAL)

    # Try to reconnect
    return connect_to_database()


# Helper function for safely logging activities
async def safe_log_activity(log_data):
    """
    Safely log an activity with error handling to prevent pod crashes.

    Args:
        log_data (dict): The activity log data to be saved

    Returns:
        tuple: (success, result_or_error)
            - success (bool): Whether the logging was successful
            - result_or_error: The activity log object if successful, or error message if failed
    """
    logger.info("===== SAFE LOG ACTIVITY: Starting =====")
    logger.info(f"Input log_data: {json.dumps(log_data, default=str)}")

    # Ensure database connection before proceeding
    if not ensure_database_connection():
        logger.error("Database connection unavailable")
        return False, "Database connection unavailable"

    # Convert direct IDs to proper relation connections if needed
    updated_log_data = log_data.copy()
    logger.info("Processing data transformations")

    # Handle user relation - remove userId when adding the relation
    if 'userId' in updated_log_data and 'user' not in updated_log_data:
        user_id = updated_log_data.pop('userId')  # Important: remove userId
        logger.info(f"Removed userId: {user_id} from direct fields")
        updated_log_data['user'] = {
            'connect': {
                'id': user_id
            }
        }
        logger.info(f"Added user.connect relation with id: {user_id}")
    else:
        if 'userId' in updated_log_data:
            logger.info(f"userId exists in data: {updated_log_data['userId']}")
        if 'user' in updated_log_data:
            logger.info(f"user relation exists in data: {json.dumps(updated_log_data['user'], default=str)}")

    # Handle other relations
    relation_mappings = {
        'challengeId': 'challenge',
        'groupId': 'group',
        'challengeInstanceId': 'challengeInstance',
        'accessCodeId': 'accessCode'
    }

    for id_field, relation_field in relation_mappings.items():
        if id_field in updated_log_data and relation_field not in updated_log_data:
            field_id = updated_log_data.pop(id_field)
            logger.info(f"Removed {id_field}: {field_id} from direct fields")
            updated_log_data[relation_field] = {
                'connect': {
                    'id': field_id
                }
            }
            logger.info(f"Added {relation_field}.connect relation with id: {field_id}")

    # Convert metadata to JSON string if it's a dict
    if 'metadata' in updated_log_data:
        logger.info(f"Processing metadata of type: {type(updated_log_data['metadata']).__name__}")
        if isinstance(updated_log_data['metadata'], dict):
            logger.info(
                f"Converting dict metadata to JSON string: {json.dumps(updated_log_data['metadata'], default=str)[:200]}")
            updated_log_data['metadata'] = json.dumps(updated_log_data['metadata'])
        elif isinstance(updated_log_data['metadata'], str):
            logger.info(f"Metadata is already a string: {updated_log_data['metadata'][:200]}")
            try:
                # Validate JSON format
                json.loads(updated_log_data['metadata'])
                logger.info("Metadata string is valid JSON")
            except json.JSONDecodeError as e:
                logger.warning(f"Metadata string is not valid JSON: {e}")
                # Wrap the invalid JSON in a valid JSON object
                updated_log_data['metadata'] = json.dumps({'invalidJson': updated_log_data['metadata']})
                logger.info("Wrapped invalid JSON in a valid JSON object")
    elif 'metadata' not in updated_log_data:
        logger.info("No metadata in log data, adding empty JSON object")
        updated_log_data['metadata'] = '{}'  # Empty JSON object as string

    logger.info(f"Final updated_log_data after transformations: {json.dumps(updated_log_data, default=str)}")

    try:
        activity_log = await prisma.activitylog.create(
            data=updated_log_data
        )
        logger.info(f"Activity log created successfully with ID: {activity_log.id}")
        logger.info(f"Activity logged successfully: {updated_log_data.get('eventType')}")
        logger.info("===== SAFE LOG ACTIVITY: Completed Successfully =====")
        return True, activity_log
    except Exception as e:
        error_str = str(e)

        # Check if this is a connection error
        if "connection" in error_str.lower() or "closed" in error_str.lower():
            # Try to reconnect
            if ensure_database_connection():
                # Retry the operation
                try:
                    activity_log = await prisma.activitylog.create(
                        data=updated_log_data
                    )
                    logger.info(f"Activity logged successfully after reconnection: {updated_log_data.get('eventType')}")
                    return True, activity_log
                except Exception as retry_error:
                    logger.error(f"Failed to log activity after reconnection: {str(retry_error)}")
                    return False, f"Failed to log activity after reconnection: {str(retry_error)}"
            else:
                return False, "Failed to reconnect to database"

        # Check for enum-related errors
        if "invalid input value for enum" in error_str and "ActivityEventType" in error_str:
            logger.warning(
                f"Enum mismatch error for event type '{updated_log_data.get('eventType')}'. Using SYSTEM_ERROR as fallback.")

            # Try again with SYSTEM_ERROR as event type and include the original event in metadata
            try:
                original_event = updated_log_data.get('eventType')
                updated_log_data['eventType'] = 'SYSTEM_ERROR'

                # Ensure metadata is a dictionary
                current_metadata = updated_log_data.get('metadata')
                if current_metadata is None:
                    new_metadata = {}
                elif isinstance(current_metadata, dict):
                    new_metadata = current_metadata.copy()
                else:
                    # If metadata is a string or other non-dict type, store it as a value
                    new_metadata = {'original_metadata': str(current_metadata)}

                # Add the error information to metadata
                new_metadata['original_event_type'] = original_event
                new_metadata['error'] = error_str
                updated_log_data['metadata'] = new_metadata

                activity_log = await prisma.activitylog.create(
                    data=updated_log_data
                )

                logger.info(f"Activity logged as SYSTEM_ERROR instead of {original_event}")
                return True, activity_log
            except Exception as fallback_error:
                logger.error(f"Fallback logging also failed: {str(fallback_error)}")
                return False, f"Failed to log activity even with fallback mechanism: {str(fallback_error)}"

        # Handle other Prisma errors
        logger.error(f"Database error while logging activity: {error_str}")
        return False, f"Database error while logging activity: {error_str}"


# Health check endpoint for Kubernetes probes
@app.route('/status', methods=['GET'])
def health_check():
    """
    Simple health check endpoint for Kubernetes liveness and readiness probes.
    Returns a 200 OK response with a status message.
    """
    try:
        # Check if database connection is active
        db_status = "connected" if prisma.is_connected else "disconnected"

        # If disconnected, try to reconnect but don't fail the health check
        if not prisma.is_connected:
            logger.warning("Database disconnected during health check, attempting to reconnect")
            ensure_database_connection()
            # Update status after reconnection attempt
            db_status = "connected" if prisma.is_connected else "disconnected"

        response_data = {
            "status": "ok",
            "message": "Database API is running",
            "database": db_status,
            "timestamp": datetime.now().isoformat()
        }

        # Add connection state information
        response_data["connection_info"] = {
            "last_connected": connection_state["last_connected"].isoformat() if connection_state[
                "last_connected"] else None,
            "reconnect_attempts": connection_state["reconnect_attempts"],
            "last_error": connection_state["last_error"]
        }

        return jsonify(response_data), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Health check failed: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }), 500


# Detailed health check endpoint with PostgreSQL metrics
@app.route('/health/detailed', methods=['GET'])
def detailed_health_check():
    """
    Detailed health check endpoint that provides comprehensive information about the PostgreSQL database.
    Returns database metrics, connection status, and performance information.
    """
    try:
        # Check if database connection is active
        db_status = "connected" if prisma.is_connected else "disconnected"

        # If disconnected, try to reconnect
        if not prisma.is_connected:
            logger.warning("Database disconnected during detailed health check, attempting to reconnect")
            ensure_database_connection()
            # Update status after reconnection attempt
            db_status = "connected" if prisma.is_connected else "disconnected"

        # Initialize response data
        response_data = {
            "status": "ok" if prisma.is_connected else "error",
            "message": "Database API is running and connected to PostgreSQL" if prisma.is_connected else "Database API is running but disconnected from PostgreSQL",
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
            "version": "Unknown",  # Will be populated if available
            "uptime": "Unknown",  # Will be populated if available
            "connections": {
                "current": 0,
                "max": 0,
                "utilization_percent": 0
            },
            "performance": {
                "query_latency_ms": None,
                "transaction_latency_ms": None
            },
            "storage": {
                "database_size_mb": 0,
                "free_space_mb": 0
            }
        }

        # Add connection state information
        response_data["connection_info"] = {
            "last_connected": connection_state["last_connected"].isoformat() if connection_state[
                "last_connected"] else None,
            "reconnect_attempts": connection_state["reconnect_attempts"],
            "last_error": connection_state["last_error"]
        }

        # If connected, fetch detailed PostgreSQL metrics
        if prisma.is_connected:
            try:
                # Initialize metrics collection with default values
                response_data["metrics_errors"] = []

                # Get PostgreSQL version - we need to use raw SQL for system queries
                version_query = "SELECT version();"
                version_result = loop.run_until_complete(prisma.query_raw(version_query))
                if version_result and isinstance(version_result, list) and len(version_result) > 0:
                    full_version = version_result[0].get("version", "Unknown")
                    # Extract just the PostgreSQL version number (e.g., "PostgreSQL 17.4")
                    if full_version.startswith("PostgreSQL"):
                        version_parts = full_version.split()
                        if len(version_parts) >= 2:
                            response_data["version"] = f"PostgreSQL {version_parts[1]}"
                        else:
                            response_data["version"] = "PostgreSQL"
                    else:
                        response_data["version"] = full_version

                # Get PostgreSQL uptime - we need to use raw SQL for system queries
                uptime_query = "SELECT EXTRACT(EPOCH FROM (current_timestamp - pg_postmaster_start_time()))::integer as uptime_seconds;"
                uptime_result = loop.run_until_complete(prisma.query_raw(uptime_query))
                if uptime_result and isinstance(uptime_result, list) and len(uptime_result) > 0:
                    uptime_seconds = int(uptime_result[0].get("uptime_seconds", 0))
                    days = uptime_seconds // (24 * 3600)
                    hours = (uptime_seconds % (24 * 3600)) // 3600
                    minutes = (uptime_seconds % 3600) // 60
                    seconds = uptime_seconds % 60
                    response_data["uptime"] = f"{days}d {hours}h {minutes}m {seconds}s"

                # Get connection information - we need to use raw SQL for system queries
                connections_query = """
                SELECT 
                    count(*) as current_connections,
                    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
                FROM pg_stat_activity;
                """
                connections_result = loop.run_until_complete(prisma.query_raw(connections_query))
                if connections_result and isinstance(connections_result, list) and len(connections_result) > 0:
                    current = int(connections_result[0].get("current_connections", 0))
                    max_conn = int(connections_result[0].get("max_connections", 0))
                    response_data["connections"] = {
                        "current": current,
                        "max": max_conn,
                        "utilization_percent": round((current / max_conn) * 100, 2) if max_conn > 0 else 0
                    }

                # Get database size information - we need to use raw SQL for system queries
                size_query = """
                SELECT
                    pg_database_size(current_database())::bigint as db_size,
                    pg_size_pretty(pg_database_size(current_database())) as pretty_size;
                """
                size_result = loop.run_until_complete(prisma.query_raw(size_query))
                if size_result and isinstance(size_result, list) and len(size_result) > 0:
                    db_size_bytes = int(size_result[0].get("db_size", 0))
                    response_data["storage"] = {
                        "database_size_mb": round(db_size_bytes / (1024 * 1024), 2),
                        "pretty_size": size_result[0].get("pretty_size", "0 bytes")
                    }

                # Measure query performance using Prisma
                start_time = time.time()
                # Use a simple Prisma operation instead of raw SQL
                try:
                    # Try to find a user (any user) - this is a simple query operation
                    loop.run_until_complete(prisma.user.find_first())
                except:
                    # If no users exist, just do a count operation
                    loop.run_until_complete(prisma.user.count())
                query_time = (time.time() - start_time) * 1000  # Convert to milliseconds

                # Measure transaction performance
                # For transactions, we still need to use raw SQL as Prisma doesn't expose direct transaction timing
                start_time = time.time()
                loop.run_until_complete(prisma.query_raw("BEGIN;"))
                loop.run_until_complete(prisma.query_raw("SELECT 1;"))
                loop.run_until_complete(prisma.query_raw("COMMIT;"))
                transaction_time = (time.time() - start_time) * 1000  # Convert to milliseconds

                response_data["performance"] = {
                    "query_latency_ms": round(query_time, 2),
                    "transaction_latency_ms": round(transaction_time, 2)
                }

                # Get table statistics
                try:
                    # Check for expected tables based on our Prisma schema
                    # Try to find key tables that should exist in our schema
                    expected_tables = ["User", "ChallengeInstance", "Challenge", "ActivityLog", "ChallengePack"]
                    existing_tables = []
                    missing_tables = []

                    # This currently can cause some issues with thinking a table does not exsist if it does not have any entries yet

                    # Use Prisma's introspection capabilities to check for tables
                    for table in expected_tables:
                        try:
                            # For each table, try a simple count query to see if it exists
                            # This is more reliable than checking information_schema which might have case sensitivity issues
                            if table == "User":
                                count = loop.run_until_complete(prisma.user.count())
                                existing_tables.append("User")
                            elif table == "ChallengeInstance":
                                count = loop.run_until_complete(prisma.challengeinstance.count())
                                existing_tables.append("ChallengeInstance")
                            elif table == "Challenge":
                                count = loop.run_until_complete(prisma.challenge.count())
                                existing_tables.append("Challenge")
                            elif table == "ActivityLog":
                                count = loop.run_until_complete(prisma.activitylog.count())
                                existing_tables.append("ActivityLog")
                            elif table == "ChallengePack":
                                count = loop.run_until_complete(prisma.challengepack.count())
                                existing_tables.append("ChallengePack")
                        except Exception as table_error:
                            # If the query fails, the table likely doesn't exist
                            missing_tables.append(table)
                            logger.debug(f"Table {table} check failed: {str(table_error)}")

                    # Determine migration status based on existing tables
                    if len(existing_tables) == len(expected_tables):
                        # All expected tables exist
                        # Get detailed table statistics - we need to use raw SQL for this
                        tables_query = """
                        SELECT 
                            schemaname, 
                            relname as table_name, 
                            n_live_tup as row_count,
                            pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as table_size
                        FROM pg_stat_user_tables
                        ORDER BY n_live_tup DESC
                        LIMIT 10;
                        """
                        tables_result = loop.run_until_complete(prisma.query_raw(tables_query))
                        if tables_result and isinstance(tables_result, list):
                            response_data["tables"] = tables_result

                            # Add a more user-friendly message
                            response_data[
                                "tables_info"] = "Database schema is fully applied and all expected tables are present."
                    elif len(existing_tables) > 0:
                        # Some tables exist but not all
                        response_data["tables"] = []
                        response_data[
                            "tables_info"] = f"Database partially migrated. Missing tables: {', '.join(missing_tables)}"
                    else:
                        # No expected tables exist
                        response_data["tables"] = []
                        response_data["tables_info"] = "Database schema not yet applied. No expected tables found."

                    # Add information about which tables were found
                    if existing_tables:
                        logger.info(f"Found tables: {', '.join(existing_tables)}")
                        if "tables_info" not in response_data:
                            response_data["tables_info"] = f"Found tables: {', '.join(existing_tables)}"

                except Exception as table_error:
                    # Handle table statistics errors separately to not fail the entire health check
                    logger.warning(f"Error fetching table statistics: {str(table_error)}")
                    response_data["tables"] = []
                    response_data["tables_error"] = str(table_error)

            except Exception as db_error:
                logger.error(f"Error fetching detailed PostgreSQL metrics: {str(db_error)}")
                response_data["metrics_error"] = str(db_error)

        return jsonify(response_data), 200 if prisma.is_connected else 503
    except Exception as e:
        logger.error(f"Detailed health check failed: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Detailed health check failed: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }), 500


# Define the ActivityEventType enum to match Prisma schema
class ActivityEventType(str, Enum):
    CHALLENGE_STARTED = "CHALLENGE_STARTED"
    CHALLENGE_COMPLETED = "CHALLENGE_COMPLETED"
    GROUP_JOINED = "GROUP_JOINED"
    GROUP_CREATED = "GROUP_CREATED"
    GROUP_LEFT = "GROUP_LEFT"
    GROUP_DELETED = "GROUP_DELETED"
    GROUP_UPDATED = "GROUP_UPDATED"
    GROUP_MEMBER_REMOVED = "GROUP_MEMBER_REMOVED"
    ACCESS_CODE_GENERATED = "ACCESS_CODE_GENERATED"
    ACCESS_CODE_USED = "ACCESS_CODE_USED"
    ACCESS_CODE_EXPIRED = "ACCESS_CODE_EXPIRED"
    ACCESS_CODE_DELETED = "ACCESS_CODE_DELETED"
    USER_REGISTERED = "USER_REGISTERED"
    USER_LOGGED_IN = "USER_LOGGED_IN"
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"
    CHALLENGE_INSTANCE_CREATED = "CHALLENGE_INSTANCE_CREATED"
    CHALLENGE_INSTANCE_DELETED = "CHALLENGE_INSTANCE_DELETED"
    CHALLENGE_INSTANCE_UPDATED = "CHALLENGE_INSTANCE_UPDATED"
    QUESTION_ATTEMPTED = "QUESTION_ATTEMPTED"
    QUESTION_COMPLETED = "QUESTION_COMPLETED"
    SYSTEM_ERROR = "SYSTEM_ERROR"
    CHALLENGE_PACK_INSTALLED = "CHALLENGE_PACK_INSTALLED"
    ACCESS_CODE_INVALID = "ACCESS_CODE_INVALID"

    @classmethod
    def get_all_values(cls):
        """Return a list of all enum values"""
        return [e.value for e in cls]


# Define the LogSeverity enum to match Prisma schema
class LogSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@app.route('/activity/log', methods=['POST'])
def log_activity():
    data = request.json

    # Validate required fields
    if not data.get('eventType') or not data.get('userId'):
        logger.warning("Missing required fields in activity log request")
        return jsonify({'error': 'eventType and userId are required'}), 400

    try:
        # Ensure user exists (required by foreign key constraint)
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': data['userId']}
        ))

        if not user:
            # Create a temporary user if not found
            try:
                user = loop.run_until_complete(prisma.user.create(
                    data={
                        'id': data['userId'],
                        'email': f"temp_{data['userId']}@example.com",
                        'role': 'STUDENT'
                    }
                ))
            except Exception as e:
                if "Unique constraint failed" in str(e):
                    # User was created by another process
                    pass
                else:
                    logger.error(f"Failed to create user: {str(e)}")
                    return jsonify({'error': f"Failed to create user: {str(e)}"}), 500

        # Prepare a clean activity log entry
        log_data = {
            'eventType': data['eventType'],
            'severity': data.get('severity', 'INFO'),
            # Connect the user relation properly - do not include userId directly
            'user': {
                'connect': {
                    'id': data['userId']
                }
            }
        }

        # Copy other valid fields
        if 'details' in data:
            log_data['details'] = data['details']

        if 'metadata' in data:
            # Metadata must be JSON string in database
            if isinstance(data['metadata'], dict):
                log_data['metadata'] = json.dumps(data['metadata'])
            else:
                log_data['metadata'] = data['metadata']

        # For relations, convert from ID to proper connect syntax
        relation_mappings = {
            'challengeId': 'challenge',
            'groupId': 'group',
            'challengeInstanceId': 'challengeInstance',
            'accessCodeId': 'accessCode'
        }

        for id_field, relation_field in relation_mappings.items():
            if id_field in data:
                log_data[relation_field] = {
                    'connect': {
                        'id': data[id_field]
                    }
                }

        # Create the log entry
        try:
            log_entry = loop.run_until_complete(prisma.activitylog.create(
                data=log_data
            ))
            return jsonify({
                'id': log_entry.id,
                'timestamp': log_entry.timestamp.isoformat()
            })
        except Exception as e:
            # If direct create fails, try the safe helper
            success, result = loop.run_until_complete(safe_log_activity(log_data))
            if success:
                return jsonify({
                    'id': result.id,
                    'timestamp': result.timestamp.isoformat()
                })
            else:
                return jsonify({'error': f"Failed to log activity: {result}"}), 500

    except Exception as e:
        logger.error(f"Error in activity/log: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/add_points', methods=['POST'])
def add_points():
    data = request.json
    user_id = data.get('user_id')
    group_id = data.get('group_id')
    points = data.get('points')

    logger.debug(f"Received points update request: {points} points for user {user_id} in group {group_id}")

    if not user_id or not group_id or not points:
        logger.warning("Missing required fields in add_points request")
        return jsonify({'error': 'user_id, group_id, and points are required'}), 400

    try:
        # Check if the user exists and is a member of the group
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id},
            include={
                'memberOf': {
                    'where': {'id': group_id}
                }
            }
        ))

        if not user:
            logger.warning(f"User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404

        if not user.memberOf:
            logger.warning(f"User {user_id} is not a member of group {group_id}")
            return jsonify({'error': 'User is not a member of this group'}), 403

        # Get current points
        group_points = loop.run_until_complete(prisma.grouppoints.find_unique(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            }
        ))

        # Calculate new points
        new_points = (group_points.points if group_points else 0) + points

        # Update or create points record
        updated_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            },
            create={
                'userId': user_id,
                'groupId': group_id,
                'points': new_points
            },
            update={
                'points': new_points
            }
        ))
        logger.info(
            f"Points updated successfully: User {user_id} now has {updated_points.points} points in group {group_id}")
        return jsonify(updated_points.dict())
    except Exception as e:
        logger.error(f"Failed to update points: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/set_points', methods=['POST'])
def set_points():
    data = request.json
    user_id = data.get('user_id')
    group_id = data.get('group_id')
    points = data.get('points')

    if not user_id or not group_id or points is None:
        return jsonify({'error': 'user_id, group_id, and points are required'}), 400

    try:
        # Check if the user exists and is a member of the group
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id},
            include={
                'memberOf': {
                    'where': {'id': group_id}
                }
            }
        ))

        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not user.memberOf:
            return jsonify({'error': 'User is not a member of this group'}), 403

        # Update or create points record
        updated_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            },
            create={
                'userId': user_id,
                'groupId': group_id,
                'points': points
            },
            update={
                'points': points
            }
        ))

        return jsonify(updated_points.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get_points', methods=['GET'])
def get_points():
    user_id = request.args.get('user_id')
    group_id = request.args.get('group_id')

    if not user_id or not group_id:
        return jsonify({'error': 'user_id and group_id are required'}), 400

    try:
        group_points = loop.run_until_complete(prisma.grouppoints.find_unique(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            }
        ))

        if group_points:
            return jsonify({'points': group_points.points})
        else:
            return jsonify({'points': 0})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get_challenge_instance', methods=['GET'])
def get_challenge_instance():
    challenge_instance_id = request.args.get('challenge_instance_id')

    if not challenge_instance_id:
        return jsonify({'error': 'challenge_instance_id is required'}), 400

    try:
        # First get the challenge instance
        challenge_instance = loop.run_until_complete(prisma.challengeinstance.find_unique(
            where={'id': challenge_instance_id},
            include={'user': True}  # Include user information
        ))

        if not challenge_instance:
            return jsonify({'error': 'Challenge instance not found'}), 404

        challenge_instance_dict = challenge_instance.dict()
        logger.info(f"Found challenge instance: {challenge_instance_dict}")

        # Get the challenge details to ensure we have the correct ID
        challenge = None
        try:
            challenge = loop.run_until_complete(prisma.challenge.find_unique(
                where={'id': challenge_instance_dict['challengeId']}
            ))
            
            if challenge:
                logger.info(f"Found challenge with ID: {challenge.id}")
                # Use the database challenge ID rather than any derived one
                challenge_instance_dict['challengeId'] = challenge.id
            else:
                logger.warning(f"Challenge not found for ID: {challenge_instance_dict['challengeId']}")
                
                # Try to find the challenge by matching a formatted ID if not found directly
                formatted_id = challenge_instance_dict['challengeId']
                
                # If it looks like a formatted name (e.g. "Bandit-Level-1"), try to convert to ID format
                if '-' in formatted_id and any(c.isupper() for c in formatted_id):
                    possible_id = formatted_id.lower().replace('-level-', '-')
                    possible_id = possible_id.replace('level-', '')
                    
                    try:
                        logger.info(f"Trying to find challenge with converted ID: {possible_id}")
                        challenge = loop.run_until_complete(prisma.challenge.find_unique(
                            where={'id': possible_id}
                        ))
                        
                        if challenge:
                            logger.info(f"Found challenge with converted ID: {challenge.id}")
                            challenge_instance_dict['challengeId'] = challenge.id
                    except Exception as convert_error:
                        logger.error(f"Error finding challenge with converted ID: {str(convert_error)}", exc_info=True)
        except Exception as challenge_error:
            logger.error(f"Error finding challenge: {str(challenge_error)}", exc_info=True)
            # Continue without challenge data

        # Get the groupId - critical for WebOS functionality
        groupId = None
        # First try to get from competitionId (preferred and correct field from schema)
        if challenge_instance_dict.get('competitionId'):
            groupId = challenge_instance_dict['competitionId']
            logger.info(f"Using competitionId as groupId: {groupId}")
        # Then try fallback values if needed
        elif challenge_instance_dict.get('groupId'):
            groupId = challenge_instance_dict['groupId']
            logger.info(f"Using groupId field directly: {groupId}")
        else:
            # Last resort - use a default group ID
            groupId = 'default-group'
            logger.warning(f"Challenge instance {challenge_instance_id} has no competitionId, using default: {groupId}")

        # Find the group challenge for this instance using the correct groupId
        group_challenge = None
        try:
            group_challenge = loop.run_until_complete(prisma.groupchallenge.find_first(
                where={
                    'challengeId': challenge_instance_dict['challengeId'],
                    'groupId': groupId
                }
            ))
            
            if group_challenge:
                logger.info(f"Found group challenge: {group_challenge.id}")
            else:
                logger.warning(f"GroupChallenge not found with challengeId={challenge_instance_dict['challengeId']} and groupId={groupId}")
                
                # If no group challenge found with the exact IDs, try to find any that might match
                all_group_challenges = loop.run_until_complete(prisma.groupchallenge.find_many(
                    where={
                        'groupId': groupId
                    }
                ))
                
                if all_group_challenges:
                    logger.info(f"Found {len(all_group_challenges)} group challenges for groupId={groupId}")
                    
                    # Try to find a match with similar challenge ID
                    challenge_id = challenge_instance_dict['challengeId'].lower()
                    
                    for gc in all_group_challenges:
                        gc_challenge_id = gc.challengeId.lower()
                        
                        # Strip out "level" and compare
                        clean_instance_id = challenge_id.replace('level', '').replace('-', '')
                        clean_gc_id = gc_challenge_id.replace('level', '').replace('-', '')
                        
                        if clean_instance_id == clean_gc_id or challenge_id in gc_challenge_id or gc_challenge_id in challenge_id:
                            group_challenge = gc
                            logger.info(f"Found matching group challenge with similar ID: {gc.id} (ChallengeId: {gc.challengeId})")
                            break
        except Exception as group_error:
            logger.error(f"Error finding group challenge: {str(group_error)}", exc_info=True)
            # Continue without group challenge data

        # Create response with only needed data for WebOS config
        response_data = {
            'id': challenge_instance_dict['id'],
            'challengeId': challenge_instance_dict['challengeId'],
            'userId': challenge_instance_dict['userId'],
            'challengeUrl': challenge_instance_dict['challengeUrl'],
            'status': challenge_instance_dict['status'],
            'flagSecretName': challenge_instance_dict['flagSecretName'],
            'flag': challenge_instance_dict['flag'],
            'user': challenge_instance_dict['user'],
            'groupChallengeId': group_challenge.id if group_challenge else None,
            'groupId': groupId  # Use the correct group ID
        }

        return jsonify(response_data)
    except Exception as e:
        logger.error(f"Error retrieving challenge instance: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


# Competition Group Endpoints

@app.route('/competition/create', methods=['POST'])
def create_competition():
    data = request.json
    try:
        competition = loop.run_until_complete(prisma.competitiongroup.create(
            data={
                'name': data['name'],
                'description': data.get('description'),
                'startDate': datetime.fromisoformat(data['startDate']),
                'endDate': datetime.fromisoformat(data['endDate']) if data.get('endDate') else None,
                'instructors': {
                    'connect': [{'id': instructor_id} for instructor_id in data['instructorIds']]
                }
            }
        ))
        return jsonify(competition.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/join', methods=['POST'])
def join_competition():
    data = request.json
    try:
        # Verify access code
        access_code = loop.run_until_complete(prisma.competitionaccesscode.find_first(
            where={
                'code': data['code'],
                'OR': [
                    {'expiresAt': None},
                    {'expiresAt': {'gt': datetime.now()}}
                ],
                'AND': [
                    {'maxUses': None},
                    {'OR': [
                        {'maxUses': None},
                        {'usedCount': {'lt': prisma.competitionaccesscode.maxUses}}
                    ]}
                ]
            }
        ))

        if not access_code:
            return jsonify({'error': 'Invalid or expired access code'}), 400

        # Add user to competition group
        competition = loop.run_until_complete(prisma.competitiongroup.update(
            where={'id': access_code.groupId},
            data={
                'members': {
                    'connect': [{'id': data['userId']}]
                }
            },
            include={
                'challenges': True
            }
        ))

        # Increment access code usage
        loop.run_until_complete(prisma.competitionaccesscode.update(
            where={'id': access_code.id},
            data={
                'usedCount': {'increment': 1}
            }
        ))

        # Log the event using safe helper
        log_data = {
            'eventType': 'GROUP_JOINED',
            'severity': 'INFO',
            'userId': data['userId'],
            'groupId': competition.id,
            'metadata': {'accessCode': data['code']}
        }
        success, _ = loop.run_until_complete(safe_log_activity(log_data))
        if not success:
            logger.warning(f"Failed to log GROUP_JOINED activity, but continuing with operation")

        return jsonify(competition.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/generate-code', methods=['POST'])
def generate_access_code():
    data = request.json
    try:
        access_code = loop.run_until_complete(prisma.competitionaccesscode.create(
            data={
                'code': data['code'],
                'groupId': data['groupId'],
                'createdBy': data['createdBy'],
                'expiresAt': datetime.fromisoformat(data['expiresAt']) if data.get('expiresAt') else None,
                'maxUses': data.get('maxUses')
            }
        ))

        # Log the event using safe helper
        log_data = {
            'eventType': 'ACCESS_CODE_GENERATED',
            'severity': 'INFO',
            'userId': data['createdBy'],
            'groupId': data['groupId'],
            'accessCodeId': access_code.id,
            'metadata': {'code': data['code']}
        }
        success, _ = loop.run_until_complete(safe_log_activity(log_data))
        if not success:
            logger.warning(f"Failed to log ACCESS_CODE_GENERATED activity, but continuing with operation")

        return jsonify(access_code.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/add-challenge', methods=['POST'])
def add_competition_challenge():
    data = request.json
    try:
        group_challenge = loop.run_until_complete(prisma.groupchallenge.create(
            data={
                'points': data['points'],
                'challengeId': data['challengeId'],
                'groupId': data['groupId']
            }
        ))
        return jsonify(group_challenge.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/complete-challenge', methods=['POST'])
def complete_challenge():
    data = request.json
    try:
        # Create challenge completion record
        completion = loop.run_until_complete(prisma.challengecompletion.create(
            data={
                'userId': data['userId'],
                'groupChallengeId': data['groupChallengeId'],
                'pointsEarned': data['pointsEarned']
            }
        ))

        # Update group points
        loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': data['userId'],
                    'groupId': data['groupId']
                }
            },
            create={
                'userId': data['userId'],
                'groupId': data['groupId'],
                'points': data['pointsEarned']
            },
            update={
                'points': {
                    'increment': data['pointsEarned']
                }
            }
        ))

        # Log the event using safe helper
        log_data = {
            'eventType': 'CHALLENGE_COMPLETED',
            'severity': 'INFO',
            'userId': data['userId'],
            'challengeId': data['challengeId'],
            'groupId': data['groupId'],
            'metadata': {
                'pointsEarned': data['pointsEarned'],
                'completionTime': completion.completedAt.isoformat()
            }
        }
        # Use loop.run_until_complete to run the async function from a non-async context
        success, _ = loop.run_until_complete(safe_log_activity(log_data))
        if not success:
            logger.warning(f"Failed to log CHALLENGE_COMPLETED activity, but continuing with operation")

        return jsonify(completion.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/<group_id>/leaderboard', methods=['GET'])
def get_leaderboard(group_id):
    try:
        # Get all points for the competition group
        group_points = loop.run_until_complete(prisma.grouppoints.find_many(
            where={
                'groupId': group_id
            },
            include={
                'user': True
            },
            order_by={
                'points': 'desc'
            }
        ))

        # Format the leaderboard response
        leaderboard = [{
            'userId': points.userId,
            'name': points.user.name,
            'points': points.points,
            'completions': 0  # We'll update this in the next step
        } for points in group_points]

        # Get completion counts for each user
        for entry in leaderboard:
            completions = loop.run_until_complete(prisma.challengecompletion.count(
                where={
                    'userId': entry['userId'],
                    'groupChallenge': {
                        'groupId': group_id
                    }
                }
            ))
            entry['completions'] = completions

        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/competition/<group_id>/progress/<user_id>', methods=['GET'])
def get_user_progress(group_id, user_id):
    try:
        # Get all challenges in the competition
        group_challenges = loop.run_until_complete(prisma.groupchallenge.find_many(
            where={'groupId': group_id},
            include={
                'challenge': True,
                'completions': {
                    'where': {
                        'userId': user_id
                    }
                }
            }
        ))

        progress = []
        total_points = 0
        earned_points = 0

        for challenge in group_challenges:
            challenge_dict = challenge.dict()
            is_completed = len(challenge_dict['completions']) > 0
            points_earned = challenge_dict['completions'][0]['pointsEarned'] if is_completed else 0

            progress.append({
                'challengeId': challenge_dict['challengeId'],
                'challengeName': challenge_dict['challenge']['name'],
                'points': challenge_dict['points'],
                'completed': is_completed,
                'pointsEarned': points_earned
            })

            total_points += challenge_dict['points']
            earned_points += points_earned

        return jsonify({
            'progress': progress,
            'totalPoints': total_points,
            'earnedPoints': earned_points,
            'completionPercentage': (len([p for p in progress if p['completed']]) / len(
                progress)) * 100 if progress else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/question/complete', methods=['POST'])
def complete_question():
    data = request.json
    user_id = data.get('user_id')
    question_id = data.get('question_id')
    group_challenge_id = data.get('group_challenge_id')
    points = data.get('points')

    if not all([user_id, question_id, group_challenge_id, points]):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        # Check if question is already completed
        existing_completion = loop.run_until_complete(prisma.questioncompletion.find_unique(
            where={
                'userId_questionId_groupChallengeId': {
                    'userId': user_id,
                    'questionId': question_id,
                    'groupChallengeId': group_challenge_id
                }
            }
        ))

        if existing_completion:
            return jsonify({'error': 'Question already completed'}), 400

        # Create completion record
        completion = loop.run_until_complete(prisma.questioncompletion.create(
            data={
                'userId': user_id,
                'questionId': question_id,
                'groupChallengeId': group_challenge_id,
                'pointsEarned': points
            }
        ))

        # Get group ID from group challenge
        group_challenge = loop.run_until_complete(prisma.groupchallenge.find_unique(
            where={'id': group_challenge_id},
            include={'group': True}
        ))

        if not group_challenge:
            return jsonify({'error': 'Group challenge not found'}), 404

        # Add points to user's competition total
        group_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_challenge.group.id
                }
            },
            data={
                'create': {
                    'userId': user_id,
                    'groupId': group_challenge.group.id,
                    'points': points
                },
                'update': {
                    'points': {
                        'increment': points
                    }
                }
            }
        ))

        return jsonify({
            'completion': completion.dict(),
            'points': group_points.dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/question/completed', methods=['GET'])
def get_completed_questions():
    user_id = request.args.get('user_id')
    group_challenge_id = request.args.get('group_challenge_id')

    if not user_id or not group_challenge_id:
        return jsonify({'error': 'user_id and group_challenge_id are required'}), 400

    try:
        completions = loop.run_until_complete(prisma.questioncompletion.find_many(
            where={
                'userId': user_id,
                'groupChallengeId': group_challenge_id
            }
        ))

        return jsonify({
            'completed_questions': [completion.dict() for completion in completions]
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/question/details', methods=['GET'])
def get_question_details():
    question_id = request.args.get('question_id')

    if not question_id:
        return jsonify({'error': 'question_id is required'}), 400

    try:
        question = loop.run_until_complete(prisma.challengequestion.find_unique(
            where={'id': question_id}
        ))

        if not question:
            return jsonify({'error': 'Question not found'}), 404

        return jsonify(question.dict())

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/challenge/details', methods=['GET'])
def get_challenge_details():
    challenge_id = request.args.get('challenge_id')
    logger.debug(f"Fetching challenge details for: {challenge_id}")

    if not challenge_id:
        logger.warning("Missing challenge_id in request")
        return jsonify({'error': 'challenge_id is required'}), 400

    try:
        challenge = loop.run_until_complete(prisma.challenge.find_unique(
            where={'id': challenge_id},
            include={
                'questions': {
                    'orderBy': {
                        'order': 'asc'
                    }
                },
                'challengeType': True,
                'appConfigs': True
            }
        ))

        if not challenge:
            logger.warning(f"Challenge not found: {challenge_id}")
            return jsonify({'error': 'Challenge not found'}), 404

        logger.info(f"Successfully retrieved challenge: {challenge_id}")
        challenge_dict = challenge.dict()
        return jsonify({
            'id': challenge_dict['id'],
            'name': challenge_dict['name'],
            'description': challenge_dict['description'],
            'type': challenge_dict['challengeType']['name'],
            'questions': challenge_dict['questions'],
            'appConfigs': challenge_dict['appConfigs']
        })
    except Exception as e:
        logger.error(f"Error fetching challenge details: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/challenge-instances/<instance_id>', methods=['PATCH'])
def update_challenge_instance(instance_id):
    """
    Update a challenge instance by ID
    Only allows updating specific fields like flagSecretName and flag
    """
    if not ensure_database_connection():
        return jsonify({"error": "Database connection unavailable"}), 500

    try:
        # Get the update data from request
        data = request.json
        logger.info(f"Updating challenge instance {instance_id} with data: {data}")

        # Create the update data dictionary with only allowed fields
        update_data = {}

        # Only allow updating specific fields
        if 'flagSecretName' in data:
            update_data['flagSecretName'] = data['flagSecretName']
            logger.info(f"Updating flagSecretName to: {data['flagSecretName']}")

        if 'flag' in data:
            update_data['flag'] = data['flag']
            logger.info(f"Updating flag to: {data['flag']}")

        if 'status' in data:
            update_data['status'] = data['status']
            logger.info(f"Updating status to: {data['status']}")

        if not update_data:
            return jsonify({"error": "No valid fields to update"}), 400

        # Perform the update
        updated_instance = loop.run_until_complete(
            prisma.challengeinstance.update(
                where={
                    'id': instance_id
                },
                data=update_data
            )
        )

        # Log the update
        safe_log_activity({
            'eventType': 'CHALLENGE_INSTANCE_UPDATED',
            'challengeInstanceId': instance_id,
            'severity': 'INFO',
            'metadata': {
                'updated_fields': list(update_data.keys()),
                'instance_id': instance_id
            }
        })

        return jsonify({
            "success": True,
            "message": f"Challenge instance {instance_id} updated successfully",
            "data": {
                "id": updated_instance.id,
                "flagSecretName": updated_instance.flagSecretName,
                "flag": updated_instance.flag,
                "status": updated_instance.status
            }
        })

    except Exception as e:
        logger.error(f"Error updating challenge instance {instance_id}: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error updating challenge instance: {str(e)}"
        }), 500


@app.route('/packs/upload', methods=['POST'])
async def upload_pack():
    # Initialize filename to None at the start
    filename = None
    temp_dir = None
    upload_path = None

    if 'file' not in request.files:
        logger.error("No file part in the request")
        return jsonify({'error': 'No file part in the request'}), 400

    file = request.files['file']

    if not file or not allowed_file(file.filename):
         logger.error(f"Invalid file type or missing file: {file.filename}")
         return jsonify({'error': 'Invalid file type or missing file. Only .zip allowed'}), 400

    # Assign filename after checks pass
    filename = secure_filename(file.filename)

    # temp_dir and upload_path are initialized above

    try:
        # Save the uploaded file temporarily
        # Ensure UPLOAD_FOLDER exists (optional, good practice)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        upload_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(upload_path)
        logger.info(f"Successfully saved uploaded pack file: {upload_path}")

        # --- Start Zip Processing ---
        manifest_data = None
        pack_json_entry = None
        pack_json_path_in_zip = None
        pack_json_base_dir = ""

        with zipfile.ZipFile(upload_path, 'r') as zip_ref:
            logger.info(f"Opened zip file: {filename}")

            # 1. Find pack.json flexibly
            for entry in zip_ref.infolist():
                if not entry.is_dir() and entry.filename.endswith('pack.json'):
                    pack_json_entry = entry
                    pack_json_path_in_zip = entry.filename
                    logger.info(f"Found pack.json at path inside zip: {pack_json_path_in_zip}")
                    break  # Found it

            if not pack_json_entry:
                logger.error(f"Validation Error for {filename}: pack.json not found anywhere within the zip archive.")
                return jsonify({'error': 'pack.json not found within zip archive'}), 400

            # Determine base directory
            path_parts = pack_json_path_in_zip.split('/')
            if len(path_parts) > 1:
                pack_json_base_dir = '/'.join(path_parts[:-1]) + '/'  # e.g., "folder/" or ""
            logger.info(f"Determined base directory within zip: '{pack_json_base_dir}'")

            # 2. Extract ONLY pack.json for validation
            temp_dir = tempfile.mkdtemp(prefix='pack_validate_')
            zip_ref.extract(pack_json_entry, path=temp_dir)
            extracted_manifest_path = os.path.join(temp_dir, pack_json_path_in_zip)
            logger.info(f"Extracted pack.json to: {extracted_manifest_path}")

            # 3. Load and Validate Manifest Schema
            try:
                with open(extracted_manifest_path, 'r') as f:
                    manifest_data = json.load(f)
                jsonschema.validate(instance=manifest_data, schema=PACK_JSON_SCHEMA)
                logger.info("pack.json schema validation successful.")
            except FileNotFoundError:
                logger.error(f"Failed to find extracted pack.json at {extracted_manifest_path}")
                return jsonify({'error': 'Internal error reading extracted pack.json'}), 500
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in pack.json: {str(e)}")
                return jsonify({'error': f'Invalid JSON in pack.json: {str(e)}'}), 400
            except jsonschema.ValidationError as e:
                logger.error(f"pack.json schema validation failed: {str(e)}")
                return jsonify({'error': f'pack.json schema validation failed: {e.message}'}), 400
            finally:
                # Clean up the temporary validation directory immediately
                if temp_dir and os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
                    logger.info(f"Cleaned up temporary validation directory: {temp_dir}")
                    temp_dir = None  # Reset temp_dir

            # 4. Validate Challenge Paths within Zip
            logger.info("Validating challenge file paths listed in manifest...")
            all_zip_entries = set(zip_ref.namelist())  # Use a set for faster lookups
            missing_challenges = []

            # Get latest CDF schema for validation
            logger.info("Fetching latest CDF schema for challenge validation")
            success, cdf_schema = fetch_latest_schema()
            if success:
                logger.info("Using latest CDF schema from instance manager")
            else:
                logger.warning("Using fallback CDF schema for validation")

            # Validate each challenge file
            invalid_challenges = []
            for relative_challenge_path in manifest_data.get('challenges', []):
                full_challenge_path_in_zip = pack_json_base_dir + relative_challenge_path

                if full_challenge_path_in_zip not in all_zip_entries:
                    logger.warning(f"Challenge file listed in pack.json not found in zip: {full_challenge_path_in_zip}")
                    missing_challenges.append(full_challenge_path_in_zip)
                    continue

                # Also validate challenge content against schema
                try:
                    # Extract challenge file to memory for validation
                    challenge_content = zip_ref.read(full_challenge_path_in_zip).decode('utf-8')
                    challenge_data = json.loads(challenge_content)

                    # Validate against schema
                    jsonschema.validate(instance=challenge_data, schema=cdf_schema)
                    logger.info(f"Challenge file {relative_challenge_path} validated successfully")
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in challenge file {relative_challenge_path}: {str(e)}")
                    invalid_challenges.append({
                        'path': relative_challenge_path,
                        'error': f"Invalid JSON: {str(e)}"
                    })
                except jsonschema.ValidationError as e:
                    logger.error(f"Schema validation failed for {relative_challenge_path}: {str(e)}")
                    invalid_challenges.append({
                        'path': relative_challenge_path,
                        'error': f"Schema validation error: {e.message}"
                    })
                except Exception as e:
                    logger.error(f"Error validating challenge {relative_challenge_path}: {str(e)}")
                    invalid_challenges.append({
                        'path': relative_challenge_path,
                        'error': f"Validation error: {str(e)}"
                    })

            if missing_challenges:
                error_msg = f"Missing challenge files in zip archive: {', '.join(missing_challenges)}"
                logger.error(error_msg)
                return jsonify({'error': error_msg}), 400

            if invalid_challenges:
                error_msg = f"Invalid challenge files in zip archive: {', '.join([c['path'] for c in invalid_challenges])}"
                logger.error(error_msg)
                return jsonify({
                    'error': error_msg,
                    'validation_errors': invalid_challenges
                }), 400

            logger.info("All challenge files listed in manifest found and validated.")

            # 5. Extract All (Validation Passed)
            temp_dir = tempfile.mkdtemp(prefix='pack_extract_')  # New temp dir for full extraction
            logger.info(f"All validations passed. Extracting full archive to: {temp_dir}")
            zip_ref.extractall(temp_dir)

        # --- End Zip Processing ---

        # 6. Prepare data and call installation transaction
        #    (Pass the base directory needed for constructing full paths)
        logger.info("Initiating pack installation transaction...")
        # We need the path *on the filesystem* where pack.json was extracted
        extracted_manifest_path = os.path.join(temp_dir, pack_json_path_in_zip)

        # install_pack_transaction needs the manifest data and the *root* extraction dir
        # It will need to internally construct paths like os.path.join(temp_dir, pack_json_base_dir, relative_challenge_path)
        result = await install_pack_transaction(manifest_data, temp_dir, pack_json_base_dir)
        logger.info("Pack installation transaction completed.")

        # --- Log Activity ---
        # Get the uploader's user ID from the custom header set by the dashboard proxy
        uploader_user_id = request.headers.get('X-Uploader-User-Id')

        if not uploader_user_id:
            # If the header is missing, we cannot reliably log the activity against a user.
            # Log an error and skip activity logging for this event.
            # Ideally, the dashboard proxy should ALWAYS send this header.
            logger.error("Missing X-Uploader-User-Id header in pack upload request. Cannot log activity correctly.")
            # We still return the main success response, as the pack *was* installed.
            return jsonify(result), 200

        logger.info(f"Logging pack installation activity for user: {uploader_user_id}")
        log_data = {
            "eventType": "CHALLENGE_PACK_INSTALLED",
            "details": f"Installed pack: {manifest_data['name']} (v{manifest_data['version']}) from file {filename}",
            "severity": "INFO",
            "userId": uploader_user_id, # Use the ID from the header
            "metadata": {
                "packId": result['packId'],
                "packName": manifest_data['name']
            }
        }

        # Call the safe logging function (ensure it handles the userId correctly)
        log_success, log_result = await safe_log_activity(log_data)
        if not log_success:
            logger.error(f"Failed to log pack installation activity: {log_result}")
        # --- End Log Activity ---

        # Return success response from the main operation
        return jsonify(result), 200

    except FileNotFoundError as e:
        logger.error(f"File not found")


# For Dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)


# --- New Endpoint ---
@app.route('/challenges', methods=['GET'])
async def get_challenges():
    """
    Fetches a list of all available challenges, including pack information.
    """
    logger.info("Received request for /challenges")
    if not ensure_database_connection():
        logger.error("Database connection unavailable for /challenges")
        return jsonify({"error": "Database connection unavailable"}), 503

    try:
        challenges = await prisma.challenge.find_many(
            include={
                'challengePack': True,  # Include related pack data
                'challengeType': True  # Include challenge type
            }
        )
        logger.info(f"Found {len(challenges)} challenges")

        # Structure the response data
        response_data = [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "pack_id": c.pack_id,
                "pack_name": c.challengePack.name if c.challengePack else None,
                "pack_version": c.challengePack.version if c.challengePack else None,
                "challenge_type_id": c.challengeTypeId,
                "challenge_type_name": c.challengeType.name if c.challengeType else None,
                "created_at": c.createdAt.isoformat() if c.createdAt else None,
                "updated_at": c.updatedAt.isoformat() if c.updatedAt else None
                # Add other fields as needed for the admin UI selector
            }
            for c in challenges
        ]

        return jsonify(response_data)

    except Exception as e:
        logger.exception(f"Error fetching challenges: {str(e)}")  # Use logger.exception to include stack trace
        # Log activity for system error
        log_data = {
            'eventType': ActivityEventType.SYSTEM_ERROR,
            'userId': 'system',  # Or a generic system user ID
            'metadata': json.dumps({"error": f"Error fetching challenges: {str(e)}", "endpoint": "/challenges"}),
            'severity': LogSeverity.ERROR
        }
        # Add await here as safe_log_activity is now async
        success, log_result = await safe_log_activity(log_data)
        if not success:
            logger.error(f"Failed to log system error for /challenges: {log_result}")

        return jsonify({"error": "Failed to fetch challenges", "details": str(e)}), 500


async def install_pack_transaction(manifest_data: Dict[str, Any], extract_dir: str, pack_base_dir: str):
    """
    Installs challenges from a validated and extracted pack within a transaction.
    Needs the base directory within the original zip to construct correct paths.
    """
    logger.info(f"Starting install_pack_transaction for pack: {manifest_data.get('id')}")
    logger.info(f"Using extraction directory: {extract_dir}")
    logger.info(f"Using pack base directory within zip: '{pack_base_dir}'")

    async with prisma.tx() as tx:
        # 1. Upsert ChallengePack
        pack_id = manifest_data['id']
        pack_record = await tx.challengepack.upsert(
                        where={'id': pack_id},
            data={
                'create': {
                    'id': pack_id,
                    'name': manifest_data['name'],
                    'version': manifest_data['version'],
                    'description': manifest_data.get('description', None),
                    'author': manifest_data.get('author', 'Anonymous')
                },
                'update': {
                    'name': manifest_data['name'],
                    'version': manifest_data['version'],
                    'description': manifest_data.get('description', None),
                    'author': manifest_data.get('author', 'Anonymous')
                }
            }
        )
        logger.info(f"Upserted ChallengePack: {pack_record.id}")

        # 2. Process Challenges
        installed_challenges = []
        updated_challenges = []
        skipped_challenges = []  # For challenges that error

        for relative_challenge_path in manifest_data.get('challenges', []):
            # Construct the path to the extracted challenge file
            # Important: Use pack_base_dir here!
            challenge_file_sys_path = os.path.join(extract_dir, pack_base_dir, relative_challenge_path)
            logger.info(
                f"Processing challenge file: {challenge_file_sys_path} (relative path in manifest: {relative_challenge_path})")

            try:
                if not os.path.exists(challenge_file_sys_path):
                    logger.error(f"Extracted challenge file not found at: {challenge_file_sys_path}")
                    raise FileNotFoundError(
                        f"Extracted challenge file not found at expected path: {challenge_file_sys_path}")

                with open(challenge_file_sys_path, 'r') as f:
                    challenge_data = json.load(f)

                # Basic validation (could add more schema validation here)
                if not challenge_data.get('metadata') or not challenge_data['metadata'].get('id'):
                    logger.warning(f"Skipping challenge file {relative_challenge_path} due to missing metadata or id.")
                    skipped_challenges.append({'path': relative_challenge_path, 'reason': 'Missing metadata or id'})
                    continue

                challenge_id = challenge_data['metadata']['id']
                challenge_name = challenge_data['metadata'].get('name', 'Unnamed Challenge')
                challenge_payload = json.dumps(challenge_data)

                # --- Map difficulty string to Enum value ---
                difficulty_str = challenge_data['metadata'].get('difficulty',
                                                                'medium').lower()  # Default to medium, ensure lowercase
                difficulty_map = {
                    'easy': 'EASY',
                    'beginner': 'EASY',
                    'medium': 'MEDIUM',
                    'intermediate': 'MEDIUM',
                    'hard': 'HARD',
                    'expert': 'EXPERT'
                }
                difficulty_enum_value = difficulty_map.get(difficulty_str, 'MEDIUM')  # Default to MEDIUM if no match
                logger.info(f"Mapping difficulty '{difficulty_str}' to Enum value '{difficulty_enum_value}'")
                # --- End difficulty mapping ---

                # --- Get or Create ChallengeType ---
                challenge_type_name = challenge_data['metadata'].get('challenge_type')
                if not challenge_type_name:
                    logger.warning(
                        f"Skipping challenge {challenge_id} ({relative_challenge_path}) due to missing metadata.challenge_type.")
                    skipped_challenges.append(
                        {'path': relative_challenge_path, 'reason': 'Missing metadata.challenge_type'})
                    continue

                # Upsert ChallengeType within the transaction
                challenge_type_record = await tx.challengetype.upsert(
                    where={'name': challenge_type_name},
                    data={
                        'create': {'name': challenge_type_name},
                        'update': {}
                    }
                )
                challenge_type_id = challenge_type_record.id
                logger.info(f"Ensured ChallengeType '{challenge_type_name}' exists with ID: {challenge_type_id}")
                # --- End ChallengeType Handling ---

                # Upsert Challenge
                challenge_record = await tx.challenge.upsert(
                    where={'id': challenge_id},
                    data={
                        'create': {
                            'id': challenge_id,
                            'name': challenge_name,
                            'description': challenge_data['metadata'].get('description', None),
                            'difficulty': difficulty_enum_value,
                            'cdf_content': challenge_payload,
                            'cdf_version': challenge_data['metadata'].get('version', None),
                            'pack_challenge_id': challenge_id,
                            'pack': {
                                'connect': {'id': pack_record.id}
                            },
                            'challengeType': {
                                'connect': {'id': challenge_type_id}
                            }
                        },
                        'update': {
                            'name': challenge_name,
                            'description': challenge_data['metadata'].get('description', None),
                            'difficulty': difficulty_enum_value,
                            'cdf_content': challenge_payload,
                            'cdf_version': challenge_data['metadata'].get('version', None),
                            'pack_challenge_id': challenge_id,
                            'pack': {
                                'connect': {'id': pack_record.id}
                            },
                            'challengeType': {
                                'connect': {'id': challenge_type_id}
                            }
                        }
                    }
                )
                logger.info(f"Upserted Challenge: {challenge_id} - {challenge_name}")

                # --- Process Components: Questions and App Configs ---
                questions_data = []
                app_configs_data = []
                if isinstance(challenge_data.get('components'), list):
                    for component in challenge_data['components']:
                        if component.get('type') == 'question' and isinstance(component.get('config'), dict):
                            # Add component ID to the config dict for potential use
                            component['config']['_cdf_component_id'] = component.get('id')
                            questions_data.append(component['config'])
                        elif component.get('type') == 'webosApp' and isinstance(component.get('config'), dict):
                             # Add component ID to the config dict for potential use (acts as appId)
                            component['config']['appId'] = component.get('id')
                            app_configs_data.append(component['config'])
                        # Add other component type processing here if needed in the future
                # --- End Component Processing ---

                # --- Process Challenge Questions ---
                # questions_data = challenge_data.get('questions', []) # OLD: Removed
                logger.info(f"Found {len(questions_data)} questions (from components) for challenge {challenge_id}")
                processed_questions = 0

                # Helper function to standardize question types
                def standardize_question_type(q_data):
                    """Map legacy question types to standard format"""
                    # Ensure type field exists and is uppercase for database
                    if 'type' in q_data:
                        # Convert to uppercase for database storage
                        q_data['type'] = q_data['type'].upper()
                        logger.info(f"Using question type: {q_data['type']}")
                    
                    # Handle legacy question_type field if it exists
                    elif 'question_type' in q_data:
                        q_data['type'] = q_data['question_type'].upper()
                        logger.info(f"Converted question_type to type: {q_data['type']}")
                        # Remove redundant field
                        q_data.pop('question_type')
                    
                    # Default fallback
                    else:
                        logger.warning(f"Question missing type field, defaulting to TEXT")
                        q_data['type'] = 'TEXT'

                if isinstance(questions_data, list):
                    for index, q_data in enumerate(questions_data):
                        try:
                            # Standardize the question type
                            standardize_question_type(q_data)

                            question_order = q_data.get('order', index) # Use provided order or index
                            # Use the component ID stored in _cdf_component_id if available, else generate
                            question_id_in_cdf = q_data.get('_cdf_component_id', f"q_{question_order}")

                            # Ensure essential fields exist (adjust based on CDF component structure)
                            if not q_data.get('text'): # 'title' might not exist directly in question component config
                                logger.warning(f"Skipping question {index} for challenge {challenge_id} due to missing text.")
                                continue

                            question_payload = json.dumps(q_data)

                            await tx.challengequestion.upsert(
                                where={
                                    # Unique constraint on challengeId and order
                                    'challengeId_order': {
                                        'challengeId': challenge_record.id,
                                        'order': question_order
                                    }
                                },
                                data={
                                    'create': {
                                        'challengeId': challenge_record.id,
                                        'order': question_order,
                                        'title': q_data.get('title', q_data['text'][:50]), # Use title or first 50 chars of text
                                        'content': q_data['text'], # Map 'text' to 'content' for the database
                                        'type': q_data.get('type', 'TEXT').upper(), # Map to DB enum values
                                        'answer': q_data.get('answer'),
                                        'points': q_data.get('points', 0),
                                        'format': q_data.get('format'),
                                        'hint': q_data.get('hint'),
                                        'required': q_data.get('required', True),
                                        'cdf_question_id': question_id_in_cdf,
                                        'cdf_payload': question_payload
                                    },
                                    'update': {
                                        'title': q_data.get('title', q_data['text'][:50]),
                                        'content': q_data['text'], # Map 'text' to 'content' for the database
                                        'type': q_data.get('type', 'TEXT').upper(), # Map to DB enum values
                                        'answer': q_data.get('answer'),
                                        'points': q_data.get('points', 0),
                                        'format': q_data.get('format'),
                                        'hint': q_data.get('hint'),
                                        'required': q_data.get('required', True),
                                        'cdf_question_id': question_id_in_cdf,
                                        'cdf_payload': question_payload
                                    }
                                }
                            )
                            processed_questions += 1
                        except Exception as q_err:
                            logger.error(f"Error processing question {index} for challenge {challenge_id}: {q_err}")
                    logger.info(f"Processed {processed_questions} questions for challenge {challenge_id}")

                # --- Process Challenge App Configs ---
                # app_configs_data = challenge_data.get('app_configs', []) # OLD: Removed
                logger.info(f"Found {len(app_configs_data)} app configs (from components) for challenge {challenge_id}")
                processed_app_configs = 0
                if isinstance(app_configs_data, list):
                    for index, config_data in enumerate(app_configs_data):
                        try:
                            # Use the component ID stored in appId (from component processing step)
                            app_id = config_data.get('appId')
                            if not app_id:
                                logger.warning(f"Skipping app config {index} for challenge {challenge_id} due to missing component ID (appId).")
                                continue

                            # Prepare additional_config: dump if dict/list, otherwise use as string
                            # Note: CDF puts config directly, no 'additional_config' sub-key usually
                            # We might need to store the *entire* config_data dict as the additional_config?
                            # For now, let's assume 'additional_config' might exist OR store the whole thing.
                            additional_config_val = config_data.get('additional_config', config_data) # Fallback to whole config
                            additional_config_str = None
                            if isinstance(additional_config_val, (dict, list)):
                                try:
                                    additional_config_str = json.dumps(additional_config_val)
                                except TypeError:
                                    logger.warning(f"Could not serialize additional_config for app {app_id} in challenge {challenge_id}. Storing as string representation.")
                                    additional_config_str = str(additional_config_val)
                            elif additional_config_val is not None:
                                additional_config_str = str(additional_config_val)

                            await tx.challengeappconfig.upsert(
                                where={
                                    'challengeId_appId': {
                                        'challengeId': challenge_record.id,
                                        'appId': app_id
                                    }
                                },
                                data={
                                    'create': {
                                        'challengeId': challenge_record.id,
                                        'appId': app_id,
                                        'title': config_data.get('title', app_id),
                                        'icon': config_data.get('icon', None),
                                        'width': config_data.get('width', None),
                                        'height': config_data.get('height', None),
                                        'screen': config_data.get('screen', None),
                                        'disabled': config_data.get('disabled', False),
                                        'favourite': config_data.get('favourite', False),
                                        'desktop_shortcut': config_data.get('desktop_shortcut', False),
                                        'launch_on_startup': config_data.get('launch_on_startup', False),
                                        'additional_config': additional_config_str # Storing potentially the whole config here
                                    },
                                    'update': {
                                        'title': config_data.get('title', app_id),
                                        'icon': config_data.get('icon', None),
                                        'width': config_data.get('width', None),
                                        'height': config_data.get('height', None),
                                        'screen': config_data.get('screen', None),
                                        'disabled': config_data.get('disabled', False),
                                        'favourite': config_data.get('favourite', False),
                                        'desktop_shortcut': config_data.get('desktop_shortcut', False),
                                        'launch_on_startup': config_data.get('launch_on_startup', False),
                                        'additional_config': additional_config_str
                                    }
                                }
                            )
                            processed_app_configs += 1
                        except Exception as app_err:
                            logger.error(f"Error processing app config {index} ({config_data.get('id', 'N/A')}) for challenge {challenge_id}: {app_err}")
                            # Optionally, add to a list of failed app configs

                    logger.info(f"Processed {processed_app_configs} app configs for challenge {challenge_id}")
                # --- End App Config Processing ---

                # Add challenge to appropriate list based on whether it was created or updated
                # (Note: upsert result doesn't directly tell us if it was created or updated easily)
                # For simplicity, we might just track installed = created + updated
                installed_challenges.append(challenge_id)

            except FileNotFoundError as e:
                logger.error(f"File not found error during processing of challenge {relative_challenge_path}: {e}")
                skipped_challenges.append({'path': relative_challenge_path, 'reason': str(e)})
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error in challenge file {relative_challenge_path}: {e}")
                skipped_challenges.append({'path': relative_challenge_path, 'reason': f"Invalid JSON: {e}"})
            except Exception as e:
                logger.exception(f"Unexpected error processing challenge {relative_challenge_path}: {e}")
                skipped_challenges.append({'path': relative_challenge_path, 'reason': f"Unexpected error: {e}"})

        logger.info(
            f"Transaction summary: Processed {len(installed_challenges)} challenges, Skipped {len(skipped_challenges)} challenges.")

        # Return summary or details as needed
        return {
            "status": "success",
            "message": f"Pack '{manifest_data.get('id')}' installed successfully.",
            "installed_count": len(installed_challenges),
            "skipped_count": len(skipped_challenges),
            "skipped_details": skipped_challenges,
            "packId": pack_id  # Add packId to the result object
        }

# Add a schema endpoint
@app.route('/api/schema', methods=['GET'])
async def get_schema():
    """
    Returns the current CDF schema as JSON.
    This endpoint serves the latest schema fetched from the instance manager,
    with fallback to local schema definitions.
    """
    logger.info("Received request for /api/schema")

    try:
        # Get the latest schema, with fallback to local definitions
        success, schema = fetch_latest_schema()
        if success:
            logger.info("Returning schema from instance manager")
        else:
            logger.info("Returning local schema definition")

        return jsonify(schema), 200

    except Exception as e:
        logger.error(f"Error returning schema: {e}")
        return jsonify({"error": f"Internal error: {str(e)}"}), 500
