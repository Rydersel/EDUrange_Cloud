import logging

def extract_flag_from_pod(pod_data, k8s_client):
    """
    Extract flag from pod data with multiple fallback strategies
    
    Args:
        pod_data (dict): The pod data from the instance manager
        k8s_client (K8sClient): The Kubernetes client for API calls
        
    Returns:
        tuple: (flag_value, flag_secret_name)
    """
    pod_name = pod_data.get('name', '')
    flag_secret_name = pod_data.get('flag_secret_name', '')
    
    # First check if instance contains direct flag value
    flag_value = pod_data.get('flag', None)
    
    # If no direct flag, try to get from flags dictionary
    if not flag_value and pod_data.get('flags'):
        flags_dict = pod_data.get('flags', {})
        if flags_dict:
            # Try to get FLAG_1 first
            flag_value = flags_dict.get('FLAG_1')
            # If not found, use the first value
            if not flag_value and len(flags_dict) > 0:
                flag_value = next(iter(flags_dict.values()))
                
    # If still no flag, try to fetch it from Kubernetes
    if not flag_value:
        flag_value = k8s_client.get_flag(flag_secret_name, pod_name)
        
    logging.info(f"Flag for instance {pod_name}: {flag_value if flag_value else 'Not set'}")
    return flag_value, flag_secret_name
