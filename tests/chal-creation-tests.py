import unittest
import requests


class TestInstanceManagerAPI(unittest.TestCase):
    BASE_URL = "https://eductf.rydersel.cloud/instance-manager/api"

    def test_start_challenge(self):
        payload = {
            "user_id": "cm6vek5c300008qdd2i97djbg",
            "challenge_image": "registry.rydersel.cloud/bandit1"
        }
        response = requests.post(f"{self.BASE_URL}/start-challenge", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertIn("success", response.json())
        self.assertIn("challenge_url", response.json())
        self.assertTrue(response.json()["success"])

        # Store the deployment name for cleanup
        challenge_url = response.json()["challenge_url"]
        deployment_name = response.json()["deployment_name"]

        # Cleanup: Delete the created pod and service
        self.delete_challenge(deployment_name)

    def delete_challenge(self, deployment_name):
        payload = {
            "deployment_name": deployment_name
        }
        response = requests.post(f"{self.BASE_URL}/end-challenge", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.json())
        self.assertEqual(response.json()["message"], "Challenge ended")



if __name__ == "__main__":
    unittest.main()
