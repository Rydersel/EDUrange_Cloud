from flask import Flask, request, jsonify
from kubernetes import client, config
import uuid

from kubernetes.config import load_incluster_config

app = Flask(__name__)

# Initialize Kubernetes client configuration

#config.load_kube_config()  #for local development
load_incluster_config()

def create_challenge_deployment(user_id): # create chal instance
    deployment_name = f"file-carving-{user_id}-{str(uuid.uuid4())[:8]}"
    container_port = 5000  # needs to match the port of challenge container

    # Define the deployment
    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=deployment_name),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"user": user_id}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"user": user_id}),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=deployment_name,
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
    return deployment_name

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
    # API endpoint to start a challenge.
    user_id = request.json['user_id']
    deployment_name = create_challenge_deployment(user_id)
    return jsonify({"message": "Challenge started", "deployment_name": deployment_name})

@app.route('/api/end-challenge', methods=['POST'])
def end_challenge():
    # API endpoint to end a challenge.
    deployment_name = request.json['deployment_name']
    delete_challenge_deployment(deployment_name)
    return jsonify({"message": "Challenge ended"})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
