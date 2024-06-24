import logging
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from kubernetes import client, config
from challenge_utils.ingress import create_pod_service_and_ingress, delete_challenge_pod, load_config

# Initialize logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
CORS(app)

load_config()  # Initialize Kubernetes client configuration

@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        user_id = request.json['user_id']
        challenge_image = request.json['challenge_image']
    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    deployment_name, challenge_url = create_pod_service_and_ingress(user_id, challenge_image, 'challenge-template.yaml', True)

    if not challenge_url:
        response = jsonify({"error": "Invalid URL provided"}), 400
        logging.error(f"Invalid URL provided: challenge_url={challenge_url}")
        return response

    return jsonify({"success": True, "challenge_url": challenge_url, "deployment_name": deployment_name}), 200

@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    try:
        pod_name = request.json['deployment_name']
    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    delete_challenge_pod(pod_name)
    return jsonify({"message": "Challenge ended"})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
