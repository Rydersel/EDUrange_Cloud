import requests
import time
import json
import asyncio
import logging
from datetime import datetime
from prisma import Prisma
from dotenv import load_dotenv

load_dotenv()  #load enviromental variables

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
    flag = get_flag(instance.get('flag_secret_name', 'null'))
    await prisma.challengeinstance.create(
        data={
            'id': instance['pod_name'],
            'challengeId': 'temp',
            'userId': instance['user_id'],
            'challengeImage': instance.get('challenge_image', 'null'),
            'challengeUrl': instance.get('challenge_url', 'null'),
            'status': instance.get('status', 'null'),
            'flagSecretName': instance.get('flag_secret_name', 'null'),
            'flag': flag
        }
    )


# Remove a challenge instance from the Prisma database
async def remove_challenge_instance(instance_id):
    logging.info(f"Removing instance with ID: {instance_id}")
    await prisma.challengeinstance.delete(
        where={
            'id': instance_id
        }
    )


#  Update a challenge instance in the Prisma db
async def update_challenge_instance(instance):
    logging.info(f"Updating instance: {instance['challenge_url']}")
    current_flag = instance.get('flag', 'null')
    new_flag = get_flag(instance.get('flag_secret_name', 'null'))
    if current_flag != new_flag:
        logging.info(f"Updating flag from {current_flag} to {new_flag}")
    await prisma.challengeinstance.update(
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

            # Get the current list of challenge instances from the database
            db_instances = await get_challenge_instances()
            logging.info(f"Retrieved {len(db_instances)} challenge instances from the database")

            # Create a dictionary of the current instances in the database for quick lookup
            db_instance_dict = {instance.id: instance for instance in db_instances}

            # Add or update instances based on the API response
            for pod in challenge_pods:
                pod_id = pod['pod_name']
                if pod_id not in db_instance_dict:
                    # Add new instance
                    await add_challenge_instance(pod)
                else:
                    # Update existing instance if necessary
                    db_instance = db_instance_dict[pod_id]
                    new_flag = get_flag(pod['flag_secret_name'])
                    if (db_instance.userId != pod['user_id'] or
                            db_instance.challengeImage != pod['challenge_image'] or
                            db_instance.status != pod['status'] or
                            db_instance.flagSecretName != pod['flag_secret_name'] or
                            db_instance.flag != new_flag):
                        pod['flag'] = new_flag
                        await update_challenge_instance(pod)
                    # Remove the instance from the dictionary as it is already processed
                    del db_instance_dict[pod_id]

            # Remove instances that are no longer present in the API response
            for instance_id in db_instance_dict.keys():
                await remove_challenge_instance(instance_id)

            logging.info(f"{datetime.now()}: Synchronization process completed")

        except Exception as e:
            print(f"Error during synchronization: {e}")

        #TODO : Calculate preformace cost of running it this frequently
        await asyncio.sleep(2)  # Wait for 2000ms before the next iteration


if __name__ == "__main__":
    asyncio.run(sync_challenges())
