import logging
import requests
from flask import Flask, request, jsonify
from kubernetes import client, config
from kubernetes.config import load_incluster_config
from flask_cors import CORS
from challenge_utils.prod import create_challenge_deployment, delete_challenge_deployment, load_config, create_webos

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

    webos_url = f"http://{create_webos(user_id)}"
    logging.debug(f"Received webos_url: {webos_url}")

    deployment_name, challenge_url = create_challenge_deployment(user_id, challenge_image, 'challenge-template.yaml',
                                                                 True)

    if not webos_url or not challenge_url:
        response = jsonify({"error": "Invalid URL provided"}), 400
        logging.error(f"Invalid URL provided: webos_url={webos_url}, challenge_url={challenge_url}")
        return response

    try:
        logging.debug(f"Sending POST request to {webos_url}/api/load-chal with payload: {{'ip': '{challenge_url}'}}")
        response = requests.post(f"{webos_url}/api/load-chal", json={"ip": challenge_url})
        response.raise_for_status()
        return jsonify({"success": True}), 200
    except requests.exceptions.ConnectionError as e:
        logging.error(f"Connection error: {e}")
        return jsonify({"error": "Failed to connect to WebOS API", "details": str(e)}), 500
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP error: {e}")
        return jsonify({"error": "HTTP error occurred while sending challenge IP to WebOS", "details": str(e)}), 500
    except requests.exceptions.RequestException as e:
        logging.error(f"Request exception: {e}")
        return jsonify({"error": "Failed to send challenge IP to WebOS", "details": str(e)}), 500


@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    try:
        deployment_name = request.json['deployment_name']
    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    delete_challenge_deployment(deployment_name)
    return jsonify({"message": "Challenge ended"})


if __name__ == '__main__':
    app.run(debug=True)
