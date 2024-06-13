from time import sleep

from flask import Flask, request, jsonify
from flask_cors import CORS
from challenge_utils.local import deploy_challenge, delete_challenge, wait_for_pod, find_free_port, port_forward
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.DEBUG)

@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    try:
        user_id = request.json['user_id']
        challenge_image = request.json['challenge_image']
        instance_name = f"challenge-{user_id}"

        # Deploy the challenge with the specified image
        deploy_challenge(instance_name, challenge_image)

        # Wait for the pod to be ready
        wait_for_pod(instance_name)



        namespace = "default"
        #local_port = find_free_port()
        local_port = 34800
        challenge_url = f"http://localhost:{local_port}"
        pod_port = 5000  # Assuming your service listens on port 5000 inside the pod
        pod_name = f"{instance_name}-challenge"
        logging.info(f"Attempting to open port {local_port}")

        port_forward(instance_name, namespace, local_port, pod_port)

        return jsonify({"message": "Challenge started", "deployment_name": instance_name, "url": challenge_url})
    except Exception as e:
        logging.error(f"Error starting challenge: {e}")
        return jsonify({"message": "Internal Server Error"}), 500

@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    try:
        deployment_name = request.json['deployment_name']

        # Delete the challenge deployment
        delete_challenge(deployment_name)

        return jsonify({"message": "Challenge ended"})
    except Exception as e:
        logging.error(f"Error ending challenge: {e}")
        return jsonify({"message": "Internal Server Error"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
