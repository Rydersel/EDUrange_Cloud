import React, { useState, useEffect } from 'react';
import { pollTaskStatus } from '@/lib/challenges-service';
import { Spinner, Badge, Text, VStack, HStack, Button } from '@chakra-ui/react';
import { FaExclamationTriangle } from 'react-icons/fa';

interface QueuedChallengeStatusProps {
  instanceId: string;
  taskId: string;
  queuePosition?: number;
  priority?: number;
  onDeploymentComplete?: (url: string) => void;
  onError?: (error: string) => void;
}

export default function QueuedChallengeStatus({
  instanceId,
  taskId,
  queuePosition = 0,
  priority = 2,
  onDeploymentComplete,
  onError
}: QueuedChallengeStatusProps) {
  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Start polling when component mounts
  useEffect(() => {
    startPolling();
    
    // Clean up polling when component unmounts
    return () => {
      setIsPolling(false);
    };
  }, []);

  const startPolling = () => {
    if (isPolling) return;
    
    setIsPolling(true);
    
    pollTaskStatus(taskId, instanceId)
      .then(result => {
        setIsPolling(false);
        
        if (result.status === 'ACTIVE' || result.status === 'active') {
          setStatus('active');
          if (onDeploymentComplete && result.url) {
            onDeploymentComplete(result.url);
          }
        } else if (result.status === 'ERROR' || result.status === 'error') {
          setStatus('error');
          setError(result.error || 'An unknown error occurred');
          if (onError) {
            onError(result.error || 'An unknown error occurred');
          }
        }
      })
      .catch(err => {
        setIsPolling(false);
        setStatus('error');
        const errorMessage = err.message || 'An error occurred while checking deployment status';
        setError(errorMessage);
        
        if (onError) {
          onError(errorMessage);
        }
      });
  };

  const getPriorityLabel = (priority: number) => {
    switch(priority) {
      case 1: return 'High';
      case 2: return 'Normal';
      case 3: return 'Low';
      default: return 'Normal';
    }
  };

  const getStatusMessage = () => {
    if (status === 'queued') {
      return `Queued for deployment (Position: ${queuePosition}, Priority: ${getPriorityLabel(priority)})`;
    } else if (status === 'active') {
      return 'Challenge deployed successfully!';
    } else if (status === 'error') {
      return `Deployment failed: ${error}`;
    }
    return 'Processing...';
  };

  return (
    <VStack gap={3} alignItems="stretch" p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
      <HStack>
        {status === 'queued' && (
          <>
            <Spinner size="sm" color="blue.500" />
            <Badge colorScheme="blue">QUEUED</Badge>
          </>
        )}
        {status === 'active' && (
          <Badge colorScheme="green">DEPLOYED</Badge>
        )}
        {status === 'error' && (
          <>
            <FaExclamationTriangle color="red" />
            <Badge colorScheme="red">ERROR</Badge>
          </>
        )}
      </HStack>
      
      <Text fontSize="sm">{getStatusMessage()}</Text>
      
      {status === 'error' && (
        <Button size="sm" colorScheme="blue" onClick={startPolling} disabled={isPolling}>
          {isPolling ? <Spinner size="xs" mr={2} /> : null}
          Retry
        </Button>
      )}
    </VStack>
  );
} 