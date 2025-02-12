import logging
import os

from dotenv import load_dotenv

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from kubernetes import client, config
from challenge_utils.utils import delete_challenge_pod, load_config, get_pod_status_logic, get_secret, \
    decode_secret_data
from challenges import FullOsChallenge, WebChallenge, MetasploitChallenge

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

load_config()  # Initialize Kubernetes client configuration
load_dotenv()  # Load environment variables
url = os.getenv("INGRESS_URL")

@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        user_id = request.json['user_id']
        challenge_image = request.json['challenge_image']
        apps_config = request.json.get('apps_config', None)
        chal_type = request.json.get('chal_type')
        competition_id = request.json.get('competition_id')

        if not competition_id:
            return jsonify({"error": "competition_id is required"}), 400

    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400

    if chal_type == 'fullos':
        full_os_challenge = FullOsChallenge(
            user_id=user_id,
            challenge_image=challenge_image,
            yaml_path='templates/full-os-challenge-template.yaml',
            run_as_root=True,
            apps_config=apps_config,
            competition_id=competition_id
        )
        deployment_name, challenge_url, terminal_url, secret_name = full_os_challenge.create_pod_service_and_ingress()
        return jsonify({
            "success": True,
            "challenge_url": challenge_url,
            "terminal_url": terminal_url,
            "deployment_name": deployment_name,
            "flag_secret_name": secret_name
        }), 200
    elif chal_type == 'web':
        web_challenge = WebChallenge(
            user_id=user_id,
            challenge_image=challenge_image,
            yaml_path='templates/web-challenge-template.yaml',
            apps_config=apps_config,
            competition_id=competition_id
        )
        deployment_name, challenge_url, secret_name = web_challenge.create_pod_service_and_ingress()
        return jsonify({
            "success": True,
            "challenge_url": challenge_url,
            "deployment_name": deployment_name,
            "flag_secret_name": secret_name
        }), 200
    elif chal_type == 'metasploit':
        metasploit_challenge = MetasploitChallenge(
            user_id=user_id,
            attack_image=f"{challenge_image}-attack",
            defence_image=f"{challenge_image}-defence",  # Target System
            yaml_path='templates/metasploit-challenge-template.yaml',
            apps_config=apps_config,
            competition_id=competition_id
        )
        deployment_name, challenge_url, terminal_url, secret_name = metasploit_challenge.create_pod_service_and_ingress()
        return jsonify({
            "success": True,
            "challenge_url": challenge_url,
            "terminal_url": terminal_url,
            "deployment_name": deployment_name,
            "flag_secret_name": secret_name
        }), 200
    else:
        return jsonify({"error": "Invalid challenge type"}), 400


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

        for pod in pods.items:  # Probally fine
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

                challenge_url = f"https://{pod.metadata.name}.{url}"
                creation_time = pod.metadata.creation_timestamp
                status = get_pod_status_logic(pod)

                challenge_pods.append({
                    "pod_name": pod.metadata.name,
                    "user_id": user_id,
                    "challenge_image": challenge_image,
                    "challenge_url": challenge_url,
                    "flag_secret_name": flag_secret_name,
                    "creation_time": creation_time,
                    "status": status
                })

        return jsonify({"challenge_pods": challenge_pods}), 200
    except Exception as e:
        logging.error(f"Error listing challenge pods: {e}")
        return jsonify({"error": "Error listing challenge pods"}), 500


@app.route('/api/get-secret', methods=['POST'])  # Will add auth later
def get_secret_value(): # Evil ah endpoint
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

        if pod.metadata.deletion_timestamp:  # Work around for deleting status not showing up
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
