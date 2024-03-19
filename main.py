import os
import shutil

from utils import load_challenge
from utils import verify_solution_and_cleanup
from gamemaster import game_master
from utils import del_challenge_directory
from utils import start_ctf_container
from utils import start_ctf_container_interactively
from gamemaster import start_challenge_container
from utils import shutdown_container




def main_menu():
    # temp console menu
    while True:
        print("\nCTF Challenge Manager")
        shutdown_container("ctf_instance1")
        print("API Key:", os.getenv("OPENAI_API_KEY"))
        game_master()
        choice = input("Enter the challenge number to work with (or 'exit' to quit): ")

        if choice.lower() == 'exit':
            print("Exiting...")
            break

        try:

            challenge_number = int(choice)
            challenge_module, solution_module = load_challenge(challenge_number)

          

            action = input(
                f"Select action for Challenge {challenge_number}: (1) Generate, (2) Del Directory:, (3) Back ")

            if action == '1':
                print(f"Generating Challenge {challenge_number}...")
                challenge_module.create_disk_image()
                print("Challenge generated successfully.")
                while True:
                    user_answer = input("Flag: ")

                    print(f"Verifying Solution for Challenge {challenge_number}...")
                    ans = solution_module.extract_answer()
                    print(ans)

                    if verify_solution_and_cleanup(challenge_number, user_answer,
                                                   solution_module.extract_answer()) == 0:
                        print("Correct answer!")
                        break

                    else:
                        continue
            else:
                print("Invalid action.")

            if action == '2':
                del_challenge_directory(challenge_number)
            if action == '3':
                break
        except ValueError:
            print("Please enter a valid challenge number.")
        except ModuleNotFoundError:
            print(f"Challenge {choice} does not exist.")


if __name__ == "__main__":
    main_menu()
