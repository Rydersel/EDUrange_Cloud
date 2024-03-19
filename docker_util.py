import os
import docker
import subprocess


client = docker.from_env()


def interactive_container_shell(container_id): #not currently using

    while True:
        user_command = input("command: ")
        result = subprocess.run(user_command, shell=True, capture_output=True, text=True)

        if result.returncode == 0:
            print(result.stdout)
        else:
            print("Error:", result.stderr)

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



def start_challenge(challenge_number):
    # Path where disk_image.bin is saved
    challenge_file_dir = os.path.abspath(f"challenge_{str(challenge_number)}")
    challenge_file_path = os.path.join(challenge_file_dir, f"disk_image.bin")

    client = docker.from_env()
    image_name = 'ctf_challenge_image'

    # Ensure the challenge file exists
    if not os.path.exists(challenge_file_path):
        print(f"Challenge file {challenge_file_path} does not exist.")
        return

    try:
        # Remove existing container to ensure a fresh start
        try:
            container = client.containers.get(f"ctf_challenge_{challenge_number}")
            container.remove(force=True)
        except docker.errors.NotFound:
            pass  # Container does not exist, proceed

        # Run a new container with the challenge file directory mounted
        container = client.containers.run(
            image_name,
            "/bin/bash",
            name=f"ctf_challenge_{challenge_number}",
            volumes={challenge_file_dir: {'bind': '/ctf/challenge', 'mode': 'ro'}},
            detach=True,
            tty=True
        )

        print(f"Challenge {challenge_number} environment is ready. Container ID: {container.id}")
    except Exception as e:
        print(f"An error occurred: {e}")
