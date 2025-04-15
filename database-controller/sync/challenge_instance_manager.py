import logging
import sys
import os
from datetime import datetime

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
            instance_data (dict): Data for the new challenge instance
            
        Returns:
            The created challenge instance
        """
        # Ensure we have a Prisma instance
        if not self.prisma:
            self.prisma = self.db_manager.prisma
            if not self.prisma:
                raise Exception("Database not connected")
        
        # Get required fields from instance data
        pod_name = instance_data.get('pod_name', '')
        flag_secret_name = instance_data.get('flag_secret_name', '')
        challenge_name = instance_data.get('challenge_name', '')
        challenge_id = instance_data.get('challenge_id', challenge_name)
        new_flag = instance_data.get('flag', None)
        competition_id = instance_data.get('competition_id', '')
        user_id = instance_data.get('user_id', '')
        challenge_url = instance_data.get('challenge_url', '')
        k8s_status = instance_data.get('k8s_status', 'pending')
        pod_status = instance_data.get('pod_status', None)
        
        logging.info(f"Adding new challenge instance: {pod_name} to database")
        
        # Use StatusManager to map the k8s status to a challenge status
        status = ChallengeStatusManager.get_status_for_new_pod(k8s_status, pod_status)
            
        # Check if a competition ID is provided
        if not competition_id:
            # Find or create a default competition
            default_competition = await self.db_manager.find_or_create_default_competition()
            competition_id = default_competition.id
            logging.info(f"Using default competition with ID: {competition_id}")
            
        # Try to find the challenge if only a name is provided
        if challenge_name and (not challenge_id or challenge_id == challenge_name):
            try:
                challenge = await self.db_manager.find_challenge_by_name(challenge_name)
                if challenge:
                    challenge_id = challenge.id
                    logging.info(f"Found matching challenge ID {challenge_id} for name {challenge_name}")
                else:
                    logging.warning(f"No matching challenge found for {challenge_name}")
            except Exception as e:
                logging.error(f"Error finding challenge for name {challenge_name}: {str(e)}")
        
        # Ensure challengeUrl is not empty as it's a required field
        if not challenge_url:
            challenge_url = f"https://{pod_name}.edurange.cloud"
            logging.info(f"Setting default challenge URL: {challenge_url}")
        
        try:
            # Create the challenge instance
            challenge_instance = await self.prisma.challengeinstance.create(
                data={
                    'id': pod_name,  # Use pod_name as the ID
                    'challengeId': challenge_id,
                    'challengeUrl': challenge_url,
                    'status': status,
                    'flagSecretName': flag_secret_name,
                    'flag': new_flag,
                    'k8s_instance_name': pod_name,
                    # Use the connect key for relation fields
                    'competition': {
                        'connect': {
                            'id': competition_id
                        }
                    },
                    'user': {
                        'connect': {
                            'id': user_id
                        }
                    }
                }
            )
            
            logging.info(f"Added new challenge instance {pod_name} to database with status {status}")
            
            # Log the instance creation
            await safe_log_activity(self.prisma, {
                'eventType': 'CHALLENGE_INSTANCE_CREATED',
                'userId': user_id,
                'challengeId': challenge_id,
                'groupId': competition_id,
                'metadata': {
                    'instanceId': pod_name,
                    'creationTime': datetime.now().isoformat(),
                    'status': status
                }
            })
            
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
