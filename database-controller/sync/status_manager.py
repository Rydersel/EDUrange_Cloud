import logging
from enum import Enum, auto

class ChallengeStatus(Enum):
    """Challenge status enum mirroring the database schema enum"""
    CREATING = "CREATING"
    ACTIVE = "ACTIVE"
    TERMINATING = "TERMINATING"
    ERROR = "ERROR"
    
    @classmethod
    def values(cls):
        """Get all valid status values as strings"""
        return [status.value for status in cls]
    
    @classmethod
    def from_string(cls, status_str):
        """Convert string to enum, with validation"""
        try:
            return cls(status_str)
        except ValueError:
            logging.warning(f"Invalid status value '{status_str}'. Using ERROR as fallback.")
            return cls.ERROR

class StatusEvent(Enum):
    """Events that can trigger status transitions"""
    CREATED = auto()
    ACTIVATED = auto()
    TERMINATION_REQUESTED = auto()
    TERMINATED = auto()
    ERROR_OCCURRED = auto()
    RETRY = auto()

class ChallengeStatusManager:
    """
    A state machine for managing challenge status transitions.
    
    Ensures that status changes are valid according to the allowed transitions.
    Provides a clean way to map Kubernetes status to challenge status.
    """
    
    # Valid status transitions based on current state
    # Format: {current_status: {event: next_status}}
    TRANSITIONS = {
        ChallengeStatus.CREATING: {
            StatusEvent.ACTIVATED: ChallengeStatus.ACTIVE,  # Direct transition to ACTIVE for running pods
            StatusEvent.ERROR_OCCURRED: ChallengeStatus.ERROR
        },
        ChallengeStatus.ACTIVE: {
            StatusEvent.TERMINATION_REQUESTED: ChallengeStatus.TERMINATING,
            StatusEvent.ERROR_OCCURRED: ChallengeStatus.ERROR
        },
        ChallengeStatus.TERMINATING: {
            StatusEvent.TERMINATED: ChallengeStatus.ACTIVE,  # Allow recreating terminated pods
            StatusEvent.ERROR_OCCURRED: ChallengeStatus.ERROR
        },
        ChallengeStatus.ERROR: {
            StatusEvent.RETRY: ChallengeStatus.CREATING,
            StatusEvent.ACTIVATED: ChallengeStatus.ACTIVE  # Allow recovery from error if pod is running
        }
    }
    
    # Mapping from Kubernetes pod status to StatusEvent
    K8S_STATUS_EVENT_MAP = {
        "pending": StatusEvent.CREATED,
        "running": StatusEvent.ACTIVATED,
        "active": StatusEvent.ACTIVATED,
        "succeeded": StatusEvent.TERMINATED,
        "failed": StatusEvent.ERROR_OCCURRED,
        "unknown": StatusEvent.ERROR_OCCURRED,
        "terminating": StatusEvent.TERMINATION_REQUESTED,
        "terminated": StatusEvent.TERMINATED,
        "creating": StatusEvent.CREATED
    }
    
    # Direct mapping from Kubernetes status to ChallengeStatus for new instances
    K8S_STATUS_MAP = {
        "pending": ChallengeStatus.CREATING,
        "running": ChallengeStatus.ACTIVE,
        "active": ChallengeStatus.ACTIVE,
        "succeeded": ChallengeStatus.ACTIVE,  # Change from TERMINATED to ACTIVE
        "failed": ChallengeStatus.ERROR,
        "unknown": ChallengeStatus.ERROR,
        "terminating": ChallengeStatus.TERMINATING,
        "terminated": ChallengeStatus.ACTIVE,  # Change from TERMINATED to ACTIVE
        "creating": ChallengeStatus.CREATING
    }
    
    @classmethod
    def get_status_for_new_pod(cls, k8s_status, pod_status=None):
        """
        Get the appropriate status for a new pod.
        Since there's no previous status, we directly map from k8s_status.
        
        Args:
            k8s_status (str): Kubernetes status string
            pod_status (str, optional): Additional status from pod object
            
        Returns:
            str: The mapped challenge status string value
        """
        # Normalize status strings
        k8s_status = k8s_status.lower() if k8s_status else "unknown"
        pod_status = pod_status.lower() if pod_status else ""

        logging.info(f"Mapping new pod status - K8s status: '{k8s_status}', pod status: '{pod_status}'")
        
        # Get status from mapping
        status = cls.K8S_STATUS_MAP.get(k8s_status, ChallengeStatus.ERROR)
        
        # Override with pod status if available - prioritize 'running'/'active' states
        if pod_status and pod_status in ['active', 'running']:
            status = ChallengeStatus.ACTIVE
            logging.info(f"Pod status override: '{pod_status}' -> {status.value}")
            
        # Special handling for 'running' K8s status
        if k8s_status == 'running':
            status = ChallengeStatus.ACTIVE
            logging.info(f"K8s status override: '{k8s_status}' -> {status.value}")
            
        logging.info(f"Final status for new pod: {status.value}")
        return status.value
    
    @classmethod
    def get_event_from_k8s(cls, k8s_status):
        """
        Map Kubernetes status to a StatusEvent
        
        Args:
            k8s_status (str): Kubernetes status string
            
        Returns:
            StatusEvent: The mapped event
        """
        k8s_status = k8s_status.lower() if k8s_status else "unknown"
        event = cls.K8S_STATUS_EVENT_MAP.get(k8s_status, StatusEvent.ERROR_OCCURRED)
        logging.info(f"Mapped K8s status '{k8s_status}' to event: {event.name}")
        return event
    
    @classmethod
    def can_transition(cls, current_status_str, new_status_str):
        """
        Check if a transition from current_status to new_status is valid.
        
        Args:
            current_status_str (str): Current status string
            new_status_str (str): New status string
            
        Returns:
            bool: True if transition is valid, False otherwise
        """
        # Same status is always valid
        if current_status_str == new_status_str:
            return True
            
        # Convert strings to enums
        try:
            current_status = ChallengeStatus(current_status_str)
            new_status = ChallengeStatus(new_status_str)
        except ValueError:
            logging.warning(f"Invalid status in transition check: {current_status_str} -> {new_status_str}")
            return False
            
        # Check transitions for each possible event
        for event, resulting_status in cls.TRANSITIONS.get(current_status, {}).items():
            if resulting_status == new_status:
                logging.info(f"Valid transition path found: {current_status_str} -> {new_status_str} via {event.name}")
                return True
                
        logging.warning(f"No valid transition path: {current_status_str} -> {new_status_str}")
        return False
    
    @classmethod
    def get_next_status(cls, current_status_str, k8s_status, pod_status=None):
        """
        Determine the next status based on current status and Kubernetes status
        
        Args:
            current_status_str (str): Current challenge status string
            k8s_status (str): Kubernetes status string
            pod_status (str, optional): Additional status from pod object
            
        Returns:
            str: The next status string value
        """
        # Normalize status strings
        k8s_status = k8s_status.lower() if k8s_status else "unknown"
        pod_status = pod_status.lower() if pod_status else ""
        
        logging.info(f"Determining next status - Current: '{current_status_str}', K8s: '{k8s_status}', Pod: '{pod_status}'")
        
        # Convert current status to enum
        try:
            current_status = ChallengeStatus(current_status_str)
        except ValueError:
            logging.warning(f"Invalid current status '{current_status_str}'. Using ERROR as fallback.")
            return ChallengeStatus.ERROR.value
        
        # Force transition to ACTIVE if pod is running, regardless of current state
        # (This is a special case to handle pods that are running but stuck in CREATING/STARTING)
        if k8s_status == 'running' or (pod_status and pod_status in ['active', 'running']):
            logging.info(f"Force transition to ACTIVE: pod is running with status '{k8s_status}'/'{pod_status}'")
            
            # Only transition if not already active or in terminal states
            if current_status not in [ChallengeStatus.ACTIVE, ChallengeStatus.TERMINATED]:
                return ChallengeStatus.ACTIVE.value
                
        # Map k8s status to event
        event = cls.get_event_from_k8s(k8s_status)
        
        # Get next status based on current status and event
        next_status = cls.TRANSITIONS.get(current_status, {}).get(event)
        
        if next_status:
            logging.info(f"Valid transition found: {current_status.value} -[{event.name}]-> {next_status.value}")
            return next_status.value
        else:
            # No valid transition based on standard rules
            
            # Special case: Running pods should always be ACTIVE
            if k8s_status == 'running' and current_status != ChallengeStatus.ACTIVE:
                logging.info(f"Special case: Running pod not ACTIVE. Forcing to ACTIVE state.")
                return ChallengeStatus.ACTIVE.value
                
            # Special case: Error recovery if pod is running again
            if current_status == ChallengeStatus.ERROR and k8s_status == 'running':
                logging.info(f"Error recovery: Pod is running again. Transitioning to ACTIVE.")
                return ChallengeStatus.ACTIVE.value
                
            # Error event always transitions to ERROR state
            if event == StatusEvent.ERROR_OCCURRED:
                logging.warning(f"Error event received for {current_status.value}, transitioning to ERROR")
                return ChallengeStatus.ERROR.value
            
            logging.info(f"No valid transition for {current_status.value} with event {event.name}, keeping current status")
            return current_status.value 