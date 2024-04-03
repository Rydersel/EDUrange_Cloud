from flask import Flask, request, jsonify
from kubernetes import client, config
from flask_cors import CORS #Fuck you CORS
import uuid


from kubernetes.config import load_incluster_config

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

# Initialize Kubernetes client configuration

config.load_kube_config()  #for local development
#load_incluster_config()  #for prod

def create_challenge_deployment(user_id):
    # Replace underscores with hyphens in user_id and ensure lowercase
    sanitized_user_id = user_id.replace("_", "-").lower()
    deployment_name = f"ctfchal-{sanitized_user_id}-{str(uuid.uuid4())[:8]}".lower()

    container_port = 5000  # MUST MATCH PORT CHAL CONTAINER LISTENS ON

    # Define the deployment with sanitized deployment_name
    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"user": sanitized_user_id}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"user": sanitized_user_id}),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=deployment_name,  # Ensure this name also follows the conventions
                            image="gcr.io/edurangectf/web-1",  # Specify your challenge image
                            ports=[client.V1ContainerPort(container_port=container_port)]
                        )
                    ]
                )
            )
        )
    )

    # Create the deployment in Kubernetes
    api = client.AppsV1Api()
    api.create_namespaced_deployment(
        body=deployment,
        namespace="default"
    )
    # Construct the challenge URL appropriately
    challenge_url = f"http://127.0.0.1:5000/{deployment_name}"  # Currently hardcoded for testing,  will change.
    return deployment_name, challenge_url

def delete_challenge_deployment(deployment_name):
    # delete user challenge
    api = client.AppsV1Api()
    api.delete_namespaced_deployment(
        name=deployment_name,
        namespace="default",  # Specify your namespace if different
        body=client.V1DeleteOptions(propagation_policy='Foreground')
    )

@app.route('/api/start-challenge', methods=['POST'])
def start_challenge():
    # API endpoint to start challenge.

    user_id = request.json['user_id']
    deployment_name, challenge_url = create_challenge_deployment(user_id)
    return jsonify({"message": "Challenge started", "deployment_name": deployment_name, "url": challenge_url})

@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    # API endpoint to end challenge.
    deployment_name = request.json['deployment_name']
    delete_challenge_deployment(deployment_name)
    return jsonify({"message": "Challenge ended"})



if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5001)
