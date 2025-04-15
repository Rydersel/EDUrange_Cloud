import logging
import asyncio
import os
import sys
from datetime import datetime

# Configure path for imports (for both module and flat structure support)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Try both import styles to support both structures
try:
    # Original module structure imports
    from utils.logging_utils import safe_log_activity
    from utils.status_manager import ChallengeStatusManager
    from utils.flag_manager import extract_flag_from_pod
    from db_manager import DatabaseManager
    from k8s_client import K8sClient
    from challenge_instance_manager import ChallengeInstanceManager
except ImportError:
    # Flat structure imports if Docker is using flattened file structure
    logging.info("Using flattened imports structure")
    from logging_utils import safe_log_activity
    from status_manager import ChallengeStatusManager
    from flag_manager import extract_flag_from_pod
    from db_manager import DatabaseManager
    from k8s_client import K8sClient
    from challenge_instance_manager import ChallengeInstanceManager

# Configure logging with more detailed format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Initialize components
db_manager = DatabaseManager()
k8s_client = K8sClient()
instance_manager = ChallengeInstanceManager(db_manager, k8s_client)

# Main synchronization loop
async def sync_challenges():
    """
    Main function to synchronize challenge instances between Kubernetes and the database.
    Runs in an infinite loop, checking for changes at regular intervals.
    """
    # Connect to Prisma database
    prisma = await db_manager.connect()
    instance_manager.set_prisma(prisma)
    
    # Main loop
    while True:
        try:
            logging.info(f"{datetime.now()}: Starting synchronization process")
            
            # Fetch challenge pods from Kubernetes
            challenge_pods = k8s_client.get_challenge_pods()
            if not challenge_pods:
                logging.warning("No challenge pods returned from Kubernetes API")
                await asyncio.sleep(5)  # Wait a bit longer if no pods
                continue
                
            # Get challenge instances from the database
            try:
                db_instances = await db_manager.get_challenge_instances()
                logging.info(f"Retrieved {len(db_instances)} challenge instances from the database")
            except Exception as e:
                logging.error(f"Error fetching challenge instances from database: {str(e)}")
                await asyncio.sleep(5)
                continue
                
            # Create a dictionary of the current instances in the database for quick lookup
            db_instance_dict = {instance.id: instance for instance in db_instances}
            
            # Process each pod from Kubernetes
            for pod in challenge_pods:
                try:
                    logging.info(f"Processing pod with full data: {pod}")
                    
                    # Use name as the primary identifier
                    pod_id = pod.get('name')
                    
                    if not pod_id:
                        logging.error(f"Pod is missing required name field. Pod data: {pod}")
                        continue
                        
                    # Get pod status from Kubernetes
                    k8s_status = k8s_client.get_pod_status(pod_id)
                    pod_status = pod.get('status', '')
                    
                    logging.info(f"Pod {pod_id} status from K8s: '{k8s_status}', pod status: '{pod_status}'")
                    
                    # Extract flag information
                    flag_value, flag_secret_name = extract_flag_from_pod(pod, k8s_client)
                    
                    # Get challenge URL based on type
                    challenge_url = None
                    
                    # First check for direct webosUrl or webConsoleUrl (new format)
                    if pod.get('webosUrl'):
                        challenge_url = pod.get('webosUrl')
                        logging.info(f"Using webosUrl as challenge URL: {challenge_url}")
                    elif pod.get('webConsoleUrl'):
                        challenge_url = pod.get('webConsoleUrl')
                        logging.info(f"Using webConsoleUrl as challenge URL: {challenge_url}")
                    # Fall back to the old URL format in the urls dictionary
                    elif pod.get('urls'):
                        challenge_type = pod.get('challenge_type')
                        logging.info(f"Challenge type from pod: {challenge_type}")
                        
                        if challenge_type == 'web':
                            challenge_url = pod['urls'].get('challenge')
                        # Handle both fullOS and full-os formats
                        elif challenge_type == 'full-os' or challenge_type == 'fullOS':
                            challenge_url = pod['urls'].get('terminal')
                    
                    # If we still don't have a URL, construct a default one
                    if not challenge_url:
                        challenge_url = f"https://{pod_id}.edurange.cloud"
                        logging.info(f"Using fallback URL: {challenge_url}")
                            
                    # Process the pod (add or update)
                    if pod_id not in db_instance_dict:
                        # Pod exists in K8s but not in DB - add it
                        challenge_name = pod.get('challenge_name', '')
                        competition_id = pod.get('competition_id', '')
                        
                        # Handle challenge ID conversion from name
                        challenge_id = pod.get('challenge_id', '')
                        if not challenge_id and challenge_name:
                            challenge = await db_manager.find_challenge_by_name(challenge_name)
                            if challenge:
                                challenge_id = challenge.id
                                logging.info(f"Found matching challenge ID {challenge_id} for name {challenge_name}")
                        
                        await instance_manager.add_challenge_instance({
                            'pod_name': pod_id,
                            'challenge_id': challenge_id,
                            'challenge_name': challenge_name,
                            'user_id': pod.get('user_id', ''),
                            'competition_id': competition_id,
                            'challenge_url': challenge_url,
                            'k8s_status': k8s_status,
                            'pod_status': pod_status,
                            'flag_secret_name': flag_secret_name,
                            'flag': flag_value
                        })
                    else:
                        # Pod exists in both K8s and DB - update it
                        db_instance = db_instance_dict[pod_id]
                        current_status = db_instance.status
                        
                        logging.info(f"Updating instance {pod_id}, current status: {current_status}")
                        
                        # Handle challenge ID conversion for updates
                        challenge_name = pod.get('challenge_name', '')
                        challenge_id = db_instance.challengeId  # Default to existing challenge ID
                        
                        # Only try to resolve if name is provided and different from existing ID
                        if challenge_name and challenge_name != db_instance.challengeId:
                            challenge = await db_manager.find_challenge_by_name(challenge_name)
                            if challenge:
                                challenge_id = challenge.id
                                logging.info(f"Found matching challenge ID {challenge_id} for name {challenge_name}")
                        
                        await instance_manager.update_challenge_instance({
                            'pod_name': pod_id,
                            'challenge_id': challenge_id,
                            'user_id': pod.get('user_id', db_instance.userId),
                            'competition_id': pod.get('competition_id', db_instance.competitionId),
                            'challenge_url': challenge_url or db_instance.challengeUrl,
                            'k8s_status': k8s_status,
                            'pod_status': pod_status,
                            'flag_secret_name': flag_secret_name,
                            'flag': flag_value
                        })
                        
                        # Remove from dictionary to track processed instances
                        del db_instance_dict[pod_id]
                except Exception as pod_error:
                    logging.error(f"Error processing pod: {str(pod_error)}")
                    logging.error("Full traceback:", exc_info=True)
                    continue
                    
            # Remove instances that are no longer present in Kubernetes
            for instance_id in db_instance_dict.keys():
                try:
                    logging.info(f"Removing instance {instance_id} as it no longer exists in Kubernetes")
                    await instance_manager.remove_challenge_instance(instance_id)
                except Exception as remove_error:
                    logging.error(f"Error removing instance {instance_id}: {str(remove_error)}")
                    
            logging.info(f"{datetime.now()}: Synchronization process completed")
            
        except Exception as e:
            logging.error(f"Unexpected error during synchronization: {str(e)}")
            logging.error("Full traceback:", exc_info=True)
            
        # Wait before the next synchronization cycle
        await asyncio.sleep(2)  # 2 seconds between sync attempts

if __name__ == "__main__":
    logging.info("Starting challenge synchronization service")
    asyncio.run(sync_challenges())
