from flask import Flask, request, render_template, jsonify
import subprocess
import os
from main import start_challenge
from main import generate_challenge
from utils import load_challenge
from utils import verify_solution_and_cleanup
from docker_util import start_challenge
from utils import del_challenge_directory
from utils import start_ctf_container
from utils import start_ctf_container_interactively
from docker_util import start_challenge_container
from utils import shutdown_container
from docker_util  import interactive_container_shell
app = Flask(__name__)

global docker_id
@app.route('/execute_command', methods=['POST'])
def execute_command():
    user_command = request.form['command']
    challenge_number = request.form['challenge_number']
    result = subprocess.run(user_command, shell=True, capture_output=True, text=True)

    if result.returncode == 0:
        print(result.stdout, "\n")
        output = result.stdout
    else:
        output = ("Error:", result.stderr, "\n")
        print("error")



    return jsonify({'output': output})




@app.route('/')
def home():
    # Render a simple home page that lists challenges
    # In a real app, you'd dynamically list available challenges
    challenges = [1, 2, 3]  # Example challenge numbers
    return render_template('index.html', challenges=challenges)

@app.route('/start_challenge/<int:challenge_number>', methods=['GET'])
def start_challenge(challenge_number):


    docker_id = (generate_challenge(challenge_number))
    return render_template('challenge_started.html', challenge_number=challenge_number)



if __name__ == "__main__":
    app.run(debug=True)

