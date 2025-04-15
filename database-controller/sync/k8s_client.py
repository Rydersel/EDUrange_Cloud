import logging
import os
import json
import urllib.parse
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class K8sClient:
    def __init__(self):
        # Get the instance manager URL from environment variable or use default
        self.instance_manager_url = os.environ.get('INSTANCE_MANAGER_URL', '')
        
        # If INSTANCE_MANAGER_URL doesn't end with a slash, add one
        if self.instance_manager_url and not self.instance_manager_url.endswith('/'):
            self.instance_manager_url += '/'
            
        # Log the configured URL
        logging.info(f"Using INSTANCE_MANAGER_URL: {self.instance_manager_url}")
        
    def get_instance_manager_url(self):
        """Get the instance manager URL"""
        return self.instance_manager_url
        
    def get_challenge_pods(self):
        """Get the current list of challenge pods from the instance manager"""
        if not self.instance_manager_url:
            logging.error("INSTANCE_MANAGER_URL is not set or empty. Cannot proceed.")
            return []
            
        # Construct the API endpoint URL with consistent handling
        api_url = urllib.parse.urljoin(self.instance_manager_url.rstrip('/') + '/', 'list-challenge-pods')
        logging.info(f"Calling API endpoint: {api_url}")
        
        try:
            response = requests.get(api_url, timeout=10)
            response.raise_for_status()
            challenge_pods = response.json().get("challenge_pods", [])
            logging.info(f"Retrieved {len(challenge_pods)} challenge pods from API")
            
            if not challenge_pods:
                logging.warning("No challenge pods returned from API")
            else:
                logging.debug(f"First pod data sample: {challenge_pods[0]}")
                
            return challenge_pods
        except requests.exceptions.Timeout:
            logging.error("Timeout while fetching challenge pods from API")
            return []
        except requests.exceptions.RequestException as e:
            logging.error(f"Error fetching challenge pods from API: {str(e)}")
            return []
            
    def get_pod_status(self, pod_name):
        """Get the status of a specific pod from the instance manager"""
        if not self.instance_manager_url:
            logging.error("INSTANCE_MANAGER_URL is not set or empty. Cannot proceed.")
            return "unknown"
            
        try:
            status_response = requests.get(
                f"{self.instance_manager_url.rstrip('/')}/get-pod-status",
                params={"pod_name": pod_name},
                timeout=5
            )
            status_response.raise_for_status()
            status_data = status_response.json()
            k8s_status = status_data.get("status", "unknown")
            return k8s_status
        except Exception as e:
            logging.error(f"Error fetching status for pod {pod_name}: {str(e)}")
            return "unknown"
            
    def get_flag(self, secret_name, pod_name=None):
        """
        Get flag from a Kubernetes secret

        Args:
            secret_name (str): Name of the secret containing the flag (can be None)
            pod_name (str, optional): Name of the pod, used as fallback if secret_name fails

        Returns:
            str: The flag value or "null" if not found
        """
        try:
            # Validate the secret_name parameter - handle None, "null", empty string, or whitespace
            if secret_name is None or secret_name == "null" or not secret_name or not secret_name.strip():
                logging.warning(f"Invalid secret name provided: '{secret_name}'")

                # If we have a pod_name, try to use the predictable pattern instead
                if pod_name and pod_name.startswith('ctfchal-'):
                    derived_secret_name = f"flag-secret-{pod_name}"
                    logging.info(f"Using derived secret name based on pod name: {derived_secret_name}")
                    # Try again with the derived name
                    return self.get_flag(derived_secret_name)

                # If no pod_name or derived secret fails
                return "null"

            logging.info(f"Fetching flag for secret name: {secret_name}")
            response = requests.post(f"{self.instance_manager_url}/get-secret",
                                    json={"secret_name": secret_name},
                                    timeout=10)  # Add timeout to prevent hanging requests

            if not response.ok and pod_name and pod_name.startswith('ctfchal-'):
                # If getting the flag by secret name failed, try using the pod name directly
                logging.info(f"Secret {secret_name} not found, trying pod name directly: {pod_name}")
                response = requests.post(f"{self.instance_manager_url}/get-secret",
                                        json={"secret_name": pod_name},
                                        timeout=10)

            logging.info(f"Response status code: {response.status_code}")

            # Even if the request failed, try to parse the response
            # as the modified API now returns a "secret_value": "null" even for errors
            try:
                data = response.json()
                flag = data.get("secret_value", "null")
                if flag is None:
                    flag = "null"  # Convert None to string "null" for consistency
                logging.info(f"Retrieved flag for {secret_name}: {flag}")
                return flag
            except Exception as json_error:
                logging.error(f"Error parsing flag response JSON: {json_error}")
                if not response.ok:
                    response.raise_for_status()  # This will raise an exception if the request failed
                return "null"

        except Exception as e:
            logging.error(f"Error fetching flag for {secret_name}: {e}")
            return "null"
