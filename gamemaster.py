import os

import docker

client = docker.from_env()

def start_challenge_container(challenge_id):
    """Starts a Docker container for a given challenge."""
    container_name = f"ctf_challenge_{challenge_id}"
    try:
        # Stops the container if it's already running
        container = client.containers.get(container_name)
        container.stop()
        container.remove()
    except docker.errors.NotFound:
        pass

    # Runs a new container
    client.containers.run("ctf_challenge_image", name=container_name, detach=True,
                          volumes={os.path.abspath(f"challenges/challenge_{str(challenge_id).zfill(2)}"): {'bind': '/ctf/challenge', 'mode': 'rw'}})
    print(f"Challenge {challenge_id} environment is ready.")

def game_master():
    from openai import OpenAI
    client = OpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
    )

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "what is 5+5",
            }
        ],
        model="gpt-3.5-turbo",
    )
