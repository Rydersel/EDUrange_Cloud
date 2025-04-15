import logging
from kubernetes import client
from kubernetes.client.rest import ApiException

def delete_challenge_pod(pod_name, namespace="default"):
    """Delete a challenge pod and its associated resources"""
    logging.info(f"Deleting challenge pod: {pod_name} in namespace {namespace}")

    try:
        # Get the Kubernetes API clients
        core_api = client.CoreV1Api()
        networking_v1 = client.NetworkingV1Api()

        # Delete pod
        try:
            core_api.delete_namespaced_pod(
                name=pod_name,
                namespace=namespace,
                body=client.V1DeleteOptions(propagation_policy='Foreground')
            )
            logging.info(f"Successfully deleted pod {pod_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting pod {pod_name}: {e}")
                raise

        # Delete service
        try:
            service_name = f"service-{pod_name}"
            core_api.delete_namespaced_service(
                name=service_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted service {service_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting service {service_name}: {e}")

        # Also try deleting service with just pod_name (for backward compatibility)
        try:
            service_name = pod_name
            core_api.delete_namespaced_service(
                name=service_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted service {service_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting service {service_name}: {e}")

        # Delete flag secret
        try:
            secret_name = f"flag-secret-{pod_name}"
            core_api.delete_namespaced_secret(
                name=secret_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted secret {secret_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting secret {secret_name}: {e}")

        # Delete ingress
        try:
            ingress_name = f"ingress-{pod_name}"
            networking_v1.delete_namespaced_ingress(
                name=ingress_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted ingress {ingress_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting ingress {ingress_name}: {e}")

        # Also try deleting ingress with just pod_name (for backward compatibility)
        try:
            ingress_name = pod_name
            networking_v1.delete_namespaced_ingress(
                name=ingress_name,
                namespace=namespace,
                body=client.V1DeleteOptions()
            )
            logging.info(f"Successfully deleted ingress {ingress_name}")
        except ApiException as e:
            if e.status != 404:  # Ignore 404 (not found)
                logging.warning(f"Error deleting ingress {ingress_name}: {e}")

        # Check for and delete any other persistent volume claims
        try:
            pvcs = core_api.list_namespaced_persistent_volume_claim(
                namespace=namespace,
                label_selector=f"instance={pod_name}"
            )

            for pvc in pvcs.items:
                core_api.delete_namespaced_persistent_volume_claim(
                    name=pvc.metadata.name,
                    namespace=namespace,
                    body=client.V1DeleteOptions()
                )
                logging.info(f"Successfully deleted PVC {pvc.metadata.name}")
        except ApiException as e:
            logging.warning(f"Error cleaning up PVCs for {pod_name}: {e}")

        # Check for and delete any other config maps
        try:
            config_maps = core_api.list_namespaced_config_map(
                namespace=namespace,
                label_selector=f"instance={pod_name}"
            )

            for cm in config_maps.items:
                core_api.delete_namespaced_config_map(
                    name=cm.metadata.name,
                    namespace=namespace,
                    body=client.V1DeleteOptions()
                )
                logging.info(f"Successfully deleted ConfigMap {cm.metadata.name}")
        except ApiException as e:
            logging.warning(f"Error cleaning up ConfigMaps for {pod_name}: {e}")

        logging.info(f"Successfully terminated all resources for pod {pod_name}")
        return True
    except Exception as e:
        logging.error(f"Error in delete_challenge_pod: {e}")
        raise 