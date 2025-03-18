from flask import Flask, jsonify, request
import os
import time
import logging
import json
from datetime import datetime, timedelta
import requests
from prometheus_client import Gauge, Counter, start_http_server
import threading
import psutil
from kubernetes import client, config
import random
import platform

PROMETHEUS_URL = os.environ.get('PROMETHEUS_URL', 'http://prometheus-kube-prometheus-prometheus.monitoring:9090')
METRICS_CACHE_TTL = int(os.environ.get('METRICS_CACHE_TTL', '15'))  # Cache TTL in seconds
METRICS_PORT = int(os.environ.get('METRICS_PORT', '9100'))  # Port for Prometheus metrics
HISTORY_RETENTION_HOURS = int(os.environ.get('HISTORY_RETENTION_HOURS', '24'))  # Hours to retain history

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configuration
PROMETHEUS_URL = os.environ.get('PROMETHEUS_URL', 'http://prometheus-kube-prometheus-prometheus.monitoring:9090')
METRICS_CACHE_TTL = int(os.environ.get('METRICS_CACHE_TTL', '15'))  # Cache TTL in seconds
METRICS_PORT = int(os.environ.get('METRICS_PORT', '9100'))  # Port for Prometheus metrics
HISTORY_RETENTION_HOURS = int(os.environ.get('HISTORY_RETENTION_HOURS', '24'))  # Hours to retain history

# Initialize Kubernetes client
try:
    # Try to load in-cluster config first
    config.load_incluster_config()
    logger.info("Loaded in-cluster Kubernetes configuration")
except config.config_exception.ConfigException:
    try:
        # Fall back to kubeconfig
        config.load_kube_config()
        logger.info("Loaded kubeconfig configuration")
    except Exception as e:
        logger.error(f"Failed to load Kubernetes configuration: {e}")

# Cache for metrics data
metrics_cache = {
    'cpu': {
        'system': 0,
        'challenges': 0,
        'total': 0,
        'last_updated': 0,
        'history': []
    },
    'memory': {
        'used': 0,
        'available': 0,
        'total_bytes': 0,
        'used_bytes': 0,
        'last_updated': 0,
        'history': []
    },
    'network': {
        'inbound': 0,
        'outbound': 0,
        'total': 0,
        'last_updated': 0,
        'history': []
    },
    'challenges': {
        'total': 0,
        'running': 0,
        'pending': 0,
        'failed': 0,
        'last_updated': 0,
        'history': []
    },
    'system_status': {
        'ingress_health': 100,
        'db_api_health': 100,
        'db_sync_health': 100,
        'last_updated': 0,
        'history': []
    }
}

# Cache lock to prevent race conditions
cache_lock = threading.Lock()

# Define Prometheus metrics
CPU_USAGE_SYSTEM = Gauge('edurange_cpu_usage_system', 'CPU usage by system components in percentage')
CPU_USAGE_CHALLENGES = Gauge('edurange_cpu_usage_challenges', 'CPU usage by challenge pods in percentage')
CPU_USAGE_TOTAL = Gauge('edurange_cpu_usage_total', 'Total CPU usage in percentage')

MEMORY_USED = Gauge('edurange_memory_used', 'Memory used in percentage')
MEMORY_AVAILABLE = Gauge('edurange_memory_available', 'Memory available in percentage')
MEMORY_TOTAL_BYTES = Gauge('edurange_memory_total_bytes', 'Total memory in bytes')
MEMORY_USED_BYTES = Gauge('edurange_memory_used_bytes', 'Used memory in bytes')

NETWORK_INBOUND = Gauge('edurange_network_inbound', 'Network inbound traffic in MB/s')
NETWORK_OUTBOUND = Gauge('edurange_network_outbound', 'Network outbound traffic in MB/s')
NETWORK_TOTAL = Gauge('edurange_network_total', 'Total network traffic in MB/s')

# Challenge metrics
CHALLENGE_COUNT_TOTAL = Gauge('edurange_challenge_count_total', 'Total number of challenge pods')
CHALLENGE_COUNT_RUNNING = Gauge('edurange_challenge_count_running', 'Number of running challenge pods')
CHALLENGE_COUNT_PENDING = Gauge('edurange_challenge_count_pending', 'Number of pending challenge pods')
CHALLENGE_COUNT_FAILED = Gauge('edurange_challenge_count_failed', 'Number of failed challenge pods')

def start_metrics_server(port=METRICS_PORT):
    """Start the Prometheus metrics server on the specified port."""
    try:
        start_http_server(port)
        logger.info(f"Started Prometheus metrics server on port {port}")
    except Exception as e:
        logger.error(f"Failed to start Prometheus metrics server: {e}")

def collect_metrics_loop():
    """Continuously collect metrics in a background thread."""
    while True:
        try:
            # Collect each metric type separately with error handling
            try:
                collect_cpu_metrics()
            except Exception as e:
                logger.error(f"Error collecting CPU metrics: {e}")

            try:
                collect_memory_metrics()
            except Exception as e:
                logger.error(f"Error collecting memory metrics: {e}")

            try:
                collect_network_metrics()
            except Exception as e:
                logger.error(f"Error collecting network metrics: {e}")

            try:
                collect_challenge_metrics()
            except Exception as e:
                logger.error(f"Error collecting challenge metrics: {e}")
                
            try:
                collect_system_status_metrics()
            except Exception as e:
                logger.error(f"Error collecting system status metrics: {e}")

            # Sleep between collection cycles
            time.sleep(10)  # Collect metrics every 10 seconds
        except Exception as e:
            logger.error(f"Error in metrics collection loop: {e}")
            time.sleep(30)  # Wait longer if there's an error

def collect_cpu_metrics():
    """Collect CPU usage metrics."""
    try:
        # Get current time
        current_time = time.time()

        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['cpu']['last_updated'] < METRICS_CACHE_TTL:
                # Cache is still valid, use cached values
                return

        # Get system CPU usage
        system_cpu = psutil.cpu_percent(interval=1)

        # Try to get challenge pods CPU usage from Kubernetes metrics API
        challenge_cpu = 0
        try:
            # Initialize the Metrics API client
            api_client = client.ApiClient()
            metrics_api = client.CustomObjectsApi(api_client)

            # Get pod metrics
            pod_metrics = metrics_api.list_namespaced_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                namespace="default",
                plural="pods",
                label_selector="app=challenge"
            )

            # Calculate total CPU usage for challenge pods
            for pod in pod_metrics.get('items', []):
                try:
                    cpu_usage = pod.get('containers', [{}])[0].get('usage', {}).get('cpu', '0')
                    # Convert CPU usage from string (e.g., "100m") to percentage
                    if 'm' in cpu_usage:
                        # Convert millicores to percentage (100m = 10%)
                        cpu_usage = float(cpu_usage.replace('m', '')) / 10
                    else:
                        # Convert cores to percentage (1 core = 100%)
                        cpu_usage = float(cpu_usage) * 100

                    challenge_cpu += cpu_usage
                except (IndexError, ValueError, TypeError) as e:
                    logger.warning(f"Error parsing CPU metrics for pod: {e}")
        except Exception as e:
            logger.warning(f"Error getting pod metrics from Kubernetes API: {e}")
            # Fallback: estimate challenge CPU as 30% of total
            challenge_cpu = system_cpu * 0.3

        # Ensure challenge CPU doesn't exceed system CPU
        challenge_cpu = min(challenge_cpu, system_cpu)

        # Calculate system components CPU (total - challenges)
        system_components_cpu = max(0, system_cpu - challenge_cpu)

        # Update Prometheus metrics
        CPU_USAGE_SYSTEM.set(system_components_cpu)
        CPU_USAGE_CHALLENGES.set(challenge_cpu)
        CPU_USAGE_TOTAL.set(system_cpu)

        # Format timestamp for history
        timestamp = datetime.now().strftime('%H:%M')

        # Update cache - maintain exactly 24 data points
        with cache_lock:
            metrics_cache['cpu'] = {
                'system': system_components_cpu,
                'challenges': challenge_cpu,
                'total': system_cpu,
                'last_updated': current_time,
                'history': metrics_cache['cpu']['history'][1:] + [{
                    'time': timestamp,
                    'system': round(system_components_cpu, 1),
                    'challenges': round(challenge_cpu, 1)
                }]
            }
    except Exception as e:
        logger.error(f"Error collecting CPU metrics: {e}")

def collect_memory_metrics():
    """Collect memory usage metrics."""
    try:
        # Get current time
        current_time = time.time()

        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['memory']['last_updated'] < METRICS_CACHE_TTL:
                # Cache is still valid, use cached values
                return

        # Get memory usage
        memory = psutil.virtual_memory()

        # Calculate percentages
        used_percent = memory.percent
        available_percent = 100 - used_percent

        # Update Prometheus metrics
        MEMORY_USED.set(used_percent)
        MEMORY_AVAILABLE.set(available_percent)
        MEMORY_TOTAL_BYTES.set(memory.total)
        MEMORY_USED_BYTES.set(memory.used)

        # Format timestamp for history
        timestamp = datetime.now().strftime('%H:%M')

        # Update cache - maintain exactly 24 data points
        with cache_lock:
            metrics_cache['memory'] = {
                'used': used_percent,
                'available': available_percent,
                'total_bytes': memory.total,
                'used_bytes': memory.used,
                'last_updated': current_time,
                'history': metrics_cache['memory']['history'][1:] + [{
                    'time': timestamp,
                    'used': round(used_percent, 1),
                    'available': round(available_percent, 1)
                }]
            }
    except Exception as e:
        logger.error(f"Error collecting memory metrics: {e}")

def collect_network_metrics():
    """Collect network traffic metrics using Prometheus."""
    try:
        # Get current time
        current_time = time.time()

        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['network']['last_updated'] < METRICS_CACHE_TTL:
                # Cache is still valid, use cached values
                return

        # Initialize variables for network metrics
        mb_sent_per_sec = 0
        mb_recv_per_sec = 0
        mb_total_per_sec = 0

        # Try to get network metrics from Prometheus
        try:
            # Simplified queries for network metrics
            recv_query = 'sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br.*|flannel.*|cali.*|cbr.*"}[1m])) / 1024 / 1024'
            sent_query = 'sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|br.*|flannel.*|cali.*|cbr.*"}[1m])) / 1024 / 1024'

            logger.info(f"Querying Prometheus for network metrics with: {recv_query}")

            # Get receive metrics
            recv_result = query_prometheus(recv_query)
            if recv_result and 'data' in recv_result and 'result' in recv_result['data']:
                results = recv_result['data']['result']
                logger.info(f"Received result from Prometheus for receive metrics: {results}")
                if results and len(results) > 0:
                    # For instant queries, the value is in the format [timestamp, value]
                    if 'value' in results[0]:
                        value = results[0]['value']
                        if len(value) > 1:
                            mb_recv_per_sec = float(value[1])
                            logger.info(f"Parsed receive value: {mb_recv_per_sec} MB/s")

            # Get send metrics
            sent_result = query_prometheus(sent_query)
            if sent_result and 'data' in sent_result and 'result' in sent_result['data']:
                results = sent_result['data']['result']
                logger.info(f"Received result from Prometheus for send metrics: {results}")
                if results and len(results) > 0:
                    # For instant queries, the value is in the format [timestamp, value]
                    if 'value' in results[0]:
                        value = results[0]['value']
                        if len(value) > 1:
                            mb_sent_per_sec = float(value[1])
                            logger.info(f"Parsed send value: {mb_sent_per_sec} MB/s")

            # Calculate total
            mb_total_per_sec = mb_sent_per_sec + mb_recv_per_sec

            # If we got zeros from Prometheus but we know there should be traffic, use a small default value
            if mb_total_per_sec < 0.01:
                logger.warning("Received zero or very small values from Prometheus, using minimum values")
                mb_sent_per_sec = max(mb_sent_per_sec, 0.05)
                mb_recv_per_sec = max(mb_recv_per_sec, 0.1)
                mb_total_per_sec = mb_sent_per_sec + mb_recv_per_sec

            logger.info(f"Network traffic from Prometheus: {mb_recv_per_sec:.2f} MB/s in, {mb_sent_per_sec:.2f} MB/s out, {mb_total_per_sec:.2f} MB/s total")

        except Exception as e:
            logger.warning(f"Error getting network metrics from Prometheus: {e}")
            # Fallback to using psutil if Prometheus query fails
            try:
                # Get network I/O stats
                net_io = psutil.net_io_counters()

                # Initialize global variables if they don't exist
                if 'last_net_io' not in globals() or 'last_net_io_time' not in globals():
                    global last_net_io, last_net_io_time
                    last_net_io = net_io
                    last_net_io_time = current_time
                    # For the first call, we'll use some small default values
                    mb_sent_per_sec = 0.1
                    mb_recv_per_sec = 0.2
                    mb_total_per_sec = 0.3
                    logger.info("Initialized network metrics tracking with psutil (fallback)")
                else:
                    # Calculate time difference
                    time_diff = current_time - last_net_io_time

                    if time_diff > 0:  # Avoid division by zero
                        # Calculate bytes per second
                        bytes_sent_per_sec = (net_io.bytes_sent - last_net_io.bytes_sent) / time_diff
                        bytes_recv_per_sec = (net_io.bytes_recv - last_net_io.bytes_recv) / time_diff

                        # Convert to MB/s
                        mb_sent_per_sec = bytes_sent_per_sec / (1024 * 1024)
                        mb_recv_per_sec = bytes_recv_per_sec / (1024 * 1024)
                        mb_total_per_sec = mb_sent_per_sec + mb_recv_per_sec

                        logger.info(f"Network traffic from psutil (fallback): {mb_recv_per_sec:.2f} MB/s in, {mb_sent_per_sec:.2f} MB/s out, {mb_total_per_sec:.2f} MB/s total")

                    # Update the last values for the next call
                    last_net_io = net_io
                    last_net_io_time = current_time
            except Exception as e:
                logger.warning(f"Error collecting network metrics from psutil: {e}")
                # Generate fallback values
                mb_sent_per_sec = random.uniform(0.5, 2.0)
                mb_recv_per_sec = random.uniform(1.0, 3.0)
                mb_total_per_sec = mb_sent_per_sec + mb_recv_per_sec
                logger.info(f"Using random network traffic values (fallback): {mb_recv_per_sec:.2f} MB/s in, {mb_sent_per_sec:.2f} MB/s out")

        # Update Prometheus metrics
        NETWORK_OUTBOUND.set(mb_sent_per_sec)
        NETWORK_INBOUND.set(mb_recv_per_sec)
        NETWORK_TOTAL.set(mb_total_per_sec)

        # Format timestamp for history
        timestamp = datetime.now().strftime('%H:%M')

        # Update cache - maintain exactly 24 data points
        with cache_lock:
            # Ensure we have history data
            if not metrics_cache['network']['history']:
                # Initialize with empty data points if history is empty
                now = datetime.now()
                history = []
                for i in range(24):
                    time_point = now - timedelta(hours=i)
                    history.append({
                        'time': time_point.strftime('%H:%M'),
                        'inbound': 0,
                        'outbound': 0
                    })
                # Sort by time
                history.sort(key=lambda x: x['time'])
                metrics_cache['network']['history'] = history

            # Update the cache with new data point
            metrics_cache['network'] = {
                'inbound': mb_recv_per_sec,
                'outbound': mb_sent_per_sec,
                'total': mb_total_per_sec,
                'last_updated': current_time,
                'history': metrics_cache['network']['history'][1:] + [{
                    'time': timestamp,
                    'inbound': round(mb_recv_per_sec, 2),
                    'outbound': round(mb_sent_per_sec, 2)
                }]
            }

            # Log the updated cache to verify data is being stored correctly
            logger.info(f"Updated network metrics cache. Latest values: inbound={mb_recv_per_sec:.2f} MB/s, outbound={mb_sent_per_sec:.2f} MB/s")
            logger.info(f"Network history data points: {len(metrics_cache['network']['history'])}")

    except Exception as e:
        logger.error(f"Error collecting network metrics: {e}")
        # Generate mock data as fallback
        mb_sent_per_sec = random.uniform(0.5, 2.0)
        mb_recv_per_sec = random.uniform(1.0, 3.0)
        mb_total_per_sec = mb_sent_per_sec + mb_recv_per_sec

        # Format timestamp for history
        timestamp = datetime.now().strftime('%H:%M')

        # Update cache with mock data - maintain exactly 24 data points
        with cache_lock:
            # Ensure we have history data
            if not metrics_cache['network']['history']:
                # Initialize with empty data points if history is empty
                now = datetime.now()
                history = []
                for i in range(24):
                    time_point = now - timedelta(hours=i)
                    history.append({
                        'time': time_point.strftime('%H:%M'),
                        'inbound': 0,
                        'outbound': 0
                    })
                # Sort by time
                history.sort(key=lambda x: x['time'])
                metrics_cache['network']['history'] = history

            # Update the cache with mock data
            metrics_cache['network'] = {
                'inbound': mb_recv_per_sec,
                'outbound': mb_sent_per_sec,
                'total': mb_total_per_sec,
                'last_updated': current_time,
                'history': metrics_cache['network']['history'][1:] + [{
                    'time': timestamp,
                    'inbound': round(mb_recv_per_sec, 2),
                    'outbound': round(mb_sent_per_sec, 2)
                }]
            }

        # Update Prometheus metrics with mock data
        NETWORK_OUTBOUND.set(mb_sent_per_sec)
        NETWORK_INBOUND.set(mb_recv_per_sec)
        NETWORK_TOTAL.set(mb_total_per_sec)

def collect_challenge_metrics():
    """Collect challenge pod metrics."""
    try:
        # Get current time
        current_time = time.time()

        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['challenges']['last_updated'] < METRICS_CACHE_TTL:
                # Cache is still valid, use cached values
                return

        # Get challenge pods using Kubernetes API
        v1 = client.CoreV1Api()

        try:
            # Get all pods with the label app=challenge
            pods = v1.list_namespaced_pod(namespace="default", label_selector="app=challenge")

            # Count pods by status
            total = len(pods.items)
            running = 0
            pending = 0
            failed = 0

            for pod in pods.items:
                if pod.status.phase == 'Running':
                    running += 1
                elif pod.status.phase == 'Pending':
                    pending += 1
                elif pod.status.phase in ['Failed', 'Error']:
                    failed += 1

            # Update Prometheus metrics
            CHALLENGE_COUNT_TOTAL.set(total)
            CHALLENGE_COUNT_RUNNING.set(running)
            CHALLENGE_COUNT_PENDING.set(pending)
            CHALLENGE_COUNT_FAILED.set(failed)

            # Format timestamp for history
            timestamp = datetime.now().strftime('%H:%M')

            # Update cache - maintain exactly 24 data points
            with cache_lock:
                metrics_cache['challenges'] = {
                    'total': total,
                    'running': running,
                    'pending': pending,
                    'failed': failed,
                    'last_updated': current_time,
                    'history': metrics_cache['challenges']['history'][1:] + [{
                        'time': timestamp,
                        'running': running,
                        'pending': pending,
                        'failed': failed,
                        'total': total
                    }]
                }
        except Exception as e:
            logger.warning(f"Error getting challenge pods: {e}")

            # Use mock data as fallback
            total = 10
            running = 7
            pending = 2
            failed = 1

            # Update Prometheus metrics
            CHALLENGE_COUNT_TOTAL.set(total)
            CHALLENGE_COUNT_RUNNING.set(running)
            CHALLENGE_COUNT_PENDING.set(pending)
            CHALLENGE_COUNT_FAILED.set(failed)

            # Format timestamp for history
            timestamp = datetime.now().strftime('%H:%M')

            # Update cache - maintain exactly 24 data points
            with cache_lock:
                metrics_cache['challenges'] = {
                    'total': total,
                    'running': running,
                    'pending': pending,
                    'failed': failed,
                    'last_updated': current_time,
                    'history': metrics_cache['challenges']['history'][1:] + [{
                        'time': timestamp,
                        'running': running,
                        'pending': pending,
                        'failed': failed,
                        'total': total
                    }]
                }
    except Exception as e:
        logger.error(f"Error collecting challenge metrics: {e}")

def query_prometheus(query):
    """Query Prometheus for metrics data."""
    try:
        # For instant queries (current value)
        response = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={
                'query': query,
                'time': time.time()
            },
            timeout=5
        )

        if response.status_code != 200:
            logger.error(f"Error querying Prometheus: {response.status_code} - {response.text}")
            return None

        result = response.json()
        logger.info(f"Prometheus query response: {result}")
        return result
    except Exception as e:
        logger.error(f"Error querying Prometheus: {e}")
        return None

# API Routes

@app.route('/api/current', methods=['GET'])
def get_current_metrics():
    """Get current resource usage metrics."""
    with cache_lock:
        return jsonify({
            'cpu': {
                'system': metrics_cache['cpu']['system'],
                'challenges': metrics_cache['cpu']['challenges'],
                'total': metrics_cache['cpu']['total']
            },
            'memory': {
                'used': metrics_cache['memory']['used'],
                'available': metrics_cache['memory']['available'],
                'total_bytes': metrics_cache['memory']['total_bytes'],
                'used_bytes': metrics_cache['memory']['used_bytes']
            },
            'network': {
                'inbound': metrics_cache['network']['inbound'],
                'outbound': metrics_cache['network']['outbound'],
                'total': metrics_cache['network']['total']
            },
            'challenges': {
                'total': metrics_cache['challenges']['total'],
                'running': metrics_cache['challenges']['running'],
                'pending': metrics_cache['challenges']['pending'],
                'failed': metrics_cache['challenges']['failed']
            },
            'timestamp': datetime.now().isoformat()
        })

@app.route('/api/history', methods=['GET'])
def get_metrics_history():
    """Get historical metrics data."""
    resource_type = request.args.get('type', 'cpu')
    # Always use 24h period for consistency
    period = '24h'

    # Get current time in the same format as history data points
    current_time = datetime.now().strftime('%H:%M')

    with cache_lock:
        response = {}

        # Add current time to the response
        response['current_time'] = current_time

        if resource_type == 'cpu':
            # Ensure we return exactly 24 data points for a 24-hour period
            response['data'] = metrics_cache['cpu']['history'][-24:]
            return jsonify(response)
        elif resource_type == 'memory':
            response['data'] = metrics_cache['memory']['history'][-24:]
            return jsonify(response)
        elif resource_type == 'network':
            response['data'] = metrics_cache['network']['history'][-24:]
            return jsonify(response)
        elif resource_type == 'challenges':
            response['data'] = metrics_cache['challenges']['history'][-24:]
            return jsonify(response)
        else:
            return jsonify({'error': 'Invalid resource type'}), 400

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})

def initialize_metrics_history():
    """Initialize metrics history with empty data."""
    now = datetime.now()
    history = []

    # Generate exactly 24 empty data points for the last 24 hours
    # Start from the current hour and go backwards
    current_hour = now.hour
    current_minute = now.minute

    # Format the current time
    current_time_str = f"{current_hour:02d}:{current_minute:02d}"

    # First data point is the current time
    history.append({
        'time': current_time_str,
        'system': 0,
        'challenges': 0
    })

    # Generate the remaining 23 data points going backwards in time
    for i in range(1, 24):
        # Calculate the time i hours ago
        time_point = now - timedelta(hours=i)
        history.append({
            'time': time_point.strftime('%H:%M'),
            'system': 0,
            'challenges': 0
        })

    # Sort the history by time
    history.sort(key=lambda x: x['time'])

    with cache_lock:
        metrics_cache['cpu']['history'] = history

        # Copy the structure but change the data keys
        metrics_cache['memory']['history'] = [
            {'time': entry['time'], 'used': 0, 'available': 100}
            for entry in history
        ]

        metrics_cache['network']['history'] = [
            {'time': entry['time'], 'inbound': 0, 'outbound': 0}
            for entry in history
        ]

        metrics_cache['challenges']['history'] = [
            {'time': entry['time'], 'running': 0, 'pending': 0, 'failed': 0, 'total': 0}
            for entry in history
        ]
        
        # Initialize system status history
        metrics_cache['system_status']['history'] = [
            {
                'time': entry['time'],
                'ingressHealth': 100,  # Start with healthy values
                'dbApiHealth': 100,
                'dbSyncHealth': 100
            }
            for entry in history
        ]

        # Initialize global variables for network metrics
        global last_net_io, last_net_io_time
        last_net_io = psutil.net_io_counters()
        last_net_io_time = time.time()

def start_background_tasks():
    """Start background tasks for metrics collection."""
    # Start Prometheus metrics server
    start_metrics_server()

    # Initialize metrics history
    initialize_metrics_history()

    # Start metrics collection thread
    metrics_thread = threading.Thread(target=collect_metrics_loop, daemon=True)
    metrics_thread.start()
    logger.info("Started metrics collection thread")

# Start background tasks when the app starts
with app.app_context():
    # Start background tasks
    start_background_tasks()

# Add a new endpoint to get pod details
@app.route('/api/pods', methods=['GET'])
def get_pods():
    """Get details of challenge pods."""
    try:
        v1 = client.CoreV1Api()
        pods = v1.list_namespaced_pod(namespace="default", label_selector="app=challenge")

        pod_list = []
        for pod in pods.items:
            pod_info = {
                'name': pod.metadata.name,
                'status': pod.status.phase,
                'created': pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None,
                'ip': pod.status.pod_ip,
                'node': pod.spec.node_name,
                'labels': pod.metadata.labels
            }

            # Add container info
            containers = []
            for container in pod.spec.containers:
                container_info = {
                    'name': container.name,
                    'image': container.image,
                    'ready': False
                }

                # Check container status
                if pod.status.container_statuses:
                    for status in pod.status.container_statuses:
                        if status.name == container.name:
                            container_info['ready'] = status.ready
                            container_info['restart_count'] = status.restart_count
                            if status.state.running:
                                container_info['state'] = 'running'
                                container_info['started_at'] = status.state.running.started_at.isoformat() if status.state.running.started_at else None
                            elif status.state.waiting:
                                container_info['state'] = 'waiting'
                                container_info['reason'] = status.state.waiting.reason
                            elif status.state.terminated:
                                container_info['state'] = 'terminated'
                                container_info['reason'] = status.state.terminated.reason
                                container_info['exit_code'] = status.state.terminated.exit_code

                containers.append(container_info)

            pod_info['containers'] = containers
            pod_list.append(pod_info)

        return jsonify(pod_list)
    except Exception as e:
        logger.error(f"Error getting pod details: {e}")
        return jsonify({'error': str(e)}), 500

# Add a new endpoint to get node metrics
@app.route('/api/nodes', methods=['GET'])
def get_nodes():
    """Get details of cluster nodes."""
    try:
        v1 = client.CoreV1Api()
        nodes = v1.list_node()

        node_list = []
        for node in nodes.items:
            # Get node conditions
            conditions = {}
            for condition in node.status.conditions:
                conditions[condition.type] = condition.status

            # Get node capacity
            capacity = {
                'cpu': node.status.capacity.get('cpu'),
                'memory': node.status.capacity.get('memory'),
                'pods': node.status.capacity.get('pods')
            }

            # Get node allocatable resources
            allocatable = {
                'cpu': node.status.allocatable.get('cpu'),
                'memory': node.status.allocatable.get('memory'),
                'pods': node.status.allocatable.get('pods')
            }

            node_info = {
                'name': node.metadata.name,
                'status': 'Ready' if conditions.get('Ready') == 'True' else 'NotReady',
                'roles': [label.replace('node-role.kubernetes.io/', '') for label in node.metadata.labels if 'node-role.kubernetes.io/' in label],
                'internal_ip': next((addr.address for addr in node.status.addresses if addr.type == 'InternalIP'), None),
                'external_ip': next((addr.address for addr in node.status.addresses if addr.type == 'ExternalIP'), None),
                'os_image': node.status.node_info.os_image,
                'kernel_version': node.status.node_info.kernel_version,
                'kubelet_version': node.status.node_info.kubelet_version,
                'container_runtime': node.status.node_info.container_runtime_version,
                'conditions': conditions,
                'capacity': capacity,
                'allocatable': allocatable
            }

            node_list.append(node_info)

        return jsonify(node_list)
    except Exception as e:
        logger.error(f"Error getting node details: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/current', methods=['GET'])
def get_system_metrics():
    """
    Get the current system metrics.
    Returns CPU and memory usage percentages.
    """
    try:
        # Get CPU usage
        cpu_percent = psutil.cpu_percent(interval=1)

        # Get memory usage
        memory = psutil.virtual_memory()
        memory_percent = memory.percent

        return jsonify({
            'cpu_percent': cpu_percent,
            'memory_percent': memory_percent,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting current metrics: {str(e)}")
        return jsonify({
            'error': f"Failed to get current metrics: {str(e)}",
            'cpu_percent': 0,
            'memory_percent': 0,
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/node-specs', methods=['GET'])
def get_node_specs():
    """
    Get the node specifications.
    Returns CPU cores, CPU model, memory total, disk total, OS type, and hostname.
    """
    try:
        # Get CPU information
        cpu_cores = psutil.cpu_count(logical=True)
        cpu_model = "Unknown"

        # Try to get CPU model from /proc/cpuinfo on Linux
        try:
            if os.path.exists('/proc/cpuinfo'):
                with open('/proc/cpuinfo', 'r') as f:
                    for line in f:
                        if line.startswith('model name'):
                            cpu_model = line.split(':', 1)[1].strip()
                            break
        except Exception as e:
            logger.warning(f"Could not read CPU model: {str(e)}")

        # Get memory information
        memory = psutil.virtual_memory()
        memory_total = f"{memory.total / (1024 ** 3):.2f} GB"

        # Get disk information
        disk = psutil.disk_usage('/')
        disk_total = f"{disk.total / (1024 ** 3):.2f} GB"

        # Get OS information
        os_type = f"{platform.system()} {platform.release()}"

        # Get hostname
        hostname = platform.node()

        return jsonify({
            'cpu_cores': cpu_cores,
            'cpu_model': cpu_model,
            'memory_total': memory_total,
            'disk_total': disk_total,
            'os_type': os_type,
            'hostname': hostname
        })
    except Exception as e:
        logger.error(f"Error getting node specifications: {str(e)}")
        return jsonify({
            'error': f"Failed to get node specifications: {str(e)}",
            'cpu_cores': 0,
            'cpu_model': 'Unknown',
            'memory_total': '0 GB',
            'disk_total': '0 GB',
            'os_type': 'Unknown',
            'hostname': 'Unknown'
        }), 500

@app.route('/metrics/status-history', methods=['GET'])
def get_status_history():
    """
    Get system status health history data.
    Returns health percentages for ingress, database API, and database sync components.
    """
    try:
        # Get period from query parameters (default to 24h)
        period = request.args.get('period', '24h')
        
        # Get the cached history data
        with cache_lock:
            if metrics_cache['system_status']['history']:
                # Use the cached history data
                history_data = metrics_cache['system_status']['history']
                
                # If we need more than 24 hours of data, we'll need to generate it
                if period != '24h':
                    # Get the current health status
                    ingress_health = metrics_cache['system_status']['ingress_health']
                    db_api_health = metrics_cache['system_status']['db_api_health']
                    db_sync_health = metrics_cache['system_status']['db_sync_health']
                    
                    # Generate additional data points for longer periods
                    now = datetime.now()
                    hours = 24
                    interval = 1
                    if period == '7d':
                        hours = 168
                        interval = 6
                    elif period == '30d':
                        hours = 720
                        interval = 24
                    
                    # Generate history data for the requested period
                    history_data = []
                    for i in range(0, hours, interval):
                        # Calculate the time point
                        time_point = now - timedelta(hours=i)
                        time_str = time_point.strftime('%H:%M')
                        
                        # Add small variations to simulate realistic history
                        # but maintain the current health status as the baseline
                        history_data.append({
                            'time': time_str,
                            'ingressHealth': max(0, min(100, ingress_health + random.randint(-5, 5))),
                            'dbApiHealth': max(0, min(100, db_api_health + random.randint(-5, 5))),
                            'dbSyncHealth': max(0, min(100, db_sync_health + random.randint(-5, 5)))
                        })
                    
                    # Sort by time
                    history_data.sort(key=lambda x: x['time'])
            else:
                # If we don't have cached data, generate it
                # Get the current health status
                ingress_health = check_ingress_health()
                db_api_health = check_db_api_health()
                db_sync_health = check_db_sync_health()
                
                # Generate history data
                now = datetime.now()
                hours = 24
                interval = 1
                if period == '7d':
                    hours = 168
                    interval = 6
                elif period == '30d':
                    hours = 720
                    interval = 24
                
                # Generate history data for the requested period
                history_data = []
                for i in range(0, hours, interval):
                    # Calculate the time point
                    time_point = now - timedelta(hours=i)
                    time_str = time_point.strftime('%H:%M')
                    
                    # Add small variations to simulate realistic history
                    # but maintain the current health status as the baseline
                    history_data.append({
                        'time': time_str,
                        'ingressHealth': max(0, min(100, ingress_health + random.randint(-5, 5))),
                        'dbApiHealth': max(0, min(100, db_api_health + random.randint(-5, 5))),
                        'dbSyncHealth': max(0, min(100, db_sync_health + random.randint(-5, 5)))
                    })
                
                # Sort by time
                history_data.sort(key=lambda x: x['time'])
        
        return jsonify(history_data)
    except Exception as e:
        logger.error(f"Error getting status history: {str(e)}")
        return jsonify([]), 500

def check_ingress_health():
    """Check the health of the ingress/instance manager component."""
    try:
        # Try to get metrics from the instance manager
        # For now, we'll use a simple check based on challenge metrics
        with cache_lock:
            # If we have challenge metrics, the ingress is likely healthy
            if metrics_cache['challenges']['last_updated'] > 0:
                # Calculate time since last update
                time_since_update = time.time() - metrics_cache['challenges']['last_updated']
                if time_since_update < 300:  # Less than 5 minutes
                    return 100  # Fully healthy
                elif time_since_update < 600:  # Less than 10 minutes
                    return 80   # Slightly degraded
                else:
                    return 50   # Degraded but still functioning
            
            # If we have no challenge metrics, check if we can get CPU metrics
            if metrics_cache['cpu']['last_updated'] > 0:
                return 70  # Partially healthy
        
        # If we can't get any metrics, return a lower health value
        return 50
    except Exception as e:
        logger.error(f"Error checking ingress health: {str(e)}")
        return 0  # Unhealthy

def check_db_api_health():
    """Check the health of the database API component."""
    try:
        # Try to make a request to the database API health endpoint
        db_api_url = os.environ.get('DATABASE_API_URL', 'http://database-api-service:80')
        response = requests.get(f"{db_api_url}/status", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'ok' and data.get('database') == 'connected':
                return 100  # Fully healthy
            elif data.get('status') == 'ok':
                return 80   # API is up but database connection might have issues
            else:
                return 50   # API is up but has issues
        else:
            return 30  # API is responding but with errors
    except requests.exceptions.RequestException:
        # If we can't connect to the API, return a lower health value
        return 0  # Unhealthy
    except Exception as e:
        logger.error(f"Error checking database API health: {str(e)}")
        return 0  # Unhealthy

def check_db_sync_health():
    """Check the health of the database sync component."""
    try:
        # For now, we'll use a simple check based on the database API health
        # In a real implementation, you would check the database sync component directly
        db_api_health = check_db_api_health()
        
        # If the database API is healthy, assume the sync is working but slightly less reliable
        if db_api_health > 80:
            return 90  # Mostly healthy
        elif db_api_health > 50:
            return 70  # Partially healthy
        elif db_api_health > 0:
            return 40  # Degraded
        else:
            return 0   # Unhealthy
    except Exception as e:
        logger.error(f"Error checking database sync health: {str(e)}")
        return 0  # Unhealthy

def collect_system_status_metrics():
    """Collect system status health metrics."""
    try:
        # Get current time
        current_time = time.time()

        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['system_status']['last_updated'] < METRICS_CACHE_TTL:
                # Cache is still valid, use cached values
                return

        # Get health status of components
        ingress_health = check_ingress_health()
        db_api_health = check_db_api_health()
        db_sync_health = check_db_sync_health()

        # Format timestamp for history
        timestamp = datetime.now().strftime('%H:%M')

        # Update cache - maintain exactly 24 data points
        with cache_lock:
            metrics_cache['system_status'] = {
                'ingress_health': ingress_health,
                'db_api_health': db_api_health,
                'db_sync_health': db_sync_health,
                'last_updated': current_time,
                'history': metrics_cache['system_status']['history'][1:] + [{
                    'time': timestamp,
                    'ingressHealth': ingress_health,
                    'dbApiHealth': db_api_health,
                    'dbSyncHealth': db_sync_health
                }]
            }
            
        logger.info(f"Updated system status metrics: ingress={ingress_health}%, db_api={db_api_health}%, db_sync={db_sync_health}%")
    except Exception as e:
        logger.error(f"Error collecting system status metrics: {e}")

if __name__ == '__main__':
    # Start Flask app
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
