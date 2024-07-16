import logging
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from kubernetes import client, config
from challenge_utils.utils import create_pod_service_and_ingress, delete_challenge_pod, load_config, wait_for_url, \
    get_secret, decode_secret_data
from challenges import FullOsChallenge, WebChallenge

logging.basicConfig(level=logging.DEBUG)


app = Flask(__name__)
CORS(app)

load_config()  # Initialize Kubernetes client configuration


@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        user_id = request.json['user_id']
        challenge_image = request.json['challenge_image']
        apps_config = request.json.get('apps_config', None)
        chal_type = request.json.get('chal_type')


    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    if chal_type == 'fullos':
        full_os_challenge = FullOsChallenge(
            user_id=user_id,
            challenge_image=challenge_image,
            yaml_path='templates/full-os-challenge-template.yaml',
            run_as_root=True,
            apps_config=apps_config
        )
        deployment_name, challenge_url, secret_name = full_os_challenge.create_pod_service_and_ingress()
    elif chal_type == 'web':
        web_challenge = WebChallenge(
            user_id=user_id,
            challenge_image=challenge_image,
            yaml_path='templates/web-challenge-template.yaml',
            apps_config=apps_config
        )
        deployment_name, challenge_url, secret_name = web_challenge.create_pod_service_and_ingress()
    else:
        return jsonify({"error": "Invalid challenge type"}), 400


    if not challenge_url:
        response = jsonify({"error": "Invalid URL provided"}), 400
        logging.error(f"Invalid URL provided: challenge_url={challenge_url}")
        return response

    # Wait until the challenge URL stops giving a 503 status
    # while not wait_for_url(challenge_url):
    # logging.info(f"Waiting for challenge URL {challenge_url} to stop giving a 503 status")
    # if wait_for_url(challenge_url):
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
                creation_time = pod.metadata.creation_timestamp
                challenge_pods.append({
                    "pod_name": pod.metadata.name,
                    "user_id": user_id,
                    "challenge_image": challenge_image,
                    "challenge_url": challenge_url,
                    "flag_secret_name": flag_secret_name,
                    "creation_time": creation_time
                })

        return jsonify({"challenge_pods": challenge_pods}), 200
    except Exception as e:
        logging.error(f"Error listing challenge pods: {e}")
        return jsonify({"error": "Error listing challenge pods"}), 500


@app.route('/api/get-secret', methods=['POST'])  # Will add auth later
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


@app.route('/api/get-pod-status', methods=['GET'])
def get_pod_status():
    try:
        pod_name = request.args.get('pod_name')
        if not pod_name:
            return jsonify({"error": "Missing pod_name parameter"}), 400

        v1 = client.CoreV1Api()
        pod = v1.read_namespaced_pod(name=pod_name, namespace='default')

        if pod.metadata.deletion_timestamp: # Work around for deleting status not showing up
            status = 'deleting'
        elif pod.status.phase == 'Pending':
            status = 'creating'
        elif pod.status.phase == 'Running':
            status = 'active'
        elif pod.status.phase == 'Failed':
            status = 'error'
        elif pod.status.phase == 'Succeeded':
            status = 'deleting'
        else:
            status = pod.status.phase

        return jsonify({"pod_name": pod_name, "status": status}), 200
    except client.exceptions.ApiException as e:
        logging.error(f"API Exception: {e}")
        return jsonify({"error": "Error fetching pod status"}), 500
    except Exception as e:
        logging.error(f"Error fetching pod status: {e}")
        return jsonify({"error": "Error fetching pod status"}), 500

