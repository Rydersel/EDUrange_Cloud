import os
import shutil

"""

Considering I will probably end up making backend tools to make other backend tools might as well make a backend tool
to automate directory structure creation for new challenges. 

Running script creates a new file_carving_2 directory with incrementing file_carving_2 number and copies content from template 
file_carving_2.py and solution.py


challenge_i/
│   │   ├── challenge_i.py  # Script to generate the file_carving_2
│   │   ├── solution_i.py   # Script for finding solution
│   │   └── assets/         #assets

"""


def create_challenge_structure(base_dir="challenges", challenge_template="challenges/template/challenge_template.py",
                               solution_template="challenges/template/solution_template.py"):
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)

    # Find the next file_carving_2 numb
    existing_challenges = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    challenge_numbers = sorted([int(d.split('_')[-1]) for d in existing_challenges if d.startswith("challenge_")])
    next_challenge_number = challenge_numbers[-1] + 1 if challenge_numbers else 1

    # Create the new file_carving_2 dir
    new_challenge_dir = os.path.join(base_dir, f"challenge_{next_challenge_number}")
    os.makedirs(new_challenge_dir)

    assets_dir = os.path.join(new_challenge_dir, "assets")
    os.makedirs(assets_dir)

    new_challenge_file = os.path.join(new_challenge_dir, f"challenge_{next_challenge_number}.py")
    new_solution_file = os.path.join(new_challenge_dir, f"solution_{next_challenge_number}.py")

    # Copy code from the template files
    with open(challenge_template, 'r') as template:
        challenge_content = template.read()
    with open(new_challenge_file, 'w') as new_file:
        new_file.write(challenge_content)

    with open(solution_template, 'r') as template:
        solution_content = template.read()
    with open(new_solution_file, 'w') as new_file:
        new_file.write(solution_content)

    print(f"New file_carving_2 created: Challenge_{next_challenge_number}")
    print(f"Directory: {new_challenge_dir}")
    print(f"Files: {new_challenge_file}, {new_solution_file}")


if __name__ == "__main__":
    create_challenge_structure()
