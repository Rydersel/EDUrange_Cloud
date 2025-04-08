from kubernetes import client, config
import asyncio
import logging

logger = logging.getLogger(__name__)

async def ensure_seccomp_profiles():
    """
    Checks if seccomp profiles exist in the cluster and creates them if not present.
    Returns True if profiles were created, False if they already existed.
    """
    try:
        v1 = client.CoreV1Api()
        
        # Check if seccomp ConfigMap exists
        try:
            v1.read_namespaced_config_map('seccomp-profiles', 'kube-system')
            return False  # Profiles already exist
        except client.exceptions.ApiException as e:
            if e.status != 404:  # If error is not "Not Found"
                raise

        # Create DaemonSet for seccomp directory setup
        apps_v1 = client.AppsV1Api()
        daemon_set = {
            "apiVersion": "apps/v1",
            "kind": "DaemonSet",
            "metadata": {
                "name": "seccomp-profile-installer",
                "namespace": "kube-system"
            },
            "spec": {
                "selector": {
                    "matchLabels": {
                        "name": "seccomp-profile-installer"
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "name": "seccomp-profile-installer"
                        }
                    },
                    "spec": {
                        "containers": [{
                            "name": "installer",
                            "image": "busybox",
                            "command": ["/bin/sh", "-c", "mkdir -p /host/var/lib/kubelet/seccomp && while true; do sleep 3600; done"],
                            "volumeMounts": [{
                                "name": "host-path",
                                "mountPath": "/host"
                            }],
                            "securityContext": {
                                "privileged": True
                            }
                        }],
                        "volumes": [{
                            "name": "host-path",
                            "hostPath": {
                                "path": "/"
                            }
                        }]
                    }
                }
            }
        }
        
        apps_v1.create_namespaced_daemon_set(namespace="kube-system", body=daemon_set)

        # Create ConfigMap with seccomp profiles
        profiles_config_map = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {
                "name": "seccomp-profiles",
                "namespace": "kube-system"
            },
            "data": {
                "webos.json": open("seccomp_profiles/webos.json").read(),
                "terminal.json": open("seccomp_profiles/terminal.json").read()
            }
        }
        
        v1.create_namespaced_config_map(namespace="kube-system", body=profiles_config_map)
        
        # Wait for DaemonSet to be ready
        while True:
            daemon_set = apps_v1.read_namespaced_daemon_set(
                name="seccomp-profile-installer",
                namespace="kube-system"
            )
            if daemon_set.status.number_ready == daemon_set.status.desired_number_of_nodes:
                break
            await asyncio.sleep(2)
            
        return True

    except Exception as e:
        logger.error(f"Failed to setup seccomp profiles: {str(e)}")
        raise

async def deploy_pod(pod_manifest, namespace="default"):
    """Deploy a pod to the cluster with seccomp profile support."""
    await ensure_seccomp_profiles()  # Ensure profiles exist before deploying
    v1 = client.CoreV1Api()
    try:
        pod = v1.create_namespaced_pod(namespace=namespace, body=pod_manifest)
        logger.info(f"Pod {pod.metadata.name} created successfully")
        return pod
    except Exception as e:
        logger.error(f"Failed to create pod: {str(e)}")
        raise 