import logging
import asyncio
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Helper function for safely logging activities
async def safe_log_activity(prisma, log_data):
    """
    Safely log an activity with error handling to prevent pod crashes.

    Args:
        prisma: The Prisma client instance
        log_data (dict): The activity log data to be saved

    Returns:
        tuple: (success, result_or_error)
            - success (bool): Whether the logging was successful
            - result_or_error: The activity log object if successful, or error message if failed
    """
    try:
        # Create activity log entry using await instead of a loop
        activity_log = await prisma.activitylog.create(
            data=log_data
        )
        logging.info(f"Activity logged successfully: {log_data.get('eventType')}")
        return True, activity_log
    except Exception as e:
        error_str = str(e)

        # Check for enum-related errors
        if "invalid input value for enum" in error_str and "ActivityEventType" in error_str:
            logging.warning(f"Enum mismatch error for event type '{log_data.get('eventType')}'. Using SYSTEM_ERROR as fallback.")

            # Try again with SYSTEM_ERROR as event type and include the original event in metadata
            try:
                original_event = log_data.get('eventType')
                log_data['eventType'] = 'SYSTEM_ERROR'
                log_data['metadata'] = {
                    **(log_data.get('metadata') or {}),
                    'original_event_type': original_event,
                    'error': error_str
                }

                activity_log = await prisma.activitylog.create(
                    data=log_data
                )

                logging.info(f"Activity logged as SYSTEM_ERROR instead of {original_event}")
                return True, activity_log
            except Exception as fallback_error:
                logging.error(f"Fallback logging also failed: {str(fallback_error)}")
                return False, f"Failed to log activity even with fallback mechanism: {str(fallback_error)}"

        # Handle other Prisma errors
        logging.error(f"Database error while logging activity: {error_str}")
        return False, f"Database error while logging activity: {error_str}"
