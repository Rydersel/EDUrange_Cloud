import React, { useState, useEffect, useCallback } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';

const Verification = () => {
  const { domain, addLog } = useInstallStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLaunchingStudio, setIsLaunchingStudio] = useState(false);
  const [isDeletingStudio, setIsDeletingStudio] = useState(false);
  const [studioPodName, setStudioPodName] = useState('');
  const [studioRunning, setStudioRunning] = useState(false);
  const [studioAccessible, setStudioAccessible] = useState(false);
  const [isCheckingStudioAccess, setIsCheckingStudioAccess] = useState(false);
  const [accessCheckAttempts, setAccessCheckAttempts] = useState(0);

  // Kubernetes Dashboard state variables
  const [isLaunchingKubeDashboard, setIsLaunchingKubeDashboard] = useState(false);
  const [isDeletingKubeDashboard, setIsDeletingKubeDashboard] = useState(false);
  const [kubeDashboardRunning, setKubeDashboardRunning] = useState(false);
  const [kubeDashboardAccessible, setKubeDashboardAccessible] = useState(false);
  const [isCheckingKubeDashboardAccess, setIsCheckingKubeDashboardAccess] = useState(false);
  const [kubeDashboardAccessCheckAttempts, setKubeDashboardAccessCheckAttempts] = useState(0);

  const [verificationStatus, setVerificationStatus] = useState({
    ingressController: 'pending',
    certManager: 'pending',
    database: 'pending',
    databaseController: 'pending',
    instanceManager: 'pending',
    monitoringService: 'pending',
    dashboard: 'pending'
  });
  const [logs, setLogs] = useState([]);

  // Check if Prisma Studio is running on component mount
  useEffect(() => {
    checkPrismaStudioStatus();
    checkKubernetesDashboardStatus();
  }, []);

  // Function to check if Prisma Studio is running
  const checkPrismaStudioStatus = async () => {
    try {
      const studioPodResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=prisma-studio',
        '--ignore-not-found'
      ]);

      if (studioPodResult.code === 0 && studioPodResult.stdout && studioPodResult.stdout.includes('prisma-studio')) {
        // Extract the pod name
        const podNameMatch = studioPodResult.stdout.match(/prisma-studio-[^\s]+/);
        if (podNameMatch) {
          setStudioPodName(podNameMatch[0]);
          setStudioRunning(true);
          return; // Exit early, pod is found
        }
      }

      // If we get here, no pod was found or pod name couldn't be extracted
      // Reset all Prisma Studio related states
      setStudioRunning(false);
      setStudioPodName('');
      setStudioAccessible(false);
      setAccessCheckAttempts(0);
    } catch (error) {
      console.error('Error checking Prisma Studio status:', error);
      // Reset all states on error as well
      setStudioRunning(false);
      setStudioPodName('');
      setStudioAccessible(false);
      setAccessCheckAttempts(0);
    }
  };

  // Function to check if Kubernetes Dashboard is running
  const checkKubernetesDashboardStatus = async () => {
    try {
      const kubeDashboardResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'kubernetes-dashboard',
        '--ignore-not-found'
      ]);

      if (kubeDashboardResult.code === 0 && kubeDashboardResult.stdout && kubeDashboardResult.stdout.includes('kubernetes-dashboard')) {
        setKubeDashboardRunning(true);

        // Check if the ingress exists
        const ingressResult = await window.api.executeCommand('kubectl', [
          'get',
          'ingress',
          'kubernetes-dashboard',
          '-n',
          'kubernetes-dashboard',
          '--ignore-not-found'
        ]);

        if (ingressResult.code === 0 && ingressResult.stdout && ingressResult.stdout.includes('kubernetes-dashboard')) {
          setKubeDashboardAccessible(true);
        } else {
          setKubeDashboardAccessible(false);
        }

        return; // Exit early, dashboard is found
      }

      // If we get here, the dashboard is not running
      setKubeDashboardRunning(false);
      setKubeDashboardAccessible(false);
    } catch (error) {
      console.error('Error checking Kubernetes Dashboard status:', error);
      setKubeDashboardRunning(false);
      setKubeDashboardAccessible(false);
    }
  };

  // Function to delete Prisma Studio
  const deletePrismaStudio = async () => {
    if (!studioRunning) return;

    setIsDeletingStudio(true);

    try {
      const addStudioLog = (message) => {
        addLog(`Prisma Studio: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addStudioLog('Deleting Prisma Studio...');

      // Delete the ingress
      addStudioLog('Deleting Prisma Studio ingress...');
      const deleteIngressResult = await window.api.executeCommand('kubectl', [
        'delete',
        'ingress',
        'prisma-studio-ingress',
        '--ignore-not-found'
      ]);

      if (deleteIngressResult.code !== 0) {
        addStudioLog(`Warning: Failed to delete ingress: ${deleteIngressResult.stderr}`);
      }

      // Delete the service
      addStudioLog('Deleting Prisma Studio service...');
      const deleteServiceResult = await window.api.executeCommand('kubectl', [
        'delete',
        'service',
        'prisma-studio',
        '--ignore-not-found'
      ]);

      if (deleteServiceResult.code !== 0) {
        addStudioLog(`Warning: Failed to delete service: ${deleteServiceResult.stderr}`);
      }

      // Delete the pod
      addStudioLog('Deleting Prisma Studio pod...');
      const deletePodResult = await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        studioPodName,
        '--ignore-not-found'
      ]);

      if (deletePodResult.code !== 0) {
        addStudioLog(`Warning: Failed to delete pod: ${deletePodResult.stderr}`);
      }

      // Delete the ConfigMap
      addStudioLog('Deleting Prisma Studio ConfigMap...');
      const configMapName = `prisma-schema-studio-${studioPodName.split('-').pop()}`;
      const deleteConfigMapResult = await window.api.executeCommand('kubectl', [
        'delete',
        'configmap',
        configMapName,
        '--ignore-not-found'
      ]);

      if (deleteConfigMapResult.code !== 0) {
        addStudioLog(`Warning: Failed to delete ConfigMap: ${deleteConfigMapResult.stderr}`);
      }

      addStudioLog('Prisma Studio deleted successfully.');

      // Reset all Prisma Studio related states
      setStudioRunning(false);
      setStudioPodName('');
      setStudioAccessible(false);
      setAccessCheckAttempts(0);

      // Refresh the status
      await checkPrismaStudioStatus();
    } catch (error) {
      addLog(`Error deleting Prisma Studio: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);

      // Even if there's an error, reset the states to ensure UI is consistent
      setStudioRunning(false);
      setStudioPodName('');
      setStudioAccessible(false);
      setAccessCheckAttempts(0);
    } finally {
      setIsDeletingStudio(false);
    }
  };

  const verifyInstallation = useCallback(async () => {
    setIsVerifying(true);
    setLogs([]);

    try {
      // Add log entry
      const addVerificationLog = (message) => {
        addLog(`Verification: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addVerificationLog('Starting verification...');

      // Verify NGINX Ingress Controller
      addVerificationLog('Verifying NGINX Ingress Controller...');

      const ingressResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'ingress-nginx',
        '-l',
        'app.kubernetes.io/component=controller'
      ]);

      if (ingressResult.code === 0 && ingressResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, ingressController: 'success' }));
        addVerificationLog('NGINX Ingress Controller is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, ingressController: 'error' }));
        addVerificationLog('NGINX Ingress Controller verification failed.');
      }

      // Verify cert-manager
      addVerificationLog('Verifying cert-manager...');

      const certManagerResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'cert-manager',
        '-l',
        'app.kubernetes.io/instance=cert-manager'
      ]);

      if (certManagerResult.code === 0 && certManagerResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, certManager: 'success' }));
        addVerificationLog('cert-manager is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, certManager: 'error' }));
        addVerificationLog('cert-manager verification failed.');
      }

      // Verify wildcard certificate
      addVerificationLog('Verifying wildcard certificate...');

      const certResult = await window.api.executeCommand('kubectl', [
        'get',
        'certificate',
        'wildcard-certificate-prod',
        '-o',
        'jsonpath={.status.conditions[?(@.type=="Ready")].status}'
      ]);

      if (certResult.code === 0 && certResult.stdout.includes('True')) {
        addVerificationLog('Wildcard certificate is ready.');
      } else {
        addVerificationLog('Wildcard certificate is not ready yet. This may take some time to provision.');
      }

      // Verify database
      addVerificationLog('Verifying database...');

      const databaseResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=postgres'
      ]);

      if (databaseResult.code === 0 && databaseResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, database: 'success' }));
        addVerificationLog('Database is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, database: 'error' }));
        addVerificationLog('Database verification failed.');
      }

      // Verify database controller
      addVerificationLog('Verifying database controller...');

      const databaseControllerResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=database-controller'
      ]);

      if (databaseControllerResult.code === 0 && databaseControllerResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, databaseController: 'success' }));
        addVerificationLog('Database controller is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, databaseController: 'error' }));
        addVerificationLog('Database controller verification failed.');
      }

      // Verify instance manager
      addVerificationLog('Verifying instance manager...');

      const instanceManagerResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=instance-manager'
      ]);

      if (instanceManagerResult.code === 0 && instanceManagerResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, instanceManager: 'success' }));
        addVerificationLog('Instance manager is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, instanceManager: 'error' }));
        addVerificationLog('Instance manager verification failed.');
      }

      // Verify monitoring service
      addVerificationLog('Verifying monitoring service...');

      const monitoringServiceResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=monitoring-service'
      ]);

      if (monitoringServiceResult.code === 0 && monitoringServiceResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, monitoringService: 'success' }));
        addVerificationLog('Monitoring service is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, monitoringService: 'error' }));
        addVerificationLog('Monitoring service verification failed.');
      }

      // Verify dashboard
      addVerificationLog('Verifying dashboard...');

      const dashboardResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=dashboard'
      ]);

      if (dashboardResult.code === 0 && dashboardResult.stdout.includes('Running')) {
        setVerificationStatus(prev => ({ ...prev, dashboard: 'success' }));
        addVerificationLog('Dashboard is running.');
      } else {
        setVerificationStatus(prev => ({ ...prev, dashboard: 'error' }));
        addVerificationLog('Dashboard verification failed.');
      }

      addVerificationLog('Verification completed.');

    } catch (error) {
      console.error('Error during verification:', error);
      addLog(`Error during verification: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsVerifying(false);
    }
  }, [addLog, setLogs, setVerificationStatus, setIsVerifying]);

  useEffect(() => {
    verifyInstallation();
  }, [verifyInstallation]);

  const allComponentsVerified = Object.values(verificationStatus).every(status => status === 'success');

  // Function to check if Prisma Studio is actually accessible
  const checkPrismaStudioAccessibility = useCallback(async (forceCheck = false) => {
    if ((!studioRunning || !domain.name) && !forceCheck) return;

    // Prevent multiple simultaneous checks
    if (isCheckingStudioAccess && !forceCheck) return;

    setIsCheckingStudioAccess(true);
    try {
      const addStudioLog = (message) => {
        addLog(`Prisma Studio: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addStudioLog('Checking if Prisma Studio is accessible...');

      // Use kubectl to check if the ingress is properly configured
      const ingressResult = await window.api.executeCommand('kubectl', [
        'get',
        'ingress',
        'prisma-studio-ingress',
        '-o',
        'jsonpath={.status.loadBalancer.ingress[0].ip}'
      ]);

      if (ingressResult.code !== 0 || !ingressResult.stdout) {
        addStudioLog('Prisma Studio ingress is not yet configured properly.');
        setStudioAccessible(false);
        setIsCheckingStudioAccess(false);
        return;
      }

      // Increment attempt counter
      setAccessCheckAttempts(prev => prev + 1);

      // After 6 attempts (30 seconds), assume it's accessible to prevent getting stuck
      if (accessCheckAttempts >= 6) {
        addStudioLog('Prisma Studio accessibility check timed out. Assuming it is accessible.');
        setStudioAccessible(true);
        setIsCheckingStudioAccess(false);
        return;
      }

      // Try to access the Prisma Studio URL using curl to check for 502 errors
      addStudioLog('Testing Prisma Studio URL accessibility...');
      const curlResult = await window.api.executeCommand('curl', [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `https://prisma-studio.${domain.name}`,
        '--insecure',  // Allow self-signed certificates
        '--max-time',  // Add a timeout to prevent hanging
        '10'
      ]);

      if (curlResult.code === 0) {
        const statusCode = parseInt(curlResult.stdout.trim());
        addStudioLog(`Prisma Studio returned status code: ${statusCode}`);

        if (statusCode >= 200 && statusCode < 400) {
          addStudioLog('Prisma Studio is accessible!');
          setStudioAccessible(true);
        } else if (statusCode === 502) {
          addStudioLog('Prisma Studio is still initializing (502 Bad Gateway). Will check again soon.');
          setStudioAccessible(false);
          // Schedule another check in 5 seconds
          setTimeout(() => checkPrismaStudioAccessibility(), 5000);
        } else {
          addStudioLog(`Prisma Studio returned status code ${statusCode}. Will check again soon.`);
          setStudioAccessible(false);
          // Schedule another check in 5 seconds
          setTimeout(() => checkPrismaStudioAccessibility(), 5000);
        }
      } else {
        // If curl fails, it might be because the service is not ready yet
        addStudioLog(`Failed to check Prisma Studio accessibility: ${curlResult.stderr}`);

        // Check if the pod is actually running and ready
        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          studioPodName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (podStatusResult.code === 0 && podStatusResult.stdout === 'Running') {
          // Pod is running, check if the container is ready
          const containerReadyResult = await window.api.executeCommand('kubectl', [
            'get',
            'pod',
            studioPodName,
            '-o',
            'jsonpath={.status.containerStatuses[0].ready}'
          ]);

          if (containerReadyResult.code === 0 && containerReadyResult.stdout === 'true') {
            // Container is ready, but we still can't access it - might be a network issue
            // After a few attempts, assume it's accessible
            if (accessCheckAttempts >= 3) {
              addStudioLog('Pod is running and container is ready. Assuming Prisma Studio is accessible despite network check failure.');
              setStudioAccessible(true);
            } else {
              setStudioAccessible(false);
              // Schedule another check in 5 seconds
              setTimeout(() => checkPrismaStudioAccessibility(), 5000);
            }
          } else {
            addStudioLog('Container is not ready yet. Waiting...');
            setStudioAccessible(false);
            // Schedule another check in 5 seconds
            setTimeout(() => checkPrismaStudioAccessibility(), 5000);
          }
        } else {
          addStudioLog('Pod is not running. Waiting...');
          setStudioAccessible(false);
          // Schedule another check in 5 seconds
          setTimeout(() => checkPrismaStudioAccessibility(), 5000);
        }
      }
    } catch (error) {
      addLog(`Error checking Prisma Studio accessibility: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
      setStudioAccessible(false);
      // Schedule another check in 5 seconds
      setTimeout(() => checkPrismaStudioAccessibility(), 5000);
    } finally {
      setIsCheckingStudioAccess(false);
    }
  }, [studioRunning, domain.name, addLog, studioPodName, isCheckingStudioAccess, accessCheckAttempts]);

  // Reset accessibility check attempts when studio status changes
  useEffect(() => {
    setAccessCheckAttempts(0);
  }, [studioRunning]);

  // Check Prisma Studio accessibility whenever studioRunning changes
  useEffect(() => {
    if (studioRunning) {
      checkPrismaStudioAccessibility();
    } else {
      setStudioAccessible(false);
      setAccessCheckAttempts(0);
    }
  }, [studioRunning, checkPrismaStudioAccessibility]);

  // Function to launch Prisma Studio
  const launchPrismaStudio = async () => {
    setIsLaunchingStudio(true);

    try {
      // Add log entry
      const addStudioLog = (message) => {
        addLog(`Prisma Studio: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addStudioLog('Launching Prisma Studio...');

      // Create a temporary pod to run Prisma Studio
      const studioName = `prisma-studio-${Date.now()}`;
      setStudioPodName(studioName);

      // Create a ConfigMap with the Prisma schema and script
      const schemaConfigMapName = `prisma-schema-studio-${Date.now()}`;
      const schemaConfigMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${schemaConfigMapName}
data:
  schema.prisma: |
    generator client {
      provider = "prisma-client-js"
    }
    
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
    }
    
    // Schema definition (same as in migration)
    model User {
      id                   String                @id @default(cuid())
      name                 String?
      email                String                @unique
      emailVerified        DateTime?
      image                String?
      role                 UserRole              @default(STUDENT)
      createdAt            DateTime              @default(now())
      updatedAt            DateTime              @updatedAt
      accounts             Account[]
      activityLogs         ActivityLog[]
      challengeCompletions ChallengeCompletion[]
      challengeInstances   ChallengeInstance[]
      groupPoints          GroupPoints[]
      questionAttempts     QuestionAttempt[]
      questionCompletions  QuestionCompletion[]
      sessions             Session[]
      instructorGroups     CompetitionGroup[]    @relation("GroupInstructors")
      memberOf             CompetitionGroup[]    @relation("GroupMembers")
    }
    
    model CompetitionGroup {
      id           String                  @id @default(cuid())
      name         String
      description  String?
      startDate    DateTime
      endDate      DateTime?
      createdAt    DateTime                @default(now())
      updatedAt    DateTime                @updatedAt
      activityLogs ActivityLog[]
      instances    ChallengeInstance[]
      accessCodes  CompetitionAccessCode[]
      challenges   GroupChallenge[]
      userPoints   GroupPoints[]
      instructors  User[]                  @relation("GroupInstructors")
      members      User[]                  @relation("GroupMembers")
    }
    
    model GroupChallenge {
      id                  String                @id @default(cuid())
      points              Int
      challengeId         String
      groupId             String
      createdAt           DateTime              @default(now())
      updatedAt           DateTime              @updatedAt
      completions         ChallengeCompletion[]
      challenge           Challenges            @relation(fields: [challengeId], references: [id])
      group               CompetitionGroup      @relation(fields: [groupId], references: [id], onDelete: Cascade)
      questionAttempts    QuestionAttempt[]
      questionCompletions QuestionCompletion[]
    
      @@unique([challengeId, groupId])
    }
    
    model ChallengeCompletion {
      id               String         @id @default(cuid())
      userId           String
      groupChallengeId String
      pointsEarned     Int
      completedAt      DateTime       @default(now())
      groupChallenge   GroupChallenge @relation(fields: [groupChallengeId], references: [id], onDelete: Cascade)
      user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
    
      @@unique([userId, groupChallengeId])
    }
    
    model CompetitionAccessCode {
      id           String           @id @default(cuid())
      code         String           @unique
      expiresAt    DateTime?
      maxUses      Int?
      usedCount    Int              @default(0)
      groupId      String
      createdAt    DateTime         @default(now())
      createdBy    String
      activityLogs ActivityLog[]
      group        CompetitionGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
    }
    
    model ActivityLog {
      id                  String                 @id @default(cuid())
      eventType           ActivityEventType
      userId              String
      challengeId         String?
      groupId             String?
      metadata            Json
      timestamp           DateTime               @default(now())
      accessCodeId        String?
      challengeInstanceId String?
      severity            LogSeverity            @default(INFO)
      accessCode          CompetitionAccessCode? @relation(fields: [accessCodeId], references: [id])
      challenge           Challenges?            @relation(fields: [challengeId], references: [id])
      challengeInstance   ChallengeInstance?     @relation(fields: [challengeInstanceId], references: [id])
      group               CompetitionGroup?      @relation(fields: [groupId], references: [id])
      user                User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
    }
    
    model ChallengeType {
      id         String       @id @default(cuid())
      name       String
      challenges Challenges[]
    }
    
    model ChallengeQuestion {
      id          String               @id @default(cuid())
      challengeId String
      content     String
      type        String
      points      Int
      answer      String
      order       Int
      createdAt   DateTime             @default(now())
      updatedAt   DateTime             @updatedAt
      challenge   Challenges           @relation(fields: [challengeId], references: [id], onDelete: Cascade)
      attempts    QuestionAttempt[]
      completions QuestionCompletion[]
    }
    
    model QuestionCompletion {
      id               String            @id @default(cuid())
      questionId       String
      userId           String
      groupChallengeId String
      completedAt      DateTime          @default(now())
      pointsEarned     Int
      groupChallenge   GroupChallenge    @relation(fields: [groupChallengeId], references: [id], onDelete: Cascade)
      question         ChallengeQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
      user             User              @relation(fields: [userId], references: [id], onDelete: Cascade)
    
      @@unique([userId, questionId, groupChallengeId])
    }
    
    model ChallengeAppConfig {
      id                String     @id @default(cuid())
      challengeId       String
      appId             String
      title             String
      icon              String
      width             Int
      height            Int
      screen            String
      disabled          Boolean    @default(false)
      favourite         Boolean    @default(false)
      desktop_shortcut  Boolean    @default(false)
      launch_on_startup Boolean    @default(false)
      additional_config Json?      @default("{}")
      createdAt         DateTime   @default(now())
      updatedAt         DateTime   @updatedAt
      challenge         Challenges @relation(fields: [challengeId], references: [id], onDelete: Cascade)
    
      @@unique([challengeId, appId])
    }
    
    model Challenges {
      id              String               @id @default(cuid())
      name            String
      challengeImage  String
      difficulty      ChallengeDifficulty  @default(MEDIUM)
      challengeTypeId String
      description     String?
      activityLogs    ActivityLog[]
      appConfigs      ChallengeAppConfig[]
      questions       ChallengeQuestion[]
      challengeType   ChallengeType        @relation(fields: [challengeTypeId], references: [id], onDelete: Cascade)
      groupChallenges GroupChallenge[]
    }
    
    model ChallengeInstance {
      id             String           @id @default(uuid())
      challengeId    String
      userId         String
      challengeImage String
      challengeUrl   String
      creationTime   DateTime         @default(now())
      status         String
      flagSecretName String
      flag           String
      competitionId  String
      activityLogs   ActivityLog[]
      competition    CompetitionGroup @relation(fields: [competitionId], references: [id], onDelete: Cascade)
      user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
    }
    
    model Account {
      id                String  @id @default(cuid())
      userId            String
      type              String
      provider          String
      providerAccountId String
      refresh_token     String?
      access_token      String?
      expires_at        Int?
      token_type        String?
      scope             String?
      id_token          String?
      session_state     String?
      user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
    
      @@unique([provider, providerAccountId])
    }
    
    model Session {
      id           String   @id @default(cuid())
      sessionToken String   @unique
      userId       String
      expires      DateTime
      user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    }
    
    model VerificationToken {
      identifier String
      token      String   @unique
      expires    DateTime
    
      @@unique([identifier, token])
    }
    
    model GroupPoints {
      id        String           @id @default(cuid())
      points    Int              @default(0)
      userId    String
      groupId   String
      createdAt DateTime         @default(now())
      updatedAt DateTime         @updatedAt
      group     CompetitionGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
      user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
    
      @@unique([userId, groupId])
    }
    
    model QuestionAttempt {
      id               String            @id @default(cuid())
      questionId       String
      userId           String
      groupChallengeId String
      attemptedAt      DateTime          @default(now())
      answer           String
      isCorrect        Boolean
      groupChallenge   GroupChallenge    @relation(fields: [groupChallengeId], references: [id], onDelete: Cascade)
      question         ChallengeQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
      user             User              @relation(fields: [userId], references: [id], onDelete: Cascade)
    }
    
    enum UserRole {
      STUDENT
      INSTRUCTOR
      ADMIN
    }
    
    enum ActivityEventType {
      CHALLENGE_STARTED
      CHALLENGE_COMPLETED
      GROUP_JOINED
      GROUP_CREATED
      ACCESS_CODE_GENERATED
      USER_REGISTERED
      USER_LOGGED_IN
      USER_ROLE_CHANGED
      USER_UPDATED
      CHALLENGE_INSTANCE_CREATED
      CHALLENGE_INSTANCE_DELETED
      QUESTION_ATTEMPTED
      QUESTION_COMPLETED
      GROUP_UPDATED
      GROUP_LEFT
      GROUP_DELETED
      ACCESS_CODE_USED
      ACCESS_CODE_EXPIRED
      ACCESS_CODE_DELETED
      SYSTEM_ERROR
      CHALLENGE_PACK_INSTALLED
      ACCESS_CODE_INVALID
    }
    
    enum LogSeverity {
      INFO
      WARNING
      ERROR
      CRITICAL
    }
    
    enum ChallengeDifficulty {
      EASY
      MEDIUM
      HARD
      EXPERT
    }
`;

      // Apply the ConfigMap
      addStudioLog('Creating ConfigMap with Prisma schema...');
      const configMapResult = await window.api.applyManifestFromString(schemaConfigMapYaml);

      if (configMapResult.code !== 0) {
        throw new Error(`Failed to create schema ConfigMap: ${configMapResult.stderr}`);
      }

      // Create the Prisma Studio pod and service
      const studioPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${studioName}
  labels:
    app: prisma-studio
  annotations:
    auto-delete: "true"
    auto-delete-after: "${Date.now() + 3600000}" # 1 hour from now
spec:
  containers:
  - name: studio
    image: node:20-alpine
    command: ["/bin/sh", "-c"]
    args:
    - |
      cd /tmp
      echo "=== Installing required packages ==="
      apk add --no-cache openssl
      npm init -y
      npm install prisma@latest
      
      echo "=== Setting up Prisma schema ==="
      mkdir -p prisma
      cp /config/schema.prisma prisma/schema.prisma
      
      echo "=== Starting Prisma Studio ==="
      npx prisma studio --port 5555 --hostname 0.0.0.0
    env:
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: database-url
    ports:
    - containerPort: 5555
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"
      requests:
        cpu: "100m"
        memory: "256Mi"
    volumeMounts:
    - name: config-volume
      mountPath: /config
    - name: tmp-volume
      mountPath: /tmp
  volumes:
  - name: config-volume
    configMap:
      name: ${schemaConfigMapName}
  - name: tmp-volume
    emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: prisma-studio
spec:
  selector:
    app: prisma-studio
  ports:
  - port: 80
    targetPort: 5555
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: prisma-studio-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  tls:
  - hosts:
    - prisma-studio.${domain.name}
    secretName: wildcard-domain-certificate-prod
  rules:
  - host: prisma-studio.${domain.name}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prisma-studio
            port:
              number: 80
`;

      // Apply the Prisma Studio pod and service
      addStudioLog('Creating Prisma Studio pod and service...');
      const studioPodResult = await window.api.applyManifestFromString(studioPodYaml);

      if (studioPodResult.code !== 0) {
        throw new Error(`Failed to create Prisma Studio pod: ${studioPodResult.stderr}`);
      }

      // Wait for the pod to be ready
      addStudioLog('Waiting for Prisma Studio to be ready...');

      // Poll the pod status until it's Running
      let podStatus = '';
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes with 10-second intervals

      while (attempts < maxAttempts) {
        attempts++;

        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          studioName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (podStatusResult.code !== 0) {
          addStudioLog(`Error checking pod status: ${podStatusResult.stderr}`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          continue;
        }

        podStatus = podStatusResult.stdout;
        addStudioLog(`Prisma Studio pod status: ${podStatus}`);

        if (podStatus === 'Running') {
          break;
        } else if (podStatus === 'Failed') {
          throw new Error('Prisma Studio pod failed');
        }

        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      }

      if (podStatus !== 'Running') {
        throw new Error(`Prisma Studio timed out after ${maxAttempts * 10} seconds`);
      }

      // Set up auto-deletion after 1 hour
      addStudioLog('Setting up auto-deletion after 1 hour...');
      setTimeout(() => {
        if (studioRunning) {
          addLog('Auto-deleting Prisma Studio after 1 hour for security...');
          deletePrismaStudio();
        }
      }, 3600000); // 1 hour

      // Open the URL in the default browser only if it's accessible
      addStudioLog('Prisma Studio is ready!');
      addStudioLog(`Opening Prisma Studio at https://prisma-studio.${domain.name}`);

      // Start checking accessibility
      setStudioRunning(true);
      checkPrismaStudioAccessibility();

      // Don't automatically open the URL - wait for it to be accessible first
      addStudioLog('Waiting for Prisma Studio to be fully accessible before opening...');

      addStudioLog('Prisma Studio launched successfully.');

      // Refresh the status
      await checkPrismaStudioStatus();
    } catch (error) {
      addLog(`Error launching Prisma Studio: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
      setStudioRunning(false);
    } finally {
      setIsLaunchingStudio(false);
    }
  };

  // Function to check Kubernetes Dashboard accessibility
  const checkKubernetesDashboardAccessibility = async (forceCheck = false) => {
    if (isCheckingKubeDashboardAccess && !forceCheck) return;

    setIsCheckingKubeDashboardAccess(true);

    try {
      // Check if the ingress is accessible
      const ingressResult = await window.api.executeCommand('kubectl', [
        'get',
        'ingress',
        'kubernetes-dashboard',
        '-n',
        'kubernetes-dashboard',
        '--ignore-not-found'
      ]);

      if (ingressResult.code === 0 && ingressResult.stdout && ingressResult.stdout.includes('kubernetes-dashboard')) {
        setKubeDashboardAccessible(true);
        addLog('Kubernetes Dashboard: Ingress is accessible.');
        setLogs(prev => [...prev, 'Kubernetes Dashboard: Ingress is accessible.']);
      } else {
        setKubeDashboardAccessCheckAttempts(prev => prev + 1);

        if (kubeDashboardAccessCheckAttempts >= 5) {
          addLog('Kubernetes Dashboard: Failed to verify ingress accessibility after multiple attempts.');
          setLogs(prev => [...prev, 'Failed to verify ingress accessibility after multiple attempts.']);
        } else {
          addLog(`Kubernetes Dashboard: Ingress not yet accessible. Attempt ${kubeDashboardAccessCheckAttempts + 1}/5`);
          setLogs(prev => [...prev, `Ingress not yet accessible. Attempt ${kubeDashboardAccessCheckAttempts + 1}/5`]);

          // Try again in 5 seconds
          setTimeout(() => {
            checkKubernetesDashboardAccessibility();
          }, 5000);
        }
      }
    } catch (error) {
      console.error('Error checking Kubernetes Dashboard accessibility:', error);
      addLog(`Kubernetes Dashboard: Error checking accessibility: ${error.message}`);
      setLogs(prev => [...prev, `Error checking accessibility: ${error.message}`]);
    } finally {
      setIsCheckingKubeDashboardAccess(false);
    }
  };

  // Function to delete Kubernetes Dashboard
  const deleteKubernetesDashboard = async () => {
    setIsDeletingKubeDashboard(true);

    try {
      const addDashboardLog = (message) => {
        addLog(`Kubernetes Dashboard: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addDashboardLog('Deleting Kubernetes Dashboard...');

      // Delete the namespace which will delete all resources
      const deleteResult = await window.api.executeCommand('kubectl', [
        'delete',
        'namespace',
        'kubernetes-dashboard',
        '--ignore-not-found'
      ]);

      if (deleteResult.code !== 0) {
        throw new Error(`Failed to delete Kubernetes Dashboard namespace: ${deleteResult.stderr}`);
      }

      addDashboardLog('Kubernetes Dashboard deleted successfully.');
      setKubeDashboardRunning(false);
      setKubeDashboardAccessible(false);

    } catch (error) {
      console.error('Error deleting Kubernetes Dashboard:', error);
      addLog(`Kubernetes Dashboard: Error deleting: ${error.message}`);
      setLogs(prev => [...prev, `Error deleting: ${error.message}`]);
    } finally {
      setIsDeletingKubeDashboard(false);
    }
  };

  // Function to launch Kubernetes Dashboard
  const launchKubernetesDashboard = async () => {
    setIsLaunchingKubeDashboard(true);

    try {
      const addDashboardLog = (message) => {
        addLog(`Kubernetes Dashboard: ${message}`);
        setLogs(prev => [...prev, message]);
      };

      addDashboardLog('Launching Kubernetes Dashboard...');

      // Create the kubernetes-dashboard namespace
      addDashboardLog('Creating kubernetes-dashboard namespace...');
      const namespaceResult = await window.api.executeCommand('kubectl', [
        'create',
        'namespace',
        'kubernetes-dashboard',
        '--dry-run=client',
        '-o',
        'yaml'
      ]);

      if (namespaceResult.code !== 0) {
        throw new Error(`Failed to create namespace YAML: ${namespaceResult.stderr}`);
      }

      const applyNamespaceResult = await window.api.applyManifestFromString(namespaceResult.stdout);

      if (applyNamespaceResult.code !== 0) {
        throw new Error(`Failed to apply namespace: ${applyNamespaceResult.stderr}`);
      }

      // Add Kubernetes Dashboard Helm repository
      addDashboardLog('Adding Kubernetes Dashboard Helm repository...');

      const addRepoResult = await window.api.executeCommand('helm', [
        'repo',
        'add',
        'kubernetes-dashboard',
        'https://kubernetes.github.io/dashboard/'
      ]);

      if (addRepoResult.code !== 0 && !addRepoResult.stderr.includes('already exists')) {
        throw new Error(`Failed to add Kubernetes Dashboard Helm repository: ${addRepoResult.stderr}`);
      }

      // Update Helm repositories
      addDashboardLog('Updating Helm repositories...');

      const updateRepoResult = await window.api.executeCommand('helm', [
        'repo',
        'update'
      ]);

      if (updateRepoResult.code !== 0) {
        throw new Error(`Failed to update Helm repositories: ${updateRepoResult.stderr}`);
      }

      // Install Kubernetes Dashboard using Helm
      addDashboardLog('Installing Kubernetes Dashboard...');

      const installResult = await window.api.executeCommand('helm', [
        'install',
        'kubernetes-dashboard',
        'kubernetes-dashboard/kubernetes-dashboard',
        '--namespace',
        'kubernetes-dashboard',
        '--set',
        'metricsScraper.enabled=true',
        '--set',
        'service.externalPort=443',
        '--set',
        'protocolHttp=true',
        '--set',
        'serviceAccount.create=true',
        '--set',
        'serviceAccount.name=kubernetes-dashboard',
        '--set',
        'rbac.clusterReadOnlyRole=true'
      ]);

      if (installResult.code !== 0) {
        throw new Error(`Failed to install Kubernetes Dashboard: ${installResult.stderr}`);
      }

      addDashboardLog('Kubernetes Dashboard installed successfully.');

      // Wait for the dashboard to be ready
      addDashboardLog('Waiting for Kubernetes Dashboard to be ready...');

      // Wait for 30 seconds to allow the dashboard to start
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Create a service account with admin privileges
      const serviceAccountYaml = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
`;

      addDashboardLog('Creating admin service account...');
      const serviceAccountResult = await window.api.applyManifestFromString(serviceAccountYaml);

      if (serviceAccountResult.code !== 0) {
        throw new Error(`Failed to create admin service account: ${serviceAccountResult.stderr}`);
      }

      // Create an ingress for the dashboard
      const ingressYaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kubernetes-dashboard
  namespace: kubernetes-dashboard
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/backend-protocol: "HTTP"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  rules:
  - host: kubernetes-dashboard.${domain.name}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kubernetes-dashboard
            port:
              number: 443
  tls:
  - hosts:
    - kubernetes-dashboard.${domain.name}
    secretName: wildcard-domain-certificate-prod
`;

      addDashboardLog('Creating ingress for Kubernetes Dashboard...');
      const ingressResult = await window.api.applyManifestFromString(ingressYaml);

      if (ingressResult.code !== 0) {
        throw new Error(`Failed to create ingress: ${ingressResult.stderr}`);
      }

      addDashboardLog('Kubernetes Dashboard ingress created successfully.');

      // Generate a token for the admin user
      addDashboardLog('Generating admin token...');
      const tokenResult = await window.api.executeCommand('kubectl', [
        'create',
        'token',
        'admin-user',
        '-n',
        'kubernetes-dashboard'
      ]);

      if (tokenResult.code !== 0) {
        throw new Error(`Failed to generate admin token: ${tokenResult.stderr}`);
      }

      const token = tokenResult.stdout.trim();
      addDashboardLog(`Admin token generated successfully. Token: ${token}`);
      addDashboardLog('IMPORTANT: Save this token to log in to the Kubernetes Dashboard.');

      setKubeDashboardRunning(true);

      // Check if the dashboard is accessible
      addDashboardLog('Checking if Kubernetes Dashboard is accessible...');
      checkKubernetesDashboardAccessibility();

    } catch (error) {
      console.error('Error launching Kubernetes Dashboard:', error);
      addLog(`Kubernetes Dashboard: Error launching: ${error.message}`);
      setLogs(prev => [...prev, `Error launching: ${error.message}`]);
    } finally {
      setIsLaunchingKubeDashboard(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verification</h1>
        <p className="mt-2 text-gray-600">
          Verify that all components are installed and running correctly.
        </p>
      </div>

      <Card title="Component Status">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">NGINX Ingress Controller</span>
              <StatusBadge status={verificationStatus.ingressController} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">cert-manager</span>
              <StatusBadge status={verificationStatus.certManager} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <div className="flex items-center space-x-2">
                <span className="font-medium">Database</span>
              </div>
              <StatusBadge status={verificationStatus.database} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">Database Controller</span>
              <StatusBadge status={verificationStatus.databaseController} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">Instance Manager</span>
              <StatusBadge status={verificationStatus.instanceManager} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">Monitoring Service</span>
              <StatusBadge status={verificationStatus.monitoringService} />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="font-medium">Dashboard</span>
              <StatusBadge status={verificationStatus.dashboard} />
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              onClick={verifyInstallation}
              isLoading={isVerifying}
              disabled={isVerifying}
              variant="outline"
            >
              Verify Again
            </Button>
          </div>
        </div>
      </Card>

      {logs.length > 0 && (
        <Card title="Verification Logs">
          <div className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-auto max-h-64 font-mono text-sm">
            {logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Access URLs">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            You can access the EDURange Cloud components using the following URLs:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <h3 className="font-medium text-gray-900">Dashboard</h3>
              <a
                href={`https://${domain.dashboardSubdomain}.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.dashboardSubdomain}.{domain.name}
              </a>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <h3 className="font-medium text-gray-900">Instance Manager API</h3>
              <a
                href={`https://${domain.instanceManagerSubdomain}.${domain.name}/api`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.instanceManagerSubdomain}.{domain.name}/api
              </a>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <h3 className="font-medium text-gray-900">Database API</h3>
              <p className="text-gray-600">
                <span className="text-amber-600 font-medium">Internal access only</span> - 
                For security reasons, the Database API is only accessible from within the Kubernetes cluster 
                at <code className="bg-gray-100 px-1 py-0.5 rounded">http://database-api-service.default.svc.cluster.local</code>
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <h3 className="font-medium text-gray-900">Monitoring Service</h3>
              <a
                href={`https://${domain.instanceManagerSubdomain}.${domain.name}/metrics`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.instanceManagerSubdomain}.{domain.name}/metrics
              </a>
            </div>

            {kubeDashboardRunning && kubeDashboardAccessible && (
              <div className="p-3 bg-gray-50 rounded-md">
                <h3 className="font-medium text-gray-900">Kubernetes Dashboard</h3>
                <a
                  href={`https://kubernetes-dashboard.${domain.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-500"
                >
                  https://kubernetes-dashboard.{domain.name}
                </a>
                <p className="text-xs text-gray-500 mt-1">
                  Note: You will need to use the token displayed in the logs to log in.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* New Prisma Studio Card */}
      <Card title="Database Management">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            You can use Prisma Studio to view and manage your database directly.
          </p>

          <div className="p-4 bg-gray-50 rounded-md">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Prisma Studio</h3>
                <StatusBadge status={studioRunning ? (studioAccessible ? 'success' : 'running') : 'pending'} />
              </div>

              <p className="text-sm text-gray-600">
                {studioRunning
                  ? (studioAccessible
                    ? 'Prisma Studio is running and accessible. You can access it using the link below.'
                    : 'Prisma Studio is running but still initializing. Please wait a moment...')
                  : 'Launch Prisma Studio to view and manage your database.'}
              </p>

              {studioRunning && studioAccessible && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700">Access URL:</p>
                  <a
                    href={`https://prisma-studio.${domain.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-500"
                  >
                    https://prisma-studio.{domain.name}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    Note: Prisma Studio will automatically be deleted after 1 hour for security reasons.
                  </p>
                </div>
              )}

              {studioRunning && !studioAccessible && (
                <div className="flex flex-col space-y-2 mt-2">
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-gray-600">Waiting for Prisma Studio to be fully accessible...</span>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAccessCheckAttempts(0);
                        checkPrismaStudioAccessibility(true);
                      }}
                      disabled={isCheckingStudioAccess}
                    >
                      Check Again
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      onClick={() => {
                        setStudioAccessible(true);
                        addLog('Prisma Studio: Manually marked as accessible.');
                        setLogs(prev => [...prev, 'Manually marked as accessible.']);
                      }}
                    >
                      Force Access
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                {!studioRunning ? (
                  <Button
                    onClick={launchPrismaStudio}
                    isLoading={isLaunchingStudio}
                    disabled={isLaunchingStudio || verificationStatus.database !== 'success'}
                  >
                    Launch Prisma Studio
                  </Button>
                ) : (
                  <>
                    {studioAccessible && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(`https://prisma-studio.${domain.name}`, '_blank')}
                      >
                        Open Prisma Studio
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={deletePrismaStudio}
                      isLoading={isDeletingStudio}
                      disabled={isDeletingStudio}
                    >
                      Delete Prisma Studio
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Kubernetes Dashboard">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Deploy the Kubernetes Dashboard to monitor and manage your Kubernetes cluster. This provides a web-based UI for managing your cluster resources.
          </p>

          <div className="bg-gray-50 p-4 rounded-md">
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-gray-900">Kubernetes Dashboard Status</h3>
                <StatusBadge status={kubeDashboardRunning ? 'success' : 'pending'} />
              </div>

              {kubeDashboardRunning && kubeDashboardAccessible && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <h4 className="font-medium text-green-800">Kubernetes Dashboard is running</h4>
                  <p className="text-sm text-green-700 mt-1">
                    You can access the Kubernetes Dashboard at:
                  </p>
                  <a
                    href={`https://kubernetes-dashboard.${domain.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-500"
                  >
                    https://kubernetes-dashboard.{domain.name}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    Note: You will need to use the token displayed in the logs to log in.
                  </p>
                </div>
              )}

              {kubeDashboardRunning && !kubeDashboardAccessible && (
                <div className="flex flex-col space-y-2 mt-2">
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-gray-600">Waiting for Kubernetes Dashboard to be fully accessible...</span>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setKubeDashboardAccessCheckAttempts(0);
                        checkKubernetesDashboardAccessibility(true);
                      }}
                      disabled={isCheckingKubeDashboardAccess}
                    >
                      Check Again
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      onClick={() => {
                        setKubeDashboardAccessible(true);
                        addLog('Kubernetes Dashboard: Manually marked as accessible.');
                        setLogs(prev => [...prev, 'Manually marked as accessible.']);
                      }}
                    >
                      Force Access
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                {!kubeDashboardRunning ? (
                  <Button
                    onClick={launchKubernetesDashboard}
                    isLoading={isLaunchingKubeDashboard}
                    disabled={isLaunchingKubeDashboard}
                  >
                    Launch Kubernetes Dashboard
                  </Button>
                ) : (
                  <>
                    {kubeDashboardAccessible && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(`https://kubernetes-dashboard.${domain.name}`, '_blank')}
                      >
                        Open Kubernetes Dashboard
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={deleteKubernetesDashboard}
                      isLoading={isDeletingKubeDashboard}
                      disabled={isDeletingKubeDashboard}
                    >
                      Delete Kubernetes Dashboard
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button to="/dashboard-setup" variant="outline">
          Back
        </Button>

        <Button
          to="/completion"
          disabled={!allComponentsVerified}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default Verification;
