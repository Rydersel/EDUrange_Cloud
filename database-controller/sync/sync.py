import requests
import asyncio
import logging
from datetime import datetime
from prisma import Prisma
from dotenv import load_dotenv

load_dotenv()  # Load enviromental variables

logging.basicConfig(level=logging.DEBUG)

prisma = Prisma()


async def connect_prisma():
    logging.info("Connecting to Prisma")
    await prisma.connect()


# Get challenge instances from the Prisma database
async def get_challenge_instances():
    return await prisma.challengeinstance.find_many()


def get_flag(secret_name):
    try:
        logging.info(f"Fetching flag for secret name: {secret_name}")
        response = requests.post("https://eductf.rydersel.cloud/instance-manager/api/get-secret",
                                 json={"secret_name": secret_name})
        logging.info(f"Response status code: {response.status_code}")
        logging.info(f"Response content: {response.content}")
        response.raise_for_status()
        flag = response.json().get("secret_value", "null")
        logging.info(f"Retrieved flag for {secret_name}: {flag}")
        return flag
    except Exception as e:
        logging.error(f"Error fetching flag for {secret_name}: {e}")
        return "null"


# Add a new challenge instance to the Prisma database
async def add_challenge_instance(instance):
    logging.info(f"Adding new instance: {instance['challenge_url']}")
    flag = get_flag(instance.get('flag_secret_name', None))
    
    # Get challenge ID directly from instance data
    challenge_id = instance.get('challenge_id', None)
    
    # If challenge_id is not provided, try to extract from image name as fallback
    if not challenge_id and instance.get('challenge_image'):
        try:
            parts = instance.get('challenge_image', '').split('/')
            if len(parts) > 1:
                challenge_name = parts[-1].split(':')[0]
                challenge = await prisma.challenges.find_first(
                    where={'name': challenge_name}
                )
                if challenge:
                    challenge_id = challenge.id
        except Exception as e:
            logging.error(f"Error extracting challenge ID from image: {e}")
    
    if not challenge_id:
        logging.error("No challenge ID found for instance")
        return None
    
    # Get required user_id and competition_id
    user_id = instance.get('user_id')
    competition_id = instance.get('competition_id')
    
    if not user_id or not competition_id:
        logging.error("Missing required user_id or competition_id")
        return None
    
    # Create the challenge instance
    try:
        challenge_instance = await prisma.challengeinstance.create(
            data={
                'id': instance['pod_name'],
                'challengeId': challenge_id,
                'userId': user_id,
                'competitionId': competition_id,
                'challengeImage': instance.get('challenge_image', ''),
                'challengeUrl': instance.get('challenge_url', ''),
                'status': instance.get('status', 'creating'),
                'flagSecretName': instance.get('flag_secret_name', ''),
                'flag': flag or ''
            }
        )

        # Log the challenge start event
        await prisma.activitylog.create(
            data={
                'eventType': 'CHALLENGE_STARTED',
                'userId': user_id,
                'challengeId': challenge_id,
                'challengeInstanceId': challenge_instance.id,
                'groupId': competition_id,
                'severity': 'INFO',
                'metadata': {
                    'instanceId': challenge_instance.id,
                    'startTime': datetime.now().isoformat()
                }
            }
        )

        return challenge_instance
    except Exception as e:
        logging.error(f"Error creating challenge instance: {e}")
        return None


# Remove a challenge instance from the Prisma database
async def remove_challenge_instance(instance_id):
    logging.info(f"Removing instance with ID: {instance_id}")
    
    try:
        # Get the instance before deleting it
        instance = await prisma.challengeinstance.find_unique(
            where={'id': instance_id}
        )
        
        if not instance:
            logging.warning(f"Instance {instance_id} not found for deletion")
            return
        
        # Delete the instance
        await prisma.challengeinstance.delete(
            where={'id': instance_id}
        )
        
        # Log the instance deletion
        await prisma.activitylog.create(
            data={
                'eventType': 'CHALLENGE_INSTANCE_DELETED',
                'userId': instance.userId,
                'challengeId': instance.challengeId,
                'challengeInstanceId': instance_id,
                'groupId': instance.competitionId,
                'severity': 'INFO',
                'metadata': {
                    'instanceId': instance_id,
                    'deletionTime': datetime.now().isoformat(),
                    'previousStatus': instance.status
                }
            }
        )
        
        logging.info(f"Successfully removed instance {instance_id}")
    except Exception as e:
        logging.error(f"Error removing challenge instance {instance_id}: {e}")
        raise  # Re-raise the exception to be handled by the caller


#  Update a challenge instance in the Prisma db
async def update_challenge_instance(instance):
    logging.info(f"Updating instance: {instance['challenge_url']}")
    current_flag = instance.get('flag', 'null')
    new_flag = get_flag(instance.get('flag_secret_name', 'null'))
    
    if current_flag != new_flag:
        logging.info(f"Updating flag from {current_flag} to {new_flag}")
    
    # Get the current instance to check for status change
    current_instance = await prisma.challengeinstance.find_unique(
        where={'id': instance['pod_name']}
    )
    
    # Update the instance
    updated_instance = await prisma.challengeinstance.update(
        where={
            'id': instance['pod_name']
        },
        data={
            'userId': instance['user_id'],
            'challengeImage': instance['challenge_image'],
            'challengeUrl': instance['challenge_url'],
            'status': instance['status'],
            'flagSecretName': instance['flag_secret_name'],
            'flag': new_flag
        }
    )
    
    # If status changed to completed, log it and update points
    if current_instance and current_instance.status != "completed" and updated_instance.status == "completed":
        # Find the group challenge for this instance
        group_challenge = await prisma.groupchallenge.find_first(
            where={
                'challengeId': instance['challenge_id']
            },
            include={
                'group': True
            }
        )

        if group_challenge:
            # Create challenge completion record
            completion = await prisma.challengecompletion.create(
                data={
                    'userId': instance['user_id'],
                    'groupChallengeId': group_challenge.id,
                    'pointsEarned': group_challenge.points
                }
            )

            # Update group points
            await prisma.grouppoints.upsert(
                where={
                    'userId_groupId': {
                        'userId': instance['user_id'],
                        'groupId': group_challenge.groupId
                    }
                },
                create={
                    'userId': instance['user_id'],
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
            await prisma.activitylog.create(
                data={
                    'eventType': 'CHALLENGE_COMPLETED',
                    'userId': instance['user_id'],
                    'challengeId': instance['challenge_id'],
                    'groupId': group_challenge.groupId,
                    'metadata': {
                        'instanceId': instance['pod_name'],
                        'completionTime': datetime.now().isoformat(),
                        'pointsEarned': group_challenge.points
                    }
                }
            )

    return updated_instance


# Main synchronization loop
async def sync_challenges():
    await connect_prisma()
    while True:
        try:
            logging.info(f"{datetime.now()}: Starting synchronization process")

            # Call the Flask API to get the current list of challenge pods
            response = requests.get("https://eductf.rydersel.cloud/instance-manager/api/list-challenge-pods")
            response.raise_for_status()
            challenge_pods = response.json().get("challenge_pods", [])
            logging.info(f"Retrieved {len(challenge_pods)} challenge pods from API")
            logging.debug(f"Challenge pods data: {challenge_pods}")

            # Get the current list of challenge instances from the database
            db_instances = await get_challenge_instances()
            logging.info(f"Retrieved {len(db_instances)} challenge instances from the database")

            # Create a dictionary of the current instances in the database for quick lookup
            db_instance_dict = {instance.id: instance for instance in db_instances}

            # Add or update instances based on the API response
            for pod in challenge_pods:
                logging.debug(f"Processing pod: {pod}")
                pod_id = pod['pod_name']

                # Get pod status from Kubernetes
                status_response = requests.get(
                    f"https://eductf.rydersel.cloud/instance-manager/api/get-pod-status",
                    params={"pod_name": pod_id}
                )
                current_status = "unknown"
                if status_response.ok:
                    status_data = status_response.json()
                    k8s_status = status_data.get("status", "unknown")
                    # Map Kubernetes status to our database status
                    if k8s_status == "active":
                        current_status = "running"
                    elif k8s_status == "creating" or k8s_status == "pending":
                        current_status = "creating"
                    elif k8s_status == "error" or k8s_status == "failed":
                        current_status = "error"
                    elif k8s_status == "deleting" or k8s_status == "terminated":
                        current_status = "terminated"
                    else:
                        current_status = k8s_status
                    logging.info(f"Pod {pod_id} k8s status: {k8s_status} mapped to: {current_status}")

                if pod_id not in db_instance_dict:
                    # Add new instance
                    await add_challenge_instance({
                        'pod_name': pod['pod_name'],
                        'challenge_id': pod.get('challenge_id', ''),
                        'user_id': pod.get('user_id', ''),
                        'competition_id': pod.get('competition_id', ''),
                        'challenge_image': pod.get('challenge_image', ''),
                        'challenge_url': pod.get('challenge_url', ''),
                        'status': current_status,
                        'flag_secret_name': pod.get('flag_secret_name', '')
                    })
                else:
                    # Update existing instance if necessary
                    db_instance = db_instance_dict[pod_id]
                    new_flag = get_flag(pod.get('flag_secret_name', ''))

                    # Check if status transition is valid
                    status_changed = db_instance.status != current_status
                    if status_changed:
                        logging.info(f"Status change for pod {pod_id}: {db_instance.status} -> {current_status}")

                    if (db_instance.userId != pod.get('user_id', '') or
                            db_instance.challengeImage != pod.get('challenge_image', '') or
                            status_changed or
                            db_instance.flagSecretName != pod.get('flag_secret_name', '') or
                            db_instance.competitionId != pod.get('competition_id', '') or
                            db_instance.flag != new_flag):
                        
                        pod['flag'] = new_flag
                        pod['status'] = current_status
                        await update_challenge_instance(pod)

                    # Remove the instance from the dictionary as it is already processed
                    del db_instance_dict[pod_id]

            # Remove instances that are no longer present in the API response
            for instance_id in db_instance_dict.keys():
                logging.info(f"Removing instance {instance_id} as it no longer exists in Kubernetes")
                await remove_challenge_instance(instance_id)

            logging.info(f"{datetime.now()}: Synchronization process completed")

        except Exception as e:
            logging.error(f"Error during synchronization: {e}")
            logging.exception("Full traceback:")

        await asyncio.sleep(2)  # Wait for 2 seconds before the next iteration


if __name__ == "__main__":
    asyncio.run(sync_challenges())
