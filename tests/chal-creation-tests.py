import unittest
from unittest.mock import patch
from kubernetes import client
import time

from challenge_utils.prod import create_challenge_deployment, delete_challenge_deployment, load_config

load_config()

class TestInstanceManager(unittest.TestCase):

    def test_create_and_delete_deployment(self):
        user_id = "test_user"
        deployment_name, challenge_url = create_challenge_deployment(user_id, "gcr.io/edurangectf/web-1")
        print(challenge_url)
        # Verify deployment creation
        api = client.AppsV1Api()
        deployment = api.read_namespaced_deployment(name=deployment_name, namespace="default")
        self.assertIsNotNone(deployment)

        # Delete the deployment
        delete_challenge_deployment(deployment_name)

        # Verify deployment deletion
        try:
            print("Attempting to delete deployment")
            time.sleep(10)
            api.read_namespaced_deployment(name=deployment_name, namespace="default")

            self.fail("Deployment was not deleted")
        except client.rest.ApiException as e:
            if e.status != 404:
                raise
