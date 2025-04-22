import logging
import sys
import os
from datetime import datetime, timedelta

# Try both import styles to support both structures
try:
    # Original module structure imports
    from utils.logging_utils import safe_log_activity
    from utils.status_manager import ChallengeStatusManager, ChallengeStatus
except ImportError:
    # Flat structure imports if Docker is using flattened file structure
    logging.info("Using flattened imports structure in ChallengeInstanceManager")
    from logging_utils import safe_log_activity
    from status_manager import ChallengeStatusManager, ChallengeStatus

class ChallengeInstanceManager:
    def __init__(self, db_manager, k8s_client):
        """
        Initialize the challenge instance manager
        
        Args:
            db_manager (DatabaseManager): The database manager
            k8s_client (K8sClient): The Kubernetes client
        """
        self.db_manager = db_manager
        self.k8s_client = k8s_client
        self.prisma = None
        
    def set_prisma(self, prisma):
        """Set the Prisma client instance"""
        self.prisma = prisma
        
    async def add_challenge_instance(self, instance_data):
        """
        Add a new challenge instance to the database.
        
        Args:
            instance_data (dict): Data for the challenge instance
            
        Returns:
            The created challenge instance
        """
        # Ensure we have a Prisma instance
        if not self.prisma:
            self.prisma = self.db_manager.prisma
            if not self.prisma:
                raise Exception("Database not connected")
                
        # Extract instance data
        pod_name = instance_data.get('pod_name', '')
        challenge_id = instance_data.get('challenge_id', '')
        user_id = instance_data.get('user_id', '')
        competition_id = instance_data.get('competition_id', '')
        challenge_url = instance_data.get('challenge_url', '')
        flag_secret_name = instance_data.get('flag_secret_name', '')
        new_flag = instance_data.get('flag')
        k8s_status = instance_data.get('k8s_status', '').lower()
        pod_status = instance_data.get('pod_status', '').lower()
        
        # Apply status transformation/normalization
        status = "CREATING"  # Default status
        
        if k8s_status or pod_status:
            logging.info(f"Mapping new pod status - K8s status: '{k8s_status}', pod status: '{pod_status}'")
            
            # If we have k8s_status, use it to determine the status
            if k8s_status == 'active' or pod_status == 'active':
                logging.info(f"Pod status override: '{k8s_status}' -> ACTIVE")
                status = "ACTIVE"
            elif k8s_status == 'error' or pod_status == 'error':
                status = "ERROR"
            elif k8s_status == 'queued' or pod_status == 'queued':
                status = "QUEUED"
            
            logging.info(f"Final status for new pod: {status}")
        
        # Ensure challengeUrl is not empty as it's a required field
        if not challenge_url:
            challenge_url = f"https://{pod_name}.edurange.cloud"
            logging.info(f"Setting default challenge URL: {challenge_url}")
        
        try:
            # Check if the competition exists before attempting to create the instance
            competition_exists = False
            if competition_id:
                try:
                    competition = await self.prisma.competitiongroup.find_unique(
                        where={'id': competition_id}
                    )
                    if competition:
                        competition_exists = True
                    else:
                        logging.warning(f"Competition ID {competition_id} not found in database")
                except Exception as comp_err:
                    logging.warning(f"Error checking competition existence: {str(comp_err)}")
            
            # Create instance data based on whether competition exists
            create_data = {
                'id': pod_name,  # Use pod_name as the ID
                'challengeId': challenge_id,
                'challengeUrl': challenge_url,
                'status': status,
                'flagSecretName': flag_secret_name,
                'flag': new_flag,
                'k8s_instance_name': pod_name,
                # Always connect to user
                'user': {
                    'connect': {
                        'id': user_id
                    }
                }
            }
            
            # Only include competition relation if it exists
            if competition_exists:
                create_data['competition'] = {
                    'connect': {
                        'id': competition_id
                    }
                }
            else:
                # If competition doesn't exist but we need to provide a value
                # Create a temporary competition group for standalone instances
                try:
                    # Check if fallback competition exists
                    fallback_id = "standalone-instances-group"
                    fallback_comp = await self.prisma.competitiongroup.find_unique(
                        where={'id': fallback_id}
                    )
                    
                    if not fallback_comp:
                        # Create fallback competition group if it doesn't exist
                        today = datetime.now()
                        future = today + timedelta(days=365)  # One year from now
                        fallback_comp = await self.prisma.competitiongroup.create(
                            data={
                                'id': fallback_id,
                                'name': "Standalone Instances",
                                'description': "Automatically created group for instances without a valid competition",
                                'startDate': today,
                                'endDate': future
                            }
                        )
                        logging.info(f"Created fallback competition group: {fallback_id}")
                    
                    # Connect to fallback competition
                    create_data['competition'] = {
                        'connect': {
                            'id': fallback_id
                        }
                    }
                    logging.info(f"Using fallback competition for instance {pod_name}")
                except Exception as fallback_err:
                    logging.error(f"Failed to create or use fallback competition: {str(fallback_err)}")
                    # At this point, we can't create the instance because the competition relation is required
                    # Return a dummy instance object with error info
                    return {
                        "id": pod_name,
                        "error": "Cannot create instance without valid competition",
                        "status": "ERROR"
                    }
            
            # Create the challenge instance
            challenge_instance = await self.prisma.challengeinstance.create(
                data=create_data
            )
            
            logging.info(f"Added new challenge instance {pod_name} to database with status {status}")
            
            # Log the instance creation
            try:
                activity_log_data = {
                    'eventType': 'CHALLENGE_INSTANCE_CREATED',
                    'userId': user_id,
                    'challengeId': challenge_id,
                    'metadata': {
                        'instanceId': pod_name,
                        'creationTime': datetime.now().isoformat(),
                        'status': status
                    }
                }
                
                # Only include groupId if a valid competition was used
                if competition_exists or 'competition' in create_data:
                    comp_id = competition_id if competition_exists else fallback_id
                    activity_log_data['groupId'] = comp_id
                
                await safe_log_activity(self.prisma, activity_log_data)
            except Exception as log_err:
                logging.error(f"Failed to log activity: {str(log_err)}")
            
            return challenge_instance
        except Exception as e:
            logging.error(f"Error adding challenge instance {pod_name}: {str(e)}")
            logging.error("Full traceback:", exc_info=True)
            raise
            
    async def update_challenge_instance(self, instance_data):
        """
        Update an existing challenge instance in the database.
        
        Args:
            instance_data (dict): Data for the challenge instance update
            
        Returns:
            The updated challenge instance
        """
        # Ensure we have a Prisma instance
        if not self.prisma:
            self.prisma = self.db_manager.prisma
            if not self.prisma:
                raise Exception("Database not connected")
                
        # Get pod name
        pod_name = instance_data.get('pod_name', '')
        
        # Find the current instance
        current_instance = await self.prisma.challengeinstance.find_unique(
            where={
                'id': pod_name
            }
        )
        
        if not current_instance:
            logging.warning(f"Attempted to update non-existent challenge instance: {pod_name}")
            return None
            
        # Get update values with fallbacks to current values
        flag_secret_name = instance_data.get('flag_secret_name', current_instance.flagSecretName or '')
        new_flag = instance_data.get('flag', current_instance.flag)
        
        # Check if competition_id needs to be updated and exists
        competition_id = current_instance.competitionId
        new_competition_id = instance_data.get('competition_id', '')
        if new_competition_id and new_competition_id != competition_id:
            # Verify the new competition exists
            competition = await self.prisma.competitiongroup.find_unique(
                where={'id': new_competition_id}
            )
            if competition:
                competition_id = new_competition_id
                logging.info(f"Updating competition ID for instance {pod_name} to {competition_id}")
            else:
                logging.warning(f"Competition ID {new_competition_id} not found. Keeping existing ID {competition_id}")
        
        # Get K8s status information
        k8s_status = instance_data.get('k8s_status', '')
        pod_status = instance_data.get('pod_status', None)
        
        # Determine the new status using the state machine
        if k8s_status:
            new_status = ChallengeStatusManager.get_next_status(
                current_instance.status, 
                k8s_status,
                pod_status
            )
            
            # Log transition if status changed
            if new_status != current_instance.status:
                logging.info(f"Status transition for {pod_name}: {current_instance.status} -> {new_status}")
                # Check if it's a valid transition
                if not ChallengeStatusManager.can_transition(current_instance.status, new_status):
                    logging.warning(
                        f"Potentially invalid status transition for {pod_name}: "
                        f"{current_instance.status} -> {new_status}"
                    )
        else:
            # Use provided status or keep current status if no K8s status available
            new_status = instance_data.get('status', current_instance.status)
            # Validate the status
            if new_status not in ChallengeStatus.values():
                logging.warning(
                    f"Invalid status value '{new_status}' for instance {pod_name}. "
                    f"Using current status '{current_instance.status}' instead."
                )
                new_status = current_instance.status
            
        try:
            # Update the challenge instance
            updated_instance = await self.prisma.challengeinstance.update(
                where={
                    'id': pod_name
                },
                data={
                    'challengeUrl': instance_data.get('challenge_url', current_instance.challengeUrl),
                    'status': new_status,
                    'flagSecretName': flag_secret_name,
                    'flag': new_flag,
                    'competitionId': competition_id,
                    'userId': instance_data.get('user_id', current_instance.userId),
                    'challengeId': instance_data.get('challenge_id', current_instance.challengeId)
                }
            )
            
            # If status changed to completed, log it and update points
            if current_instance and current_instance.status != "TERMINATED" and updated_instance.status == "TERMINATED":
                await self._handle_challenge_completion(updated_instance)
                
            return updated_instance
        except Exception as e:
            logging.error(f"Error updating challenge instance {pod_name}: {str(e)}")
            logging.error("Full traceback:", exc_info=True)
            raise
            
    async def _handle_challenge_completion(self, instance):
        """Handle challenge completion by updating points and creating records"""
        try:
            # Find the group challenge for this instance
            group_challenge = await self.prisma.groupchallenge.find_first(
                where={
                    'challengeId': instance.challengeId
                },
                include={
                    'group': True
                }
            )
            
            if group_challenge:
                # Create challenge completion record
                completion = await self.prisma.challengecompletion.create(
                    data={
                        'userId': instance.userId,
                        'groupChallengeId': group_challenge.id,
                        'pointsEarned': group_challenge.points
                    }
                )
                
                # Update group points
                await self.prisma.grouppoints.upsert(
                    where={
                        'userId_groupId': {
                            'userId': instance.userId,
                            'groupId': group_challenge.groupId
                        }
                    },
                    create={
                        'userId': instance.userId,
                        'groupId': group_challenge.groupId,
                        'points': group_challenge.points
                    },
                    update={
                        'points': {
                            'increment': group_challenge.points
                        }
                    }
                )
                
                # Log the completion
                await safe_log_activity(self.prisma, {
                    'eventType': 'CHALLENGE_COMPLETED',
                    'userId': instance.userId,
                    'challengeId': instance.challengeId,
                    'groupId': group_challenge.groupId,
                    'metadata': {
                        'instanceId': instance.id,
                        'completionTime': datetime.now().isoformat(),
                        'pointsEarned': group_challenge.points
                    }
                })
                
                logging.info(f"Challenge completion processed for instance {instance.id}")
            else:
                logging.warning(f"No group challenge found for instance {instance.id}")
        except Exception as e:
            logging.error(f"Error handling challenge completion for instance {instance.id}: {str(e)}")
            
    async def remove_challenge_instance(self, instance_id):
        """
        Remove a challenge instance from the database.
        
        Args:
            instance_id (str): The ID of the instance to remove
            
        Returns:
            bool: True if successful, False otherwise
        """
        # Ensure we have a Prisma instance
        if not self.prisma:
            self.prisma = self.db_manager.prisma
            if not self.prisma:
                raise Exception("Database not connected")
                
        try:
            # Find the instance first
            instance = await self.prisma.challengeinstance.find_unique(
                where={
                    'id': instance_id
                }
            )
            
            if not instance:
                logging.warning(f"Attempted to remove non-existent challenge instance: {instance_id}")
                return False
                
            # Update the status to TERMINATED before deletion
            if instance.status != "TERMINATED":
                await self.prisma.challengeinstance.update(
                    where={
                        'id': instance_id
                    },
                    data={
                        'status': "TERMINATED"
                    }
                )
                
                # Handle challenge completion if needed
                if instance.status != "TERMINATED":
                    # Refetch the instance with the updated status
                    updated_instance = await self.prisma.challengeinstance.find_unique(
                        where={
                            'id': instance_id
                        }
                    )
                    await self._handle_challenge_completion(updated_instance)
            
            # Delete the instance
            deleted_instance = await self.prisma.challengeinstance.delete(
                where={
                    'id': instance_id
                }
            )
            
            logging.info(f"Removed challenge instance {instance_id} from database")
            
            # Log the instance deletion
            await safe_log_activity(self.prisma, {
                'eventType': 'CHALLENGE_INSTANCE_DELETED',
                'userId': instance.userId,
                'challengeId': instance.challengeId,
                'groupId': instance.competitionId,
                'metadata': {
                    'instanceId': instance_id,
                    'deletionTime': datetime.now().isoformat(),
                    'previousStatus': instance.status
                }
            })
            
            return True
        except Exception as e:
            logging.error(f"Error removing challenge instance {instance_id}: {str(e)}")
            logging.error("Full traceback:", exc_info=True)
            return False
