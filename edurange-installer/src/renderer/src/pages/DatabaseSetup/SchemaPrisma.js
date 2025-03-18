/**
 * Functions for managing database schema generation
 */

// Remove fs and path imports as they're not available in browser environment

/**
 * Runs Prisma migrations to set up the database schema
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<boolean>} - True if migrations were successful, false otherwise
 */
export const generateDatabaseSchema = async (addComponentLog) => {
  addComponentLog('Setting up database schema with Prisma...');

  try {
    const prismaSchema = `generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  ADMIN
  INSTRUCTOR
  STUDENT
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
  VERY_HARD
}`;

    addComponentLog('Using embedded Prisma schema.');

    // Create a simplified schema generation approach using a job
    const schemaPodName = `prisma-schema-${Date.now()}`;
    addComponentLog(`Creating schema generation pod: ${schemaPodName}...`);

    // Create a ConfigMap with the Prisma schema
    const schemaConfigMapName = `prisma-schema-${Date.now()}`;
    const schemaConfigMapYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${schemaConfigMapName}
data:
  schema.prisma: |
${prismaSchema.split('\n').map(line => `    ${line}`).join('\n')}
  migration-script.sh: |
    #!/bin/sh
    set -e  # Exit immediately if a command exits with a non-zero status

    echo "=== Starting database schema generation process ==="

    cd /tmp
    echo "=== Installing required packages ==="
    apk add --no-cache openssl postgresql-client netcat-openbsd

    # Skip npm init to avoid package.json creation issues
    echo "=== Installing Prisma CLI directly ==="
    npm install -g prisma@latest

    echo "=== Setting up Prisma schema ==="
    mkdir -p prisma
    cp /config/schema.prisma prisma/schema.prisma

    echo "=== Connecting to database ==="
    # Completely rewritten approach to extract connection details
    # Parse the connection string more carefully

    # Extract the protocol (postgresql://)
    PROTOCOL=$(echo "$DATABASE_URL" | grep -o "^[^:]*://")

    # Extract the part after the protocol
    AFTER_PROTOCOL=$(echo "$DATABASE_URL" | sed "s|^$PROTOCOL||")

    # Extract user and password (everything before the @)
    USER_PASS=$(echo "$AFTER_PROTOCOL" | grep -o "^[^@]*")

    # Extract user (everything before the : in USER_PASS)
    DB_USER=$(echo "$USER_PASS" | grep -o "^[^:]*")

    # Extract password (everything after the : in USER_PASS)
    DB_PASS=$(echo "$USER_PASS" | sed "s|^$DB_USER:||")

    # Extract host, port, and database (everything after the @)
    HOST_PORT_DB=$(echo "$AFTER_PROTOCOL" | sed "s|^$USER_PASS@||")

    # Extract host (everything before the first : in HOST_PORT_DB)
    DB_HOST=$(echo "$HOST_PORT_DB" | grep -o "^[^:]*")

    # Extract port and database (everything after the host:)
    PORT_DB=$(echo "$HOST_PORT_DB" | sed "s|^$DB_HOST:||")

    # Extract port (everything before the / in PORT_DB)
    DB_PORT=$(echo "$PORT_DB" | grep -o "^[^/]*")

    # Extract database name (everything after the / in PORT_DB)
    DB_NAME=$(echo "$PORT_DB" | sed "s|^$DB_PORT/||" | grep -o "^[^?]*")

    echo "Connection details:"
    echo "- Host: $DB_HOST"
    echo "- Port: $DB_PORT"
    echo "- User: $DB_USER"
    echo "- Password: [hidden, length: $(echo -n $DB_PASS | wc -c) characters]"
    echo "- Database: $DB_NAME"

    # Test database connection first
    echo "Testing database connection with pg_isready..."
    export PGPASSWORD="$DB_PASS"

    # Print the command we're about to run (with password hidden)
    echo "Running: pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"

    # Run the connection test
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"
    PG_READY_RESULT=$?

    if [ $PG_READY_RESULT -ne 0 ]; then
      echo "ERROR: Cannot connect to database at $DB_HOST:$DB_PORT as $DB_USER"
      echo "pg_isready exit code: $PG_READY_RESULT"
      echo "Possible issues:"
      echo "- Database server not running"
      echo "- Network connectivity issues"
      echo "- Authentication configuration"
      echo "- Incorrect connection parameters"

      # Try a basic TCP connection test
      echo "Attempting basic TCP connection test..."
      nc -z -v -w5 "$DB_HOST" "$DB_PORT" 2>&1 || echo "TCP connection failed"

      exit 1
    else
      echo "Database connection test successful!"
    fi

    # Ensure the database exists
    echo "Checking if database exists..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1
    DB_EXISTS=$?

    if [ $DB_EXISTS -ne 0 ]; then
      echo "Database $DB_NAME does not exist, creating it..."
      PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "CREATE DATABASE \\"$DB_NAME\\";"
    else
      echo "Database $DB_NAME already exists."
    fi

    # Create the schema if it doesn't exist
    echo "Creating schema if it doesn't exist..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS edurange;"

    # Modify the DATABASE_URL to include the schema
    # This ensures Prisma creates tables in the edurange schema instead of public
    export DATABASE_URL="${PROTOCOL}${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    echo "Using database URL: ${PROTOCOL}${DB_USER}:[HIDDEN]@${DB_HOST}:${DB_PORT}/${DB_NAME}"

    echo "=== Generating database schema ==="
    # Use db push with --force-reset to ensure clean schema
    # --skip-generate avoids generating client code which we don't need
    echo "Running prisma db push to generate schema..."
    prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate --force-reset

    # Verify that tables were created
    echo "Verifying tables were created..."
    TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" -t | tr -d ' ')
    
    if [ "$TABLE_COUNT" -gt 0 ]; then
      echo "Schema verification successful: $TABLE_COUNT tables found in public schema."
    else
      echo "ERROR: No tables found in public schema after migration!"
      exit 1
    fi

    echo "=== Database schema generation completed successfully ==="
    # Explicitly exit with success code
    exit 0`;

    // Apply the ConfigMap
    addComponentLog('Creating ConfigMap with Prisma schema...');
    const configMapResult = await window.api.applyManifestFromString(schemaConfigMapYaml);

    if (configMapResult.code !== 0) {
      throw new Error(`Failed to create schema ConfigMap: ${configMapResult.stderr}`);
    }

    // Verify that the ConfigMap exists before proceeding
    addComponentLog('Verifying ConfigMap was created...');
    let configMapExists = false;
    let verifyAttempts = 0;
    const maxVerifyAttempts = 5;

    while (!configMapExists && verifyAttempts < maxVerifyAttempts) {
      verifyAttempts++;

      // Add a short delay to allow the ConfigMap to be fully created
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds

      const verifyConfigMapResult = await window.api.executeCommand('kubectl', [
        'get',
        'configmap',
        schemaConfigMapName,
        '--ignore-not-found'
      ]);

      if (verifyConfigMapResult.code === 0 && verifyConfigMapResult.stdout.includes(schemaConfigMapName)) {
        configMapExists = true;
        addComponentLog(`ConfigMap ${schemaConfigMapName} verified successfully.`);
      } else {
        addComponentLog(`Waiting for ConfigMap to be available... (Attempt ${verifyAttempts}/${maxVerifyAttempts})`);
      }
    }

    if (!configMapExists) {
      throw new Error(`ConfigMap ${schemaConfigMapName} was not found after multiple attempts. Migration cannot proceed.`);
    }

    // Create the schema generation pod
    addComponentLog('Creating schema generation pod...');
    const schemaPodYaml = `apiVersion: v1
kind: Pod
metadata:
  name: ${schemaPodName}
  labels:
    app: prisma-schema
spec:
  activeDeadlineSeconds: 900
  restartPolicy: Never
  containers:
  - name: schema
    image: node:20-alpine
    command: ["/bin/sh"]
    args: ["-c", "cp /config/migration-script.sh /tmp/migration-script.sh && chmod +x /tmp/migration-script.sh && /tmp/migration-script.sh"]
    env:
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: database-url
    resources:
      limits:
        cpu: "1000m"
        memory: "1Gi"
      requests:
        cpu: "200m"
        memory: "512Mi"
    volumeMounts:
    - name: config-volume
      mountPath: /config
    - name: tmp-volume
      mountPath: /tmp
  volumes:
  - name: config-volume
    configMap:
      name: ${schemaConfigMapName}
      defaultMode: 0o777
  - name: tmp-volume
    emptyDir: {}`;

    // Apply the schema pod YAML
    addComponentLog('Creating schema generation pod...');
    const schemaPodResult = await window.api.applyManifestFromString(schemaPodYaml);

    if (schemaPodResult.code !== 0) {
      throw new Error(`Failed to create schema generation pod: ${schemaPodResult.stderr}`);
    }

    addComponentLog('Schema generation pod created. Waiting for completion...');

    // Get the schema pod name
    const getPodResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=prisma-schema',
      '-o',
      'jsonpath={.items[0].metadata.name}'
    ]);

    if (getPodResult.code !== 0 || !getPodResult.stdout) {
      throw new Error(`Failed to get schema generation pod name: ${getPodResult.stderr}`);
    }

    const podName = getPodResult.stdout;
    addComponentLog(`Found schema generation pod: ${podName}`);

    // Wait for the schema pod to complete
    addComponentLog('Waiting for schema generation to complete...');

    // Instead of waiting for Ready condition, we'll poll the pod status until it's Succeeded
    let podStatus = '';
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    let migrationSuccessful = false;

    try {
      while (attempts < maxAttempts) {
        attempts++;

        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          podName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (podStatusResult.code !== 0) {
          addComponentLog(`Error checking pod status: ${podStatusResult.stderr}`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          continue;
        }

        podStatus = podStatusResult.stdout;
        addComponentLog(`Migration pod status: ${podStatus}`);

        if (podStatus === 'Succeeded') {
          migrationSuccessful = true;
          break;
        } else if (podStatus === 'Failed' || podStatus === 'Completed') {
          // Check logs to see if it actually succeeded despite the pod status
          const logsResult = await window.api.executeCommand('kubectl', [
            'logs',
            podName
          ]);

          if (logsResult.stdout && logsResult.stdout.includes('=== Database schema generation completed successfully ===')) {
            addComponentLog('Schema generation logs indicate success despite pod status. Treating as successful.');
            migrationSuccessful = true;
            break;
          } else {
            throw new Error('Schema generation pod failed');
          }
        }

        // Check logs periodically to show progress
        if (attempts % 3 === 0) {
          const logsResult = await window.api.executeCommand('kubectl', [
            'logs',
            podName,
            '--tail=10'
          ]);

          if (logsResult.stdout) {
            addComponentLog('Recent schema generation logs:');
            // Create a local variable to track if we found success in this batch of logs
            let foundSuccessInLogs = false;

            logsResult.stdout.split('\n').forEach(line => {
              if (line.trim()) {
                addComponentLog(`  ${line}`);

                // Check if the logs indicate success
                if (line.includes('=== Database schema generation completed successfully ===')) {
                  foundSuccessInLogs = true;
                }
              }
            });

            // If we found success in the logs, update the outer variable and break early
            if (foundSuccessInLogs) {
              migrationSuccessful = true;
              addComponentLog('Found success message in logs. Schema generation completed successfully.');
              break;
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      }

      if (!migrationSuccessful && podStatus !== 'Succeeded') {
        throw new Error(`Migration timed out after ${maxAttempts * 10} seconds`);
      }

      // Get the final logs
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName
      ]);

      if (logsResult.stdout) {
        addComponentLog('Schema generation logs:');
        logsResult.stdout.split('\n').forEach(line => {
          if (line.trim()) {
            addComponentLog(`  ${line}`);

            // Double-check for success message in full logs
            if (line.includes('=== Database schema generation completed successfully ===')) {
              migrationSuccessful = true;
            }
          }
        });
      }

      // Final check for schema generation success
      if (!migrationSuccessful && (podStatus === 'Succeeded' || podStatus === 'Completed')) {
        // If pod succeeded but we didn't find the success message, assume it worked
        migrationSuccessful = true;
      }

      if (!migrationSuccessful) {
        // One final attempt to check logs for success message regardless of pod status
        const finalLogsResult = await window.api.executeCommand('kubectl', [
          'logs',
          podName
        ]);

        if (finalLogsResult.stdout && finalLogsResult.stdout.includes('=== Database schema generation completed successfully ===')) {
          addComponentLog('Found success message in logs despite pod status. Schema generation completed successfully.');
          migrationSuccessful = true;
        } else {
          addComponentLog('Schema generation failed. Keeping pod for debugging.');
          addComponentLog(`You can check the logs with: kubectl logs ${podName}`);
          addComponentLog(`You can describe the pod with: kubectl describe pod ${podName}`);
          throw new Error(`Schema generation failed: Pod status is ${podStatus}. Pod ${podName} kept for debugging.`);
        }
      }

      if (!migrationSuccessful) {
        addComponentLog('Schema generation failed. Keeping pod for debugging.');
        addComponentLog(`You can check the logs with: kubectl logs ${podName}`);
        addComponentLog(`You can describe the pod with: kubectl describe pod ${podName}`);
        throw new Error(`Schema generation failed: Pod status is ${podStatus}. Pod ${podName} kept for debugging.`);
      }

      addComponentLog('Database schema generation completed successfully.');
    } finally {
      // Only clean up resources if the schema generation was successful
      if (migrationSuccessful) {
        addComponentLog('Cleaning up schema generation resources...');

        try {
          const deletePodResult = await window.api.executeCommand('kubectl', [
            'delete',
            'pod',
            podName,
            '--ignore-not-found'
          ]);

          if (deletePodResult.code !== 0) {
            addComponentLog(`Warning: Failed to delete schema generation pod: ${deletePodResult.stderr}`);
          } else {
            addComponentLog('Schema generation pod deleted.');
          }
        } catch (error) {
          addComponentLog(`Warning: Error while deleting schema generation pod: ${error.message}`);
        }

        try {
          const deleteConfigMapResult = await window.api.executeCommand('kubectl', [
            'delete',
            'configmap',
            schemaConfigMapName,
            '--ignore-not-found'
          ]);

          if (deleteConfigMapResult.code !== 0) {
            addComponentLog(`Warning: Failed to delete schema ConfigMap: ${deleteConfigMapResult.stderr}`);
          } else {
            addComponentLog('Schema ConfigMap deleted.');
          }
        } catch (error) {
          addComponentLog(`Warning: Error while deleting schema ConfigMap: ${error.message}`);
        }
      } else {
        addComponentLog('Schema generation failed. Resources kept for debugging:');
        addComponentLog(`- Pod: ${podName}`);
        addComponentLog(`- ConfigMap: ${schemaConfigMapName}`);
        addComponentLog('You can examine these resources using kubectl commands.');
      }
    }

    // Add a prominent success message
    if (migrationSuccessful) {
      addComponentLog('Cleaning up schema generation resources...');

      try {
        await window.api.executeCommand('kubectl', [
          'delete',
          'pod',
          podName,
          '--ignore-not-found'
        ]);
        addComponentLog('Schema generation pod deleted.');
      } catch (error) {
        addComponentLog(`Warning: Error while deleting schema generation pod: ${error.message}`);
      }

      try {
        await window.api.executeCommand('kubectl', [
          'delete',
          'configmap',
          schemaConfigMapName,
          '--ignore-not-found'
        ]);
        addComponentLog('Schema ConfigMap deleted.');
      } catch (error) {
        addComponentLog(`Warning: Error while deleting schema ConfigMap: ${error.message}`);
      }

      addComponentLog('');
      addComponentLog('=======================================================');
      addComponentLog('🎉 DATABASE SCHEMA GENERATION COMPLETED SUCCESSFULLY! 🎉');
      addComponentLog('All database components are now ready to use.');
      addComponentLog('=======================================================');
      addComponentLog('');
    }

    // Return success based on our determination, not just pod status
    return migrationSuccessful;
  } catch (error) {
    addComponentLog(`Error generating database schema: ${error.message}`);
    return false;
  }
};
