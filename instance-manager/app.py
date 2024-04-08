from flask import Flask, request, jsonify
from kubernetes import client, config
from kubernetes.config import load_incluster_config
from flask_cors import CORS  # Fuck you CORS
from challenge_utils.prod import create_challenge_deployment, delete_challenge_deployment, load_config

#docker buildx build --platform linux/amd64,linux/arm64 -t gcr.io/edurangectf/web-1 . --push

app = Flask(__name__)
CORS(app)

load_config()  # Initialize Kubernetes client configuration


@app.route('/api/start-challenge', methods=['POST'])    # API endpoint to start challenge.
def start_challenge():

    user_id = request.json['user_id']
    deployment_name, challenge_url = create_challenge_deployment(user_id, "gcr.io/edurangectf/web-1:latest")
    return jsonify({"message": "Challenge started", "deployment_name": deployment_name, "url": challenge_url})


@app.route('/api/end-challenge', methods=['POST'])     # API endpoint to end challenge.
def end_challenge():
    deployment_name = request.json['deployment_name']
    delete_challenge_deployment(deployment_name)
    return jsonify({"message": "Challenge ended"})


if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5001) #temp
