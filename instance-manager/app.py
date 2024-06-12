from flask import Flask, request, jsonify
from kubernetes import client, config
from flask_cors import CORS
from challenge_utils.local import deploy_challenge, delete_challenge, wait_for_pod, find_free_port

app = Flask(__name__)
CORS(app)

config.load_incluster_config()
v1 = client.CoreV1Api()
apps_v1 = client.AppsV1Api()


@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    user_id = request.json['user_id']
    challenge_image = request.json['challenge_image']
    instance_name = f"challenge-{user_id}"

    # Deploy the challenge with the specified image
    deploy_challenge(instance_name, challenge_image)

    # Wait for the pod to be ready
    wait_for_pod(instance_name)

    # Construct the challenge URL based on the instance name
    challenge_url = f"http://localhost:{find_free_port()}"

    return jsonify({"message": "Challenge started", "deployment_name": instance_name, "url": challenge_url})


@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    deployment_name = request.json['deployment_name']

    # Delete the challenge deployment
    delete_challenge(deployment_name)

    return jsonify({"message": "Challenge ended"})


if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5002)
