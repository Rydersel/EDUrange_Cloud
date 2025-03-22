import logging
import os
import json

from dotenv import load_dotenv

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from kubernetes import client, config
from kubernetes.stream import stream
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
            competition_id=competition_id,

        )
        deployment_name, web_challenge_url, secret_name = web_challenge.create_pod_service_and_ingress()
        # The WebOS URL is different from the web challenge URL
        webos_url = f"https://{deployment_name}.{url}"
        return jsonify({
            "success": True,
            "challenge_url": webos_url,  # This is the WebOS URL
            "web_challenge_url": web_challenge_url,  # This is the actual web challenge URL
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

    success = delete_challenge_pod(pod_name)
    return jsonify({
        "success": success,
        "message": f"Challenge pod {pod_name} deleted successfully" if success else f"Failed to delete challenge pod {pod_name}"
    }), 200 if success else 500


@app.route('/api/update-challenge', methods=['POST'])
def update_challenge():
    try:
        pod_name = request.json['pod_name']
        apps_config = request.json['apps_config']
        
        logging.info(f"Updating apps_config for pod {pod_name}")
        
        # Get the pod to check if it exists
        v1 = client.CoreV1Api()
        try:
            pod = v1.read_namespaced_pod(name=pod_name, namespace="default")
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logging.error(f"Pod {pod_name} not found")
                return jsonify({"error": f"Pod {pod_name} not found"}), 404
            else:
                logging.error(f"Error getting pod {pod_name}: {e}")
                return jsonify({"error": f"Error getting pod {pod_name}: {e}"}), 500
        
        # Extract the flagSecretName from the apps_config
        flag_secret_name = None
        try:
            parsed_apps_config = json.loads(apps_config)
            for app in parsed_apps_config:
                if app.get("id") == "challenge-prompt" and "challenge" in app:
                    flag_secret_name = app["challenge"].get("flagSecretName")
                    break
        except Exception as e:
            logging.warning(f"Failed to extract flagSecretName from apps_config: {e}")
        
        # Create a ConfigMap to store the apps_config
        config_map_name = f"{pod_name}-apps-config"
        try:
            # Try to get existing ConfigMap
            try:
                v1.read_namespaced_config_map(name=config_map_name, namespace="default")
                # If it exists, delete it first
                v1.delete_namespaced_config_map(name=config_map_name, namespace="default")
                logging.info(f"Deleted existing ConfigMap {config_map_name}")
            except client.exceptions.ApiException as e:
                if e.status != 404:  # Ignore if it doesn't exist
                    logging.warning(f"Error deleting ConfigMap {config_map_name}: {e}")
            
            # Create new ConfigMap
            config_map = client.V1ConfigMap(
                metadata=client.V1ObjectMeta(name=config_map_name),
                data={"apps_config.json": apps_config}
            )
            v1.create_namespaced_config_map(namespace="default", body=config_map)
            logging.info(f"Created ConfigMap {config_map_name} with updated apps_config")
        except Exception as e:
            logging.error(f"Error creating ConfigMap for {pod_name}: {e}")
            return jsonify({
                "success": False,
                "error": f"Error creating ConfigMap: {str(e)}"
            }), 500
        
        # Now update the flag secret name in the database
        if flag_secret_name:
            try:
                # Send update to the database API to update the flagSecretName
                database_api_url = os.getenv("DATABASE_API_URL", "http://database-api-service.default.svc.cluster.local")
                update_response = requests.patch(
                    f"{database_api_url}/api/challenge-instances/{pod_name}",
                    json={"flagSecretName": flag_secret_name}
                )
                if not update_response.ok:
                    logging.warning(f"Failed to update flagSecretName in database: {update_response.text}")
            except Exception as e:
                logging.warning(f"Error updating flagSecretName in database: {e}")
        
        return jsonify({
            "success": True,
            "message": f"Updated apps_config for {pod_name}",
            "config_map": config_map_name,
            "flag_secret_name": flag_secret_name
        })
            
    except KeyError as e:
        logging.error(f"Missing key in JSON payload: {e}")
        return jsonify({"error": f"Missing key in JSON payload: {e}"}), 400


@app.route('/api/list-challenge-pods', methods=['GET'])
def list_challenge_pods():
    try:
        v1 = client.CoreV1Api()
        pods = v1.list_pod_for_all_namespaces(watch=False)
        challenge_pods = []

        # Get the domain from the environment variable
        domain = os.getenv("INGRESS_URL")
        if not domain:
            logging.error("INGRESS_URL environment variable is not set. This must be configured by the installer.")
            domain = ""  # Empty string as fallback, but this should be caught by the installer
        logging.info(f"Using domain for challenge URLs: {domain}")

        for pod in pods.items:
            if pod.metadata.name.startswith('ctfchal-'):
                user_id = pod.metadata.labels.get('user', 'unknown')
                challenge_image = 'unknown'
                competition_id = pod.metadata.labels.get('competition_id', 'unknown')
                
                # Derive flag_secret_name using the predictable pattern
                pod_name = pod.metadata.name
                flag_secret_name = f"flag-secret-{pod_name}"
                logging.info(f"Using derived flag_secret_name: {flag_secret_name} for pod {pod_name}")

                for container in pod.spec.containers:
                    if container.name == 'challenge-container':
                        challenge_image = container.image

                challenge_url = f"https://{pod.metadata.name}.{domain}"
                creation_time = pod.metadata.creation_timestamp
                status = get_pod_status_logic(pod)

                challenge_pods.append({
                    "pod_name": pod.metadata.name,
                    "user_id": user_id,
                    "challenge_image": challenge_image,
                    "challenge_url": challenge_url,
                    "flag_secret_name": flag_secret_name,
                    "creation_time": creation_time,
                    "status": status,
                    "competition_id": competition_id
                })

        return jsonify({"challenge_pods": challenge_pods}), 200
    except Exception as e:
        logging.error(f"Error listing challenge pods: {e}")
        return jsonify({"error": "Error listing challenge pods"}), 500


@app.route('/api/get-secret', methods=['POST'])  # Will add auth later
def get_secret_value(): # Evil ah endpoint
    try:
        # Get the secret_name from request JSON
        data = request.json
        if not data:
            logging.error("No JSON data provided in request")
            return jsonify({"error": "No JSON data provided", "secret_value": "null"}), 400
        
        secret_name = data.get('secret_name')
        namespace = data.get('namespace', 'default')
        
        # Validate secret_name
        if secret_name is None:
            logging.error("Missing 'secret_name' in JSON payload")
            return jsonify({"error": "Missing required parameter 'secret_name'", "secret_value": "null"}), 400
        
        # Check if secret_name is empty or whitespace
        if not secret_name or not secret_name.strip():
            logging.warning(f"Empty or whitespace-only secret_name provided: '{secret_name}'")
            return jsonify({"error": "Invalid secret name (empty or whitespace)", "secret_value": "null"}), 400
        
        # Trim whitespace to prevent API errors
        secret_name = secret_name.strip()
        
        logging.info(f"Getting secret: '{secret_name}' in namespace '{namespace}'")
        
    except Exception as e:
        logging.error(f"Error processing request: {str(e)}")
        return jsonify({"error": f"Error processing request: {str(e)}", "secret_value": "null"}), 400

    # Try to get the secret directly first
    secret = get_secret(secret_name, namespace)
    if secret:
        decoded_data = decode_secret_data(secret)
        secret_value = decoded_data.get('flag', 'Flag not found in secret')
        return jsonify({"secret_value": secret_value})
    else:
        logging.warning(f"Secret {secret_name} not found in namespace {namespace}, trying alternatives")
        
        # Check if this is a flag-secret-* that doesn't exist
        if secret_name.startswith('flag-secret-'):
            # If this is "flag-secret-<pod_name>" but doesn't exist, try to get the FLAG directly from the pod
            pod_name = secret_name[len('flag-secret-'):]
            logging.info(f"Extracting pod name from secret name: {pod_name}")
            
            # Try to get the FLAG from the challenge container in the pod
            try:
                v1 = client.CoreV1Api()
                pod = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
                for container in pod.spec.containers:
                    if container.name == 'challenge-container':
                        for env in container.env:
                            if env.name == 'FLAG':
                                logging.info(f"Found FLAG env var in challenge-container for pod {pod_name}")
                                return jsonify({"secret_value": env.value})
                
                logging.warning(f"FLAG env var not found in challenge-container for pod {pod_name}")
            except Exception as pod_error:
                logging.error(f"Error checking pod {pod_name} for FLAG env var: {pod_error}")
        
        # If the secret_name is not a flag-secret, check if it's a pod name itself
        elif secret_name.startswith('ctfchal-'):
            try:
                # Try the predictable flag secret name pattern
                derived_secret_name = f"flag-secret-{secret_name}"
                logging.info(f"Trying derived secret name: {derived_secret_name}")
                
                derived_secret = get_secret(derived_secret_name, namespace)
                if derived_secret:
                    decoded_data = decode_secret_data(derived_secret)
                    secret_value = decoded_data.get('flag', 'Flag not found in secret')
                    logging.info(f"Found flag in derived secret {derived_secret_name}")
                    return jsonify({"secret_value": secret_value})
                
                # If derived secret doesn't exist, try to get the FLAG from the pod directly
                v1 = client.CoreV1Api()
                pod = v1.read_namespaced_pod(name=secret_name, namespace=namespace)
                for container in pod.spec.containers:
                    if container.name == 'challenge-container':
                        for env in container.env:
                            if env.name == 'FLAG':
                                logging.info(f"Found FLAG env var in challenge-container for pod {secret_name}")
                                return jsonify({"secret_value": env.value})
                
                logging.warning(f"FLAG env var not found in challenge-container for pod {secret_name}")
            except Exception as pod_error:
                logging.error(f"Error checking pod {secret_name} for FLAG or derived secret: {pod_error}")
        
        # Secret not found and fallbacks failed
        logging.warning(f"Secret {secret_name} not found and all fallbacks failed")
        return jsonify({"error": f"Secret {secret_name} not found in namespace {namespace}", "secret_value": "null"}), 404


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


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint that checks the status of the instance manager.
    Also provides information about database and cert-manager if requested.
    """
    try:
        # Get actual uptime information using process start time
        import datetime
        import time
        import os
        from datetime import timezone

        # Get process start time for uptime calculation
        try:
            # Get the process start time
            import psutil
            process = psutil.Process(os.getpid())
            process_start_time = datetime.datetime.fromtimestamp(process.create_time(), tz=timezone.utc)

            # Calculate uptime
            now = datetime.datetime.now(timezone.utc)
            uptime_delta = now - process_start_time

            # Format uptime string
            days = uptime_delta.days
            hours, remainder = divmod(uptime_delta.seconds, 3600)
            minutes, seconds = divmod(remainder, 60)

            if days > 0:
                uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
            elif hours > 0:
                uptime_str = f"{hours} hours, {minutes} minutes"
            else:
                uptime_str = f"{minutes} minutes"

            # Format last restart time
            last_restart = process_start_time.strftime("%Y-%m-%d %H:%M:%S")

            logging.info(f"Calculated uptime: {uptime_str}, last restart: {last_restart}")
        except Exception as e:
            logging.error(f"Error getting uptime: {e}")
            uptime_str = "unknown"
            last_restart = "unknown"

        # Check instance manager health
        instance_manager_status = {
            "status": "ok",
            "uptime": uptime_str,
            "version": "1.0.0",   # In a real implementation, this would be fetched from a version file
            "last_restart": last_restart
        }

        # Check if detailed check is requested
        check_components = request.args.get('check_components', 'false').lower() == 'true'

        if check_components:
            # Check database pod health
            database_status = check_pod_health('postgres')

            # Check database controller health (contains both database-api and database-sync)
            db_controller_status = check_pod_health('database-controller')

            # Check cert-manager health
            cert_manager_status = check_pod_health('cert-manager')

            # Format the database status correctly
            database_info = {
                "status": database_status["status"] if isinstance(database_status, dict) and "status" in database_status else "error",
                "uptime": database_status["uptime"] if isinstance(database_status, dict) and "uptime" in database_status else "unknown",
                "last_restart": database_status["last_restart"] if isinstance(database_status, dict) and "last_restart" in database_status else "unknown",
                "controller": db_controller_status
            }

            # Format the cert-manager status correctly
            cert_manager_info = cert_manager_status if isinstance(cert_manager_status, dict) else {"status": "error", "uptime": "unknown", "last_restart": "unknown"}

            return jsonify({
                "instance_manager": instance_manager_status,
                "database": database_info,
                "cert_manager": cert_manager_info
            }), 200

        return jsonify(instance_manager_status), 200
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500

def check_pod_health(pod_name_prefix):
    """
    Check the health of a pod by its name prefix.
    Returns pod health information including status, uptime, and last restart.
    """
    try:
        v1 = client.CoreV1Api()

        # Use the appropriate namespace based on the pod type
        namespace = 'cert-manager' if pod_name_prefix == 'cert-manager' else 'default'

        pods = v1.list_namespaced_pod(namespace=namespace)

        for pod in pods.items:
            if pod.metadata.name.startswith(pod_name_prefix):
                if pod.status.phase == 'Running':
                    container_statuses = pod.status.container_statuses

                    # Get pod start time for uptime calculation
                    start_time = pod.status.start_time
                    if start_time:
                        import datetime
                        from datetime import timezone

                        # Calculate uptime
                        now = datetime.datetime.now(timezone.utc)
                        uptime_delta = now - start_time

                        # Format uptime string
                        days = uptime_delta.days
                        hours, remainder = divmod(uptime_delta.seconds, 3600)
                        minutes, seconds = divmod(remainder, 60)

                        if days > 0:
                            uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
                        elif hours > 0:
                            uptime_str = f"{hours} hours, {minutes} minutes"
                        else:
                            uptime_str = f"{minutes} minutes"

                        # Format last restart time
                        last_restart = start_time.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        uptime_str = "unknown"
                        last_restart = "unknown"

                    if container_statuses:
                        # For database-controller, check both containers
                        if pod_name_prefix == 'database-controller':
                            # We need to check both database-api and database-sync containers
                            api_container_ready = False
                            sync_container_ready = False

                            for container in container_statuses:
                                if container.name == 'database-api' and container.ready:
                                    api_container_ready = True
                                if container.name == 'database-sync' and container.ready:
                                    sync_container_ready = True

                            # Get database connection count
                            try:
                                # Try to get connection count from postgres pod
                                postgres_pods = v1.list_namespaced_pod(namespace='default', label_selector='app=postgres')
                                connection_count = 0

                                if postgres_pods.items:
                                    logging.info(f"Found {len(postgres_pods.items)} PostgreSQL pods, using: {postgres_pods.items[0].metadata.name}")

                                    # DIAGNOSTIC STEP 1: Log the Postgres pod details and environment variables
                                    try:
                                        logging.info(f"===== DIAGNOSTIC: PostgreSQL Pod Environment Variables =====")
                                        env_command = [
                                            "/bin/sh",
                                            "-c",
                                            "printenv | sort"
                                        ]
                                        env_result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                            command=env_command,
                                            stderr=True, stdin=False, stdout=True, tty=False
                                        )
                                        logging.info(f"PostgreSQL Pod Environment:\n{env_result}")

                                        # Check if PostgreSQL is running and accessible
                                        check_command = [
                                            "/bin/sh",
                                            "-c",
                                            "ps aux | grep postgres"
                                        ]
                                        ps_result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                            command=check_command,
                                            stderr=True, stdin=False, stdout=True, tty=False
                                        )
                                        logging.info(f"PostgreSQL Process Check:\n{ps_result}")

                                        # Check PostgreSQL version
                                        version_command = [
                                            "/bin/sh",
                                            "-c",
                                            "psql --version"
                                        ]
                                        version_result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                            command=version_command,
                                            stderr=True, stdin=False, stdout=True, tty=False
                                        )
                                        logging.info(f"PostgreSQL Version:\n{version_result}")
                                    except Exception as diag_e:
                                        logging.error(f"Error during PostgreSQL diagnostics: {diag_e}")

                                    # DIAGNOSTIC STEP 2: Try to get ALL available credentials
                                    logging.info(f"===== DIAGNOSTIC: Checking All Available Credentials =====")
                                    all_secrets = {}
                                    available_secrets = []

                                    # Try to fetch all secrets in the namespace related to database
                                    try:
                                        secrets_list = v1.list_namespaced_secret('default')
                                        for secret in secrets_list.items:
                                            if 'database' in secret.metadata.name.lower() or 'postgres' in secret.metadata.name.lower() or 'pgbouncer' in secret.metadata.name.lower():
                                                available_secrets.append(secret.metadata.name)
                                                data = decode_secret_data(secret)
                                                # Mask passwords in logs for security
                                                masked_data = {}
                                                for k, v in data.items():
                                                    if 'password' in k.lower():
                                                        masked_data[k] = f"{v[:2]}****{v[-2:]}" if len(v) > 4 else "****"
                                                    else:
                                                        masked_data[k] = v
                                                all_secrets[secret.metadata.name] = masked_data

                                        logging.info(f"Available database-related secrets: {available_secrets}")
                                        logging.info(f"Secret contents (passwords masked): {all_secrets}")
                                    except Exception as secrets_e:
                                        logging.error(f"Error fetching database secrets: {secrets_e}")

                                    # Try to get admin credentials from the secret
                                    try:
                                        # First try pgbouncer-admin-credentials
                                        logging.info("Attempting to use pgbouncer-admin-credentials")
                                        secret = v1.read_namespaced_secret("pgbouncer-admin-credentials", "default")
                                        db_username = decode_secret_data(secret).get('username', 'postgres')
                                        db_password = decode_secret_data(secret).get('password', '')
                                        logging.info(f"Using pgbouncer-admin-credentials: username={db_username}, password_length={len(db_password)}")
                                    except Exception as secret_error:
                                        logging.warning(f"Could not read pgbouncer admin credentials: {secret_error}")
                                        # Fall back to database-secrets
                                        try:
                                            logging.info("Attempting to use database-secrets")
                                            secret = v1.read_namespaced_secret("database-secrets", "default")
                                            all_keys = list(decode_secret_data(secret).keys())
                                            logging.info(f"Available keys in database-secrets: {all_keys}")

                                            db_username = decode_secret_data(secret).get('postgres-user', 'postgres')
                                            db_password = decode_secret_data(secret).get('postgres-password', '')
                                            logging.info(f"Using database-secrets: username={db_username}, password_length={len(db_password)}")
                                        except Exception as db_secret_error:
                                            logging.error(f"Could not read database secrets: {db_secret_error}")
                                            db_username = 'postgres'
                                            db_password = ''
                                            logging.info("Falling back to default postgres:postgres credentials")

                                    # DIAGNOSTIC STEP 3: Try connection using the most basic command first
                                    logging.info(f"===== DIAGNOSTIC: Testing Basic PostgreSQL Connection =====")
                                    auth_command = [
                                        "/bin/sh",
                                        "-c",
                                        f"psql -V && echo 'Testing auth users:' && psql -l"
                                    ]
                                    try:
                                        logging.info(f"Executing basic auth command...")
                                        auth_result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                            command=auth_command,
                                            stderr=True, stdin=False, stdout=True, tty=False
                                        )
                                        logging.info(f"Basic auth test result: {auth_result}")
                                    except Exception as auth_error:
                                        logging.error(f"Basic auth test failed: {auth_error}")

                                    # Execute a command to get connection count - using the explicit credentials
                                    logging.info(f"===== DIAGNOSTIC: Attempting Connection Count Query =====")
                                    logging.info(f"Attempting connection with user '{db_username}'...")
                                    exec_command = [
                                        "/bin/sh",
                                        "-c",
                                        f"PGPASSWORD='{db_password}' psql -U {db_username} -h localhost -d postgres -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                    ]

                                    # Try a sequence of different connection methods
                                    all_methods = [
                                        {
                                            "name": "Method 1: With USER from secrets, explicit host",
                                            "command": f"PGPASSWORD='{db_password}' psql -U {db_username} -h localhost -d postgres -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        },
                                        {
                                            "name": "Method 2: With postgres user and password from secrets, explicit host",
                                            "command": f"PGPASSWORD='{db_password}' psql -U postgres -h localhost -d postgres -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        },
                                        {
                                            "name": "Method 3: With postgres user, explicit host",
                                            "command": f"PGPASSWORD='postgres' psql -U postgres -h localhost -d postgres -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        },
                                        {
                                            "name": "Method 4: With environment variables",
                                            "command": f"PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        },
                                        {
                                            "name": "Method 5: Local socket without explicit auth",
                                            "command": "psql -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                        },
                                        {
                                            "name": "Method 6: Alternative approach - list processes",
                                            "command": "ps aux | grep -v grep | grep 'postgres' | wc -l"
                                        }
                                    ]

                                    # Try all methods and use the first successful one
                                    for method in all_methods:
                                        try:
                                            logging.info(f"Trying {method['name']}")
                                            cmd = [
                                                "/bin/sh",
                                                "-c",
                                                method['command']
                                            ]

                                            test_result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                                command=cmd,
                                                stderr=True, stdin=False, stdout=True, tty=False
                                            )

                                            logging.info(f"Result for {method['name']}: {test_result}")

                                            # Process the output to extract a number
                                            # The output might be in formats like:
                                            # "11\n(1row)" or just "11"
                                            if test_result.strip():
                                                # First, split by lines and take the first line
                                                lines = test_result.strip().split('\n')
                                                first_line = lines[0].strip()

                                                # Try to extract a number from this line
                                                import re
                                                numbers = re.findall(r'\d+', first_line)
                                                if numbers:
                                                    try:
                                                        conn_count = int(numbers[0])
                                                        logging.info(f"SUCCESS! {method['name']} gave us connection count: {conn_count}")
                                                        connection_count = conn_count
                                                        # We found a working method, break the loop
                                                        break
                                                    except ValueError:
                                                        logging.error(f"Could not convert extracted number '{numbers[0]}' to integer")
                                                else:
                                                    logging.warning(f"No numbers found in output: {first_line}")
                                            else:
                                                logging.warning(f"Output is empty or whitespace")
                                        except Exception as method_error:
                                            logging.error(f"Error with {method['name']}: {method_error}")

                                else:
                                    logging.warning("No PostgreSQL pods found with label app=postgres")
                                    connection_count = -1
                            except Exception as e:
                                logging.error(f"Error getting database connection count: {e}")
                                connection_count = -1

                            # Return status for each container separately
                            return {
                                "api": "ok" if api_container_ready else "error",
                                "sync": "ok" if sync_container_ready else "error",
                                "uptime": uptime_str,
                                "last_restart": last_restart,
                                "connections": connection_count if connection_count >= 0 else 0
                            }
                        elif pod_name_prefix == 'cert-manager':
                            # For cert-manager, try to get certificate counts
                            try:
                                # Get certificate counts using the cert-manager API
                                api_instance = client.CustomObjectsApi()

                                # Get all certificates
                                try:
                                    certificates = api_instance.list_cluster_custom_object(
                                        group="cert-manager.io",
                                        version="v1",
                                        plural="certificates"
                                    )

                                    total_certs = len(certificates.get('items', []))
                                    valid_certs = 0
                                    expiring_soon_certs = 0
                                    expired_certs = 0

                                    # Check each certificate's status
                                    for cert in certificates.get('items', []):
                                        status = cert.get('status', {})
                                        conditions = status.get('conditions', [])

                                        # Check if certificate is ready
                                        is_ready = False
                                        for condition in conditions:
                                            if condition.get('type') == 'Ready' and condition.get('status') == 'True':
                                                is_ready = True
                                                break

                                        if is_ready:
                                            # Check expiration
                                            not_after = status.get('notAfter')
                                            if not_after:
                                                try:
                                                    # Parse the expiration date
                                                    from datetime import datetime, timezone, timedelta
                                                    expiry_date = datetime.strptime(not_after, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                                                    now = datetime.now(timezone.utc)

                                                    # Check if expired or expiring soon (within 30 days)
                                                    if expiry_date < now:
                                                        expired_certs += 1
                                                    elif expiry_date < now + timedelta(days=30):
                                                        expiring_soon_certs += 1
                                                    else:
                                                        valid_certs += 1
                                                except Exception as e:
                                                    logging.error(f"Error parsing certificate expiry: {e}")
                                                    valid_certs += 1  # Assume valid if we can't parse the date
                                            else:
                                                valid_certs += 1  # Assume valid if no expiry date
                                        else:
                                            expired_certs += 1  # Not ready certificates are considered expired
                                except client.exceptions.ApiException as e:
                                    # Handle permission error (403 Forbidden)
                                    logging.warning(f"Permission error accessing certificates: {e}. Using default values.")
                                    # Use default values when we don't have permission
                                    valid_certs = 0  # Default to 0 valid certificates
                                    expiring_soon_certs = 0
                                    expired_certs = 0
                                    total_certs = 0

                            except Exception as e:
                                logging.error(f"Error getting certificate counts: {e}")
                                # Default values if we can't get real data
                                valid_certs = 0
                                expiring_soon_certs = 0
                                expired_certs = 0
                                total_certs = 0

                            # For other pods, check if all containers are ready
                            all_ready = all(status.ready for status in container_statuses)
                            if all_ready:
                                return {
                                    "status": "ok",
                                    "uptime": uptime_str,
                                    "last_restart": last_restart,
                                    "certificates": {
                                        "valid": valid_certs,
                                        "expiringSoon": expiring_soon_certs,
                                        "expired": expired_certs,
                                        "total": total_certs
                                    }
                                }
                        else:
                            # For other pods, check if all containers are ready
                            all_ready = all(status.ready for status in container_statuses)
                            if all_ready:
                                return {
                                    "status": "ok",
                                    "uptime": uptime_str,
                                    "last_restart": last_restart
                                }

        # If we get here, no matching running pods were found or containers weren't ready
        if pod_name_prefix == 'database-controller':
            return {
                "api": "error",
                "sync": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "connections": 0
            }
        elif pod_name_prefix == 'cert-manager':
            return {
                "status": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "certificates": {
                    "valid": 0,
                    "expiringSoon": 0,
                    "expired": 0,
                    "total": 0
                }
            }
        return {
            "status": "error",
            "uptime": "unknown",
            "last_restart": "unknown"
        }
    except Exception as e:
        logging.error(f"Error checking pod health for {pod_name_prefix}: {e}")
        if pod_name_prefix == 'database-controller':
            return {
                "api": "error",
                "sync": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "connections": 0
            }
        elif pod_name_prefix == 'cert-manager':
            return {
                "status": "error",
                "uptime": "unknown",
                "last_restart": "unknown",
                "certificates": {
                    "valid": 0,
                    "expiringSoon": 0,
                    "expired": 0,
                    "total": 0
                }
            }
        return {
            "status": "error",
            "uptime": "unknown",
            "last_restart": "unknown"
        }

@app.route('/api/restart', methods=['POST'])
def restart_deployment():
    """
    Restart a Kubernetes deployment.
    Currently only supports restarting the instance-manager deployment.
    """
    try:
        deployment_name = request.json.get('deployment')

        if not deployment_name:
            return jsonify({"error": "deployment name is required"}), 400

        # For security, only allow restarting the instance-manager
        if deployment_name != 'instance-manager':
            return jsonify({"error": "unauthorized deployment restart attempt"}), 403

        # Get the apps API client
        apps_v1 = client.AppsV1Api()

        # Get the current deployment
        deployment = apps_v1.read_namespaced_deployment(
            name=deployment_name,
            namespace='default'
        )

        # Patch the deployment to force a restart
        # This is done by adding a restart annotation with the current timestamp
        if deployment.spec.template.metadata is None:
            deployment.spec.template.metadata = client.V1ObjectMeta()

        if deployment.spec.template.metadata.annotations is None:
            deployment.spec.template.metadata.annotations = {}

        # Add or update the restart annotation with the current timestamp
        import datetime
        restart_time = datetime.datetime.now().isoformat()
        deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = restart_time

        # Apply the update
        apps_v1.patch_namespaced_deployment(
            name=deployment_name,
            namespace='default',
            body=deployment
        )

        return jsonify({
            "success": True,
            "message": f"Deployment {deployment_name} restart initiated at {restart_time}",
            "deployment": deployment_name
        })

    except client.exceptions.ApiException as e:
        logging.error(f"Kubernetes API error: {e}")
        return jsonify({"error": f"Kubernetes API error: {e}"}), 500
    except Exception as e:
        logging.error(f"Error restarting deployment: {e}")
        return jsonify({"error": f"Error restarting deployment: {e}"}), 500


@app.route('/api/pgbouncer/stats', methods=['GET'])
def pgbouncer_stats():
    """
    Get PgBouncer connection pool statistics.
    Returns information about the PgBouncer service and its current connection pools.
    """
    try:
        # Get the PgBouncer pods
        v1 = client.CoreV1Api()
        pods = v1.list_namespaced_pod(namespace='default', label_selector='app=pgbouncer')

        if not pods.items:
            logging.warning("No PgBouncer pods found")
            return jsonify({
                "status": "error",
                "message": "No PgBouncer pods found"
            }), 404

        # Get the first pod (there should be only one PgBouncer pod)
        pod = pods.items[0]
        pod_status = pod.status.phase

        # Get pod uptime
        creation_time = pod.metadata.creation_timestamp
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        uptime_delta = now - creation_time

        # Format uptime string
        days = uptime_delta.days
        hours, remainder = divmod(uptime_delta.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if days > 0:
            uptime_str = f"{days} days, {hours} hours, {minutes} minutes"
        elif hours > 0:
            uptime_str = f"{hours} hours, {minutes} minutes"
        else:
            uptime_str = f"{minutes} minutes"

        # Get PgBouncer version
        try:
            exec_command = ["/bin/sh", "-c", "pgbouncer --version"]
            version_resp = stream(
                v1.connect_get_namespaced_pod_exec,
                pod.metadata.name,
                'default',
                command=exec_command,
                stderr=True, stdin=False, stdout=True, tty=False
            )
            version = version_resp.strip()
        except Exception as e:
            logging.error(f"Error getting PgBouncer version: {e}")
            version = "PgBouncer"

        # Try to get PgBouncer admin credentials from secret
        try:
            # First try to get credentials from secret
            try:
                secret = v1.read_namespaced_secret("pgbouncer-admin-credentials", "default")
                pgbouncer_username = "postgres"  # Always use postgres user for PgBouncer admin console
                pgbouncer_password = decode_secret_data(secret).get('password', '')
                logging.info(f"Found PgBouncer admin credentials in secret")
            except Exception as e:
                logging.warning(f"Could not read PgBouncer admin credentials from secret: {e}")
                # Fall back to default credentials or environment variable lookups
                pgbouncer_username = "postgres"
                pgbouncer_password = ""

                # Try to get credentials from PgBouncer pod environment
                try:
                    exec_command = [
                        "/bin/sh",
                        "-c",
                        "printenv | grep POSTGRESQL_"
                    ]
                    env_vars = stream(
                        v1.connect_get_namespaced_pod_exec,
                        pod.metadata.name,
                        'default',
                        command=exec_command,
                        stderr=True, stdin=False, stdout=True, tty=False
                    )

                    # Parse environment variables for password only
                    for line in env_vars.strip().split('\n'):
                        if "POSTGRESQL_PASSWORD=" in line:
                            pgbouncer_password = line.split('=')[1].strip()

                    logging.info(f"Using PgBouncer credentials from environment")
                except Exception as env_error:
                    logging.warning(f"Could not read PgBouncer environment variables: {env_error}")

            # Try to connect to PgBouncer admin console using psql
            # Create a temporary script that handles authentication
            script_content = f"""#!/bin/bash
# Create a temporary password file for psql
echo "localhost:6432:pgbouncer:{pgbouncer_username}:{pgbouncer_password}" > ~/.pgpass
chmod 600 ~/.pgpass

# Query PgBouncer stats
echo "\\\\x off" > /tmp/pgb_queries.sql
echo "SHOW POOLS;" >> /tmp/pgb_queries.sql
echo "SHOW STATS;" >> /tmp/pgb_queries.sql
echo "SHOW CONFIG;" >> /tmp/pgb_queries.sql

# Run the queries
PGPASSFILE=~/.pgpass psql -h localhost -p 6432 -U {pgbouncer_username} -d pgbouncer -f /tmp/pgb_queries.sql

# Clean up temp files 
rm -f ~/.pgpass /tmp/pgb_queries.sql
"""

            # Write and execute the script
            exec_command = [
                "/bin/sh",
                "-c",
                f"cat << 'EOF' > /tmp/get_pgbouncer_stats.sh\n{script_content}\nEOF\nchmod +x /tmp/get_pgbouncer_stats.sh\n/tmp/get_pgbouncer_stats.sh"
            ]

            try:
                stats_resp = stream(
                    v1.connect_get_namespaced_pod_exec,
                    pod.metadata.name,
                    'default',
                    command=exec_command,
                    stderr=True, stdin=False, stdout=True, tty=False
                )

                logging.info(f"PgBouncer stats response length: {len(stats_resp)}")

                # Parse the response
                pools = []
                active_connections = 0
                waiting_connections = 0
                idle_connections = 0
                max_clients = 1000  # Default value

                # Simple parsing of the stats response
                if "database" in stats_resp and "cl_active" in stats_resp:
                    current_section = None
                    lines = stats_resp.strip().split('\n')

                    for line in lines:
                        # Detect section headers
                        if line.startswith("SHOW POOLS"):
                            current_section = "pools"
                            continue
                        elif line.startswith("SHOW STATS"):
                            current_section = "stats"
                            continue
                        elif line.startswith("SHOW CONFIG"):
                            current_section = "config"
                            continue

                        # Process based on current section
                        if current_section == "pools" and "|" in line:
                            parts = line.strip().split('|')
                            if len(parts) >= 5 and not parts[0].strip() == "database":  # Skip header
                                try:
                                    pool_name = parts[0].strip()
                                    cl_active = int(parts[1].strip() or 0)
                                    cl_waiting = int(parts[2].strip() or 0)
                                    sv_active = int(parts[3].strip() or 0)
                                    sv_idle = int(parts[4].strip() or 0)

                                    pools.append({
                                        "name": pool_name,
                                        "active": cl_active,
                                        "waiting": cl_waiting,
                                        "server_active": sv_active,
                                        "server_idle": sv_idle
                                    })

                                    active_connections += cl_active
                                    waiting_connections += cl_waiting
                                    idle_connections += sv_idle
                                except Exception as parse_error:
                                    logging.error(f"Error parsing pool line: {line}, error: {parse_error}")

                        elif current_section == "config" and "max_client_conn" in line and "=" in line:
                            try:
                                value_part = line.split('=')[1].strip()
                                max_clients = int(value_part.split()[0])  # Get first number after equals
                            except Exception as config_error:
                                logging.error(f"Error parsing config line: {line}, error: {config_error}")

                # Return the parsed stats
                return jsonify({
                    "status": "ok",
                    "version": version,
                    "uptime": uptime_str,
                    "connections": {
                        "active": active_connections,
                        "waiting": waiting_connections,
                        "idle": idle_connections,
                        "max_clients": max_clients
                    },
                    "pools": pools
                }), 200

            except Exception as psql_error:
                logging.error(f"Error executing psql for PgBouncer stats: {psql_error}")
                # Try alternative approach with socat
                try:
                    exec_command = [
                        "/bin/sh",
                        "-c",
                        """
                        # Try to use socat to communicate with the admin console using Unix socket
                        echo "SHOW POOLS;" | socat - UNIX-CONNECT:/tmp/.s.PGSQL.6432 || echo "Socket connection failed"
                        """
                    ]

                    socket_test = stream(
                        v1.connect_get_namespaced_pod_exec,
                        pod.metadata.name,
                        'default',
                        command=exec_command,
                        stderr=True, stdin=False, stdout=True, tty=False
                    )

                    logging.info(f"Socket test result: {socket_test}")

                    # Check if PgBouncer is responding via TCP
                    exec_command = [
                        "/bin/sh",
                        "-c",
                        "nc -z localhost 6432 && echo 'PgBouncer is responding on TCP port 6432' || echo 'PgBouncer is not responding on TCP'"
                    ]

                    tcp_test = stream(
                        v1.connect_get_namespaced_pod_exec,
                        pod.metadata.name,
                        'default',
                        command=exec_command,
                        stderr=True, stdin=False, stdout=True, tty=False
                    )

                    logging.info(f"TCP test result: {tcp_test}")
                except Exception as socket_error:
                    logging.error(f"Error testing socket connection: {socket_error}")

                # Return basic info with connection test results
                return jsonify({
                    "status": "ok" if pod_status == "Running" else "error",
                    "version": version,
                    "uptime": uptime_str,
                    "pod_status": pod_status,
                    "message": "Unable to retrieve detailed PgBouncer stats. Authentication failed. Make sure the pgbouncer-admin-credentials secret exists and contains valid credentials. If missing, reinstall PgBouncer using the edurange-installer.",
                    "connections": {
                        "active": 0,
                        "waiting": 0,
                        "idle": 0,
                        "max_clients": 1000
                    },
                    "pools": []
                }), 200

        except Exception as e:
            logging.error(f"Error in main PgBouncer stats logic: {e}")
            # Return basic pod info as fallback
            return jsonify({
                "status": "ok" if pod_status == "Running" else "error",
                "version": version,
                "uptime": uptime_str,
                "pod_status": pod_status,
                "connections": {
                    "active": 0,
                    "waiting": 0,
                    "idle": 0,
                    "max_clients": 1000
                },
                "message": f"Basic PgBouncer information available. Pod is {pod_status}.",
                "pools": []
            }), 200

    except Exception as e:
        logging.error(f"Error fetching PgBouncer stats: {e}")
        return jsonify({
            "status": "error",
            "message": f"Error fetching PgBouncer stats: {str(e)}"
        }), 500
