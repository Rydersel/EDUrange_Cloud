import logging
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from kubernetes import client, config
from challenge_utils.ingress import create_pod_service_and_ingress, delete_challenge_pod, load_config, wait_for_url, \
    get_secret, decode_secret_data

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

    deployment_name, challenge_url, secret_name = create_pod_service_and_ingress(user_id, challenge_image,'challenge-template.yaml', True)

    if not challenge_url:
        response = jsonify({"error": "Invalid URL provided"}), 400
        logging.error(f"Invalid URL provided: challenge_url={challenge_url}")
        return response

    # Wait until the challenge URL stops giving a 503 status
   # while not wait_for_url(challenge_url):
       # logging.info(f"Waiting for challenge URL {challenge_url} to stop giving a 503 status")
    #if wait_for_url(challenge_url):
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


@app.route('/api/list-challenge-pods', methods=['GET'])
def list_challenge_pods():
    try:
        v1 = client.CoreV1Api()
        pods = v1.list_pod_for_all_namespaces(watch=False)
        challenge_pods = []

        for pod in pods.items:
            if pod.metadata.name.startswith('ctfchal-'):
                user_id = pod.metadata.labels.get('user', 'unknown')
                challenge_image = 'unknown'
                for container in pod.spec.containers:
                    if container.name == 'challenge-container':
                        challenge_image = container.image
                    if container.name == "bridge":
                        for env_var in container.env:
                            if env_var.name == 'flag_secret_name':
                                flag_secret_name = env_var.value
                                break

                challenge_url = f"http://{pod.metadata.name}.rydersel.cloud"

                challenge_pods.append({
                    "pod_name": pod.metadata.name,
                    "user_id": user_id,
                    "challenge_image": challenge_image,
                    "challenge_url": challenge_url,
                    "flag_secret_name": flag_secret_name
                })

        return jsonify({"challenge_pods": challenge_pods}), 200
    except Exception as e:
        logging.error(f"Error listing challenge pods: {e}")
        return jsonify({"error": "Error listing challenge pods"}), 500


@app.route('/api/get-secret', methods=['POST'])
def get_secret_value():
    try:
        secret_name = request.json['secret_name']
        namespace = request.json.get('namespace', 'default')
    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    secret = get_secret(secret_name, namespace)
    if secret:
        decoded_data = decode_secret_data(secret)
        secret_value = decoded_data.get('flag', 'Flag not found in secret')

    return jsonify({"secret_value": secret_value})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
