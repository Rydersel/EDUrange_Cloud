import logging
import os

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
    else:
        # Handle the case when secret is None
        secret_value = "Secret not found"
        logging.warning(f"Secret {secret_name} not found in namespace {namespace}")
        return jsonify({"error": f"Secret {secret_name} not found in namespace {namespace}"}), 404

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
                                    # Execute a command to get connection count
                                    exec_command = [
                                        "/bin/sh", 
                                        "-c", 
                                        "PGPASSWORD=$POSTGRES_PASSWORD psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT count(*) FROM pg_stat_activity;' | grep -v count | grep -v -- -- | tr -d ' '"
                                    ]
                                    
                                    try:
                                        result = stream(
                                            v1.connect_get_namespaced_pod_exec,
                                            postgres_pods.items[0].metadata.name,
                                            'default',
                                            command=exec_command,
                                            stderr=True, stdin=False,
                                            stdout=True, tty=False,
                                            _preload_content=False
                                        )
                                        
                                        # Read the output
                                        while result.is_open():
                                            result.update(timeout=1)
                                            if result.peek_stdout():
                                                output = result.read_stdout().strip()
                                                # Clean the output to handle format like "34\n(1row)"
                                                connection_count_str = output.split('\n')[0].strip()
                                                try:
                                                    connection_count = int(connection_count_str)
                                                except ValueError:
                                                    logging.error(f"Error parsing connection count from: {output}")
                                                    connection_count = -1
                                            if result.peek_stderr():
                                                logging.error(f"Error getting connection count: {result.read_stderr()}")
                                        
                                        result.close()
                                    except Exception as e:
                                        logging.error(f"Error executing command in postgres pod: {e}")
                                        connection_count = -1
                                else:
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
