
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Monitoring service URL
MONITORING_SERVICE_URL = os.environ.get('MONITORING_SERVICE_URL', 'http://monitoring-service:5000')

# Cache for metrics data
metrics_cache: Dict[str, Any] = {
    'cpu': {
        'system': 0,
        'challenges': 0,
        'total': 0,
        'last_updated': 0
    },
    'memory': {
        'used': 0,
        'available': 0,
        'total_bytes': 0,
        'used_bytes': 0,
        'last_updated': 0
    },
    'network': {
        'inbound': 0,
        'outbound': 0,
        'total': 0,
        'last_updated': 0
    },
    'challenges': {
        'total': 0,
        'running': 0,
        'pending': 0,
        'failed': 0,
        'last_updated': 0
    }
}

# Cache lock to prevent race conditions
cache_lock = Lock()

# Cache TTL in seconds
CACHE_TTL = 15

def get_metrics_from_monitoring_service() -> Dict[str, Any]:
    """
    Get metrics from the monitoring service.
    
    Returns:
        Dict containing all metrics
    """
    try:
        response = requests.get(f"{MONITORING_SERVICE_URL}/api/metrics/current", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to get metrics from monitoring service: {response.status_code}")
            return {}
    except Exception as e:
        logger.error(f"Error getting metrics from monitoring service: {e}")
        return {}

def update_metrics_cache() -> None:
    """
    Update the metrics cache with data from the monitoring service.
    """
    try:
        # Get current time
        current_time = time.time()
        
        # Check if cache is still valid
        with cache_lock:
            if current_time - metrics_cache['cpu']['last_updated'] < CACHE_TTL:
                # Cache is still valid, no need to update
                return
        
        # Get metrics from monitoring service
        metrics = get_metrics_from_monitoring_service()
        if not metrics:
            logger.warning("No metrics received from monitoring service")
            return
        
        # Update cache
        with cache_lock:
            if 'cpu' in metrics:
                metrics_cache['cpu'] = {
                    'system': metrics['cpu']['system'],
                    'challenges': metrics['cpu']['challenges'],
                    'total': metrics['cpu']['total'],
                    'last_updated': current_time
                }
            
            if 'memory' in metrics:
                metrics_cache['memory'] = {
                    'used': metrics['memory']['used'],
                    'available': metrics['memory']['available'],
                    'total_bytes': metrics['memory']['total_bytes'],
                    'used_bytes': metrics['memory']['used_bytes'],
                    'last_updated': current_time
                }
            
            if 'network' in metrics:
                metrics_cache['network'] = {
                    'inbound': metrics['network']['inbound'],
                    'outbound': metrics['network']['outbound'],
                    'total': metrics['network']['total'],
                    'last_updated': current_time
                }
            
            if 'challenges' in metrics:
                metrics_cache['challenges'] = {
                    'total': metrics['challenges']['total'],
                    'running': metrics['challenges']['running'],
                    'pending': metrics['challenges']['pending'],
                    'failed': metrics['challenges']['failed'],
                    'last_updated': current_time
                }
    except Exception as e:
        logger.error(f"Error updating metrics cache: {e}")

def get_cpu_metrics() -> Dict[str, Any]:
    """
    Get CPU metrics from cache.
    
    Returns:
        Dict containing CPU metrics
    """
    update_metrics_cache()
    with cache_lock:
        return {
            'system': metrics_cache['cpu']['system'],
            'challenges': metrics_cache['cpu']['challenges'],
            'total': metrics_cache['cpu']['total']
        }

def get_memory_metrics() -> Dict[str, Any]:
    """
    Get memory metrics from cache.
    
    Returns:
        Dict containing memory metrics
    """
    update_metrics_cache()
    with cache_lock:
        return {
            'used': metrics_cache['memory']['used'],
            'available': metrics_cache['memory']['available']
        }

def get_network_metrics() -> Dict[str, Any]:
    """
    Get network metrics from cache.
    
    Returns:
        Dict containing network metrics
    """
    update_metrics_cache()
    with cache_lock:
        return {
            'inbound': metrics_cache['network']['inbound'],
            'outbound': metrics_cache['network']['outbound'],
            'total': metrics_cache['network']['total']
        }

def get_challenge_metrics() -> Dict[str, Any]:
    """
    Get challenge metrics from cache.
    
    Returns:
        Dict containing challenge metrics
    """
    update_metrics_cache()
    with cache_lock:
        return {
            'total': metrics_cache['challenges']['total'],
            'running': metrics_cache['challenges']['running'],
            'pending': metrics_cache['challenges']['pending'],
            'failed': metrics_cache['challenges']['failed']
        }

def get_metrics_history(metric_type: str, period: str = '24h') -> List[Dict[str, Any]]:
    """
    Get historical metrics data from the monitoring service.
    
    Args:
        metric_type: Type of metrics to get (cpu, memory, network)
        period: Time period to get data for (24h, 7d, 30d)
        
    Returns:
        List of data points with metrics values
    """
    try:
        response = requests.get(
            f"{MONITORING_SERVICE_URL}/api/metrics/history",
            params={'type': metric_type, 'period': period},
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to get metrics history from monitoring service: {response.status_code}")
            return []
    except Exception as e:
        logger.error(f"Error getting metrics history from monitoring service: {e}")
        return [] 