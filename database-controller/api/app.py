import logging
import os
import time
from flask import Flask, request, jsonify
from prisma import Prisma
from dotenv import load_dotenv
import asyncio
from flask_cors import CORS
from datetime import datetime
import json
from enum import Enum
from typing import Optional, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

load_dotenv()  # Load environmental variables

app = Flask(__name__)
CORS(app)

# Get connection configuration from environment variables or use defaults
DB_CONNECTION_LIMIT = int(os.environ.get('DATABASE_CONNECTION_LIMIT', '5'))
DB_CONNECTION_RETRY_INTERVAL = int(os.environ.get('DATABASE_CONNECTION_RETRY_INTERVAL', '5'))
DB_CONNECTION_MAX_RETRIES = int(os.environ.get('DATABASE_CONNECTION_MAX_RETRIES', '10'))

prisma = Prisma()
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
def safe_log_activity(log_data):
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
            logger.info(f"Converting dict metadata to JSON string: {json.dumps(updated_log_data['metadata'], default=str)[:200]}")
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
        activity_log = loop.run_until_complete(prisma.activitylog.create(
            data=updated_log_data
        ))
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
                    activity_log = loop.run_until_complete(prisma.activitylog.create(
                        data=updated_log_data
                    ))
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

                activity_log = loop.run_until_complete(prisma.activitylog.create(
                    data=updated_log_data
                ))

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
                    expected_tables = ["User", "ChallengeInstance", "Challenges", "ActivityLog"]
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
                            elif table == "Challenges":
                                count = loop.run_until_complete(prisma.challenges.count())
                                existing_tables.append("Challenges")
                            elif table == "ActivityLog":
                                count = loop.run_until_complete(prisma.activitylog.count())
                                existing_tables.append("ActivityLog")
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
                            response_data["tables_info"] = "Database schema is fully applied and all expected tables are present."
                    elif len(existing_tables) > 0:
                        # Some tables exist but not all
                        response_data["tables"] = []
                        response_data["tables_info"] = f"Database partially migrated. Missing tables: {', '.join(missing_tables)}"
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
    QUESTION_ATTEMPTED = "QUESTION_ATTEMPTED"
    QUESTION_COMPLETED = "QUESTION_COMPLETED"
    SYSTEM_ERROR = "SYSTEM_ERROR"

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

        # Handle metadata - convert to a format Prisma expects for Json field
        if data.get('metadata'):
            try:
                if isinstance(data['metadata'], dict):
                    # Convert Python dict to JSON string that Prisma can parse as Json type
                    log_data['metadata'] = json.dumps(data['metadata'])
                elif isinstance(data['metadata'], str):
                    # Already a string, make sure it's valid JSON
                    try:
                        # Test if it parses as JSON
                        json.loads(data['metadata'])
                        # If valid, use as is
                        log_data['metadata'] = data['metadata']
                    except json.JSONDecodeError as json_err:
                        logger.error(f"Failed to parse metadata JSON: {json_err}")
                        log_data['metadata'] = json.dumps({'raw': data['metadata'], 'error': str(json_err)})
                else:
                    log_data['metadata'] = json.dumps({'value': str(data['metadata'])})
            except Exception as metadata_err:
                logger.error(f"Error processing metadata: {metadata_err}")
                log_data['metadata'] = json.dumps({'error': f"Failed to process metadata: {str(metadata_err)}"})
        else:
            # Always provide an empty object if metadata is missing
            log_data['metadata'] = '{}'  # Empty JSON object as string
            
        # Add optional fields with proper relation connections
        if data.get('challengeId'):
            log_data['challenge'] = {
                'connect': {
                    'id': data['challengeId']
                }
            }

        if data.get('groupId'):
            log_data['group'] = {
                'connect': {
                    'id': data['groupId']
                }
            }

        if data.get('challengeInstanceId'):
            log_data['challengeInstance'] = {
                'connect': {
                    'id': data['challengeInstanceId']
                }
            }

        if data.get('accessCodeId'):
            log_data['accessCode'] = {
                'connect': {
                    'id': data['accessCodeId']
                }
            }

        # Create the activity log
        try:
            activity_log = loop.run_until_complete(prisma.activitylog.create(
                data=log_data
            ))
            return jsonify(activity_log.dict()), 201
        except Exception as prisma_error:
            error_message = str(prisma_error)
            logger.error(f"Prisma error: {error_message}")
            
            # Add essential error details for debugging
            if hasattr(prisma_error, 'meta'):
                logger.error(f"Error meta: {prisma_error.meta}")
            if hasattr(prisma_error, 'code'):
                logger.error(f"Error code: {prisma_error.code}")

            raise prisma_error

    except Exception as e:
        logger.error(f"Error logging activity: {str(e)}")
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

        # Find the group challenge for this instance
        group_challenge = loop.run_until_complete(prisma.groupchallenge.find_first(
            where={
                'challengeId': challenge_instance_dict['challengeId'],
                'groupId': challenge_instance_dict['competitionId']
            }
        ))

        # Create response with all needed data
        response_data = {
            'id': challenge_instance_dict['id'],
            'challengeId': challenge_instance_dict['challengeId'],
            'userId': challenge_instance_dict['userId'],
            'challengeImage': challenge_instance_dict['challengeImage'],
            'challengeUrl': challenge_instance_dict['challengeUrl'],
            'creationTime': challenge_instance_dict['creationTime'],
            'status': challenge_instance_dict['status'],
            'flagSecretName': challenge_instance_dict['flagSecretName'],
            'flag': challenge_instance_dict['flag'],
            'user': challenge_instance_dict['user'],
            'groupChallengeId': group_challenge.id if group_challenge else None,
            'groupId': group_challenge.groupId if group_challenge else None
        }

        return jsonify(response_data)
    except Exception as e:
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
        success, _ = safe_log_activity(log_data)
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
        success, _ = safe_log_activity(log_data)
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
        success, _ = safe_log_activity(log_data)
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
        challenge = loop.run_until_complete(prisma.challenges.find_unique(
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
            'difficulty': challenge_dict['difficulty'],
            'type': challenge_dict['challengeType']['name'],
            'questions': challenge_dict['questions'],
            'appConfigs': challenge_dict['appConfigs']
        })
    except Exception as e:
        logger.error(f"Error fetching challenge details: {str(e)}")
        return jsonify({'error': str(e)}), 500


# For Dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
