from flask import Flask, request, jsonify
from kubernetes import client, config
from kubernetes.config import load_incluster_config
from flask_cors import CORS  # Fuck you CORS
from challenge_utils.prod import create_challenge_deployment, delete_challenge_deployment, load_config


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

load_config()  # Initialize Kubernetes client configuration


@app.route('/api/start-challenge', methods=['POST'])    # API endpoint to start challenge.
def start_challenge():

    user_id = request.json['user_id']
    deployment_name, challenge_url = create_challenge_deployment(user_id, "gcr.io/edurangectf/web-1")
    return jsonify({"message": "Challenge started", "deployment_name": deployment_name, "url": challenge_url})


@app.route('/api/end-challenge', methods=['POST'])     # API endpoint to end challenge.
def end_challenge():
    deployment_name = request.json['deployment_name']
    delete_challenge_deployment(deployment_name)
    return jsonify({"message": "Challenge ended"})


if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5001) #temp
