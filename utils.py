import importlib.util
import pty
import shutil
import subprocess
import sys


def load_challenge(challenge_number):
    # Dynamically loads file_carving_2 and solution modules for a given file_carving_2 number.

    challenge_module_name = f"challenges.challenge_{str(challenge_number)}.challenge_{challenge_number}"
    solution_module_name = f"challenges.challenge_{str(challenge_number)}.solution_{challenge_number}"

    challenge_module = dynamic_import(challenge_module_name)
    solution_module = dynamic_import(solution_module_name)

    return challenge_module, solution_module


def dynamic_import(module_name):
    # Dynamically imports a module based on its module name.

    try:
        module_spec = importlib.util.find_spec(module_name)
        if module_spec is None:
            print(f"Module {module_name} not found.")
            return None
        module = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(module)
        return module
    except ImportError as e:
        print(f"Error importing module {module_name}: {e}")
        return None



def start_ctf_container():
    subprocess.run(["docker", "run", "--name", "ctf_instance", "ctf_challenge"])

def start_ctf_container_interactively():
    # Command to run the Docker container interactively
    command = ["docker", "run", "-it", "--name", "ctf_instance1", "ctf_challenge"]

    # Use pty.spawn to run the command in a new pseudo-terminal
    pty.spawn(command)


def del_challenge_directory(challenge_number):
    challenge_dir = f"challenge_{challenge_number}"

    print(challenge_dir)
    shutil.rmtree(challenge_dir)
    print(f"Deleted {challenge_dir}")
def shutdown_container(container_name):
    """
    Stops and removes a Docker container by name.

    :param container_name: The name of the Docker container to stop and remove.
    """
    try:
        # Stop the container
        subprocess.run(["docker", "stop", container_name], check=True)
        print(f"Container '{container_name}' stopped.")

        # Remove the container
        subprocess.run(["docker", "rm", container_name], check=True)
        print(f"Container '{container_name}' removed.")
    except subprocess.CalledProcessError as e:
        print(f"Error stopping or removing container '{container_name}': {e}")


def verify_solution_and_cleanup(challenge_number, user_answer, correct_answer):
    # Verify Solution
    print("debug",user_answer)
    print("debug2", correct_answer)
    if user_answer == correct_answer:
        del_challenge_directory(challenge_number)  # cleanup
        return 0
    else:
        print("Incorrect, try again")
        print(correct_answer)
        return 1
