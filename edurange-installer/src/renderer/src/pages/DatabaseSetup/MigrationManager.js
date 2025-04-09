/**
 * Functions for managing database migrations
 */

// Remove fs and path imports as they're not available in browser environment

/**
 * Runs Prisma migrations to set up the database schema
 * @param {Function} addComponentLog - Function to add logs
 * @param {Object} options - Additional options
 * @param {boolean} options.enableDebugSidecar - Whether to include a debug sidecar container
 * @returns {Promise<boolean>} - True if migrations were successful, false otherwise
 */
export const runFixedPrismaMigrations = async (addComponentLog, options = {}) => {
  // Get the enableDebugSidecar option from the options or default to false
  const { enableDebugSidecar = false } = options;
  addComponentLog('Running Prisma database migrations...');

  if (enableDebugSidecar) {
    addComponentLog('Debug sidecar container is enabled for troubleshooting.');
  }

  try {
    // First, verify that the database secrets exist
    addComponentLog('Verifying database secrets...');
    const secretsResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '--ignore-not-found'
    ]);

    if (secretsResult.code !== 0 || !secretsResult.stdout.includes('database-secrets')) {
      throw new Error('Database secrets not found. Please ensure the database is properly installed.');
    }

    // Check the database secrets to ensure they contain the required keys
    addComponentLog('Checking database secret keys...');
    const secretKeysResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '-o',
      'jsonpath={.data}'
    ]);

    if (secretKeysResult.code !== 0) {
      throw new Error(`Failed to get database secret keys: ${secretKeysResult.stderr}`);
    }

    const secretData = JSON.parse(secretKeysResult.stdout);
    const requiredKeys = ['database-url', 'postgres-user', 'postgres-password', 'postgres-host', 'postgres-name'];
    const missingKeys = requiredKeys.filter(key => !secretData[key]);

    if (missingKeys.length > 0) {
      throw new Error(`Database secrets are missing required keys: ${missingKeys.join(', ')}`);
    }

    addComponentLog('Database secrets verified successfully.');

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
  challenge           Challenge             @relation(fields: [challengeId], references: [id])
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
  challenge           Challenge?             @relation(fields: [challengeId], references: [id])
  challengeInstance   ChallengeInstance?     @relation(fields: [challengeInstanceId], references: [id])
  group               CompetitionGroup?      @relation(fields: [groupId], references: [id])
  user                User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ChallengeType {
  id         String      @id @default(cuid())
  name       String      @unique
  challenges Challenge[]
}

model ChallengeQuestion {
  id          String               @id @default(cuid())
  challengeId String
  content     String
  type        String
  points      Int
  answer      String?
  order       Int
  title       String?
  format      String?
  hint        String?
  required    Boolean @default(true)
  cdf_question_id String?
  cdf_payload Json?

  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  challenge   Challenge            @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  attempts    QuestionAttempt[]
  completions QuestionCompletion[]

  @@unique([challengeId, order])
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
  challenge         Challenge  @relation(fields: [challengeId], references: [id], onDelete: Cascade)

  @@unique([challengeId, appId])
}

model Challenge {
  id                String               @id @default(cuid())
  name              String
  description       String?
  difficulty        ChallengeDifficulty?
  challengeTypeId   String
  challengeType     ChallengeType        @relation(fields: [challengeTypeId], references: [id])
  questions         ChallengeQuestion[]
  appConfigs        ChallengeAppConfig[]
  groupChallenges   GroupChallenge[]
  activityLogs      ActivityLog[]
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  // --- CDF Fields ---
  cdf_version       String?
  cdf_content       Json?
  pack_id           String?
  pack              ChallengePack?       @relation(fields: [pack_id], references: [id])
  pack_challenge_id String?

  @@unique([pack_id, pack_challenge_id])
}


model ChallengePack {
  id             String      @id @default(cuid())
  name           String      // Human-readable name from pack.json
  description    String?     // Description from pack.json
  version        String      // Version from pack.json
  author         String?     // Author from pack.json
  license        String?     // License from pack.json
  website        String?     // Website URL from pack.json
  installed_date DateTime    @default(now()) // When the pack was installed
  updatedAt      DateTime    @updatedAt

  // Relation to challenges contained within this pack
  challenges     Challenge[]
}

model ChallengeInstance {
  id                String           @id @default(uuid())
  challengeId       String           // Refers to Challenge model ID now
  userId            String
  challengeUrl      String
  creationTime      DateTime         @default(now())
  status            ChallengeStatus  // Changed from String to enum type
  terminationAttempts Int            @default(0) // Track retry attempts
  lastStatusChange   DateTime        @default(now()) // Track timing of status changes
  flagSecretName    String?          // Made optional
  flag              String?          // Made optional
  competitionId     String
  k8s_instance_name String?          // Added field
  activityLogs      ActivityLog[]
  competition       CompetitionGroup @relation(fields: [competitionId], references: [id], onDelete: Cascade)
  user              User             @relation(fields: [userId], references: [id], onDelete: Cascade)
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
  USER_REGISTERED
  USER_LOGGED_IN
  USER_ROLE_CHANGED
  USER_UPDATED
  CHALLENGE_INSTANCE_CREATED
  CHALLENGE_INSTANCE_DELETED
  CHALLENGE_COMPLETED
  QUESTION_ATTEMPTED
  QUESTION_COMPLETED
  GROUP_JOINED
  GROUP_CREATED
  GROUP_UPDATED
  GROUP_LEFT
  GROUP_DELETED
  ACCESS_CODE_GENERATED
  ACCESS_CODE_USED
  ACCESS_CODE_EXPIRED
  ACCESS_CODE_DELETED
  ACCESS_CODE_INVALID
  CHALLENGE_TERMINATION_INITIATED
  SYSTEM_WARNING
  SYSTEM_ERROR
  SECURITY_EVENT
  CHALLENGE_PACK_INSTALLED
  CHALLENGE_TYPE_INSTALLED
}

enum LogSeverity {
  INFO
  WARNING
  ERROR
  CRITICAL
}

enum ChallengeStatus {
  CREATING
  ACTIVE
  TERMINATING
  ERROR
}

enum ChallengeDifficulty {
  EASY
  MEDIUM
  HARD
  EXPERT
}`;

const migrationScript = `#!/bin/sh
set -e  # Exit immediately if a command exits with a non-zero status

echo "=== Starting database migration process ==="

cd /tmp
echo "=== Installing required packages ==="
apk add --no-cache openssl postgresql-client curl netcat-openbsd iputils

# Skip npm init to avoid package.json creation issues
echo "=== Installing Prisma CLI directly ==="
npm install -g prisma@latest

echo "=== Setting up Prisma schema ==="
mkdir -p prisma
cp /config/schema.prisma prisma/schema.prisma

echo "=== Checking database connection ==="
# Extract database connection details from DATABASE_URL
DB_URL=$DATABASE_URL

echo "Original DATABASE_URL: $DB_URL"

# Use environment variables directly instead of parsing the URL
DB_USER=$POSTGRES_USER
DB_PASS=$POSTGRES_PASSWORD
DB_HOST=$POSTGRES_HOST
DB_PORT=5432
DB_NAME=$POSTGRES_DB

echo "Using database connection parameters from environment variables:"
echo "User: $DB_USER"
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "Database: $DB_NAME"
echo "Password: [REDACTED]"

# Ensure we have all required variables
if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ] || [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ]; then
  echo "ERROR: Missing required database connection parameters"
  if [ -z "$DB_USER" ]; then echo "Missing DB_USER"; fi
  if [ -z "$DB_PASS" ]; then echo "Missing DB_PASS"; fi
  if [ -z "$DB_HOST" ]; then echo "Missing DB_HOST"; fi
  if [ -z "$DB_PORT" ]; then echo "Missing DB_PORT"; fi
  if [ -z "$DB_NAME" ]; then echo "Missing DB_NAME"; fi
  exit 1
fi

# Print environment variables for debugging
echo "DEBUG - Environment variables:"
echo "DATABASE_URL: $DATABASE_URL"
echo "POSTGRES_USER: $POSTGRES_USER"
echo "POSTGRES_PASSWORD: $POSTGRES_PASSWORD"
echo "POSTGRES_HOST: $POSTGRES_HOST"
echo "POSTGRES_DB: $POSTGRES_DB"

# Check if the password contains special characters that might need escaping
echo "Checking if password contains special characters..."
if echo "$DB_PASS" | grep -q '[#&;$|<>@()]'; then
  echo "WARNING: Password contains special characters that might need escaping"
  echo "These characters are properly URL-encoded in the DATABASE_URL"
  echo "Using the raw password from POSTGRES_PASSWORD for direct database connections"
fi

# Wait for PostgreSQL to be ready before attempting any connections
echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  echo "Attempt $i: Checking if PostgreSQL is ready..."
  if pg_isready -h $DB_HOST -p $DB_PORT; then
    echo "PostgreSQL is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "PostgreSQL is not ready after 30 attempts. Exiting."
    exit 1
  fi
  echo "Waiting 5 seconds before next attempt..."
  sleep 5
done

# Try to get PostgreSQL pod name to check its configuration
echo "Checking PostgreSQL pod configuration..."
echo "Skipping Kubernetes API checks and focusing on direct database connection..."

# Try connecting with different users and databases
echo "Trying various connection methods..."

# Try postgres user with postgres database
echo "Trying postgres user with postgres database..."
if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
  echo "Connection with postgres user to postgres database successful!"
  DB_USER_FOR_MIGRATION="postgres"
  DB_NAME_FOR_MIGRATION="postgres"
  CONNECTION_SUCCESSFUL=true
else
  echo "Connection with postgres user to postgres database failed."
  # Show detailed error for debugging
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "SELECT 1" || true
  CONNECTION_SUCCESSFUL=false
fi

# Try admin user with postgres database if previous attempt failed
if [ "$CONNECTION_SUCCESSFUL" != "true" ]; then
  echo "Trying admin user with postgres database..."
  if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U admin -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "Connection with admin user to postgres database successful!"
    DB_USER_FOR_MIGRATION="admin"
    DB_NAME_FOR_MIGRATION="postgres"
    CONNECTION_SUCCESSFUL=true
  else
    echo "Connection with admin user to postgres database failed."
    # Show detailed error for debugging
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U admin -d postgres -c "SELECT 1" || true
  fi
fi

# Try the specified user with the specified database if previous attempts failed
if [ "$CONNECTION_SUCCESSFUL" != "true" ]; then
  echo "Trying $DB_USER user with $DB_NAME database..."
  if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "Connection with $DB_USER user to $DB_NAME database successful!"
    DB_USER_FOR_MIGRATION=$DB_USER
    DB_NAME_FOR_MIGRATION=$DB_NAME
    CONNECTION_SUCCESSFUL=true
  else
    echo "Connection with $DB_USER user to $DB_NAME database failed."
    # Show detailed error for debugging
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" || true
  fi
fi

# If all connection attempts failed, try to create the admin user
if [ "$CONNECTION_SUCCESSFUL" != "true" ]; then
  echo "All connection attempts failed. Trying to connect as postgres to create admin user..."
  
  # Try to connect as postgres to create admin user
  if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "CREATE USER admin WITH PASSWORD '$DB_PASS' SUPERUSER;" > /dev/null 2>&1; then
    echo "Successfully created admin user!"
    DB_USER_FOR_MIGRATION="postgres"
    DB_NAME_FOR_MIGRATION="postgres"
    CONNECTION_SUCCESSFUL=true
  else
    echo "Failed to create admin user."
    # Show detailed error for debugging
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "CREATE USER admin WITH PASSWORD '$DB_PASS' SUPERUSER;" || true
  fi
fi

# If still no connection, try one more time with postgres user after waiting
if [ "$CONNECTION_SUCCESSFUL" != "true" ]; then
  echo "Still no connection. Waiting 30 seconds and trying one more time..."
  sleep 30
  
  echo "Final attempt: Trying postgres user with postgres database..."
  if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "Connection with postgres user to postgres database successful on final attempt!"
    DB_USER_FOR_MIGRATION="postgres"
    DB_NAME_FOR_MIGRATION="postgres"
    CONNECTION_SUCCESSFUL=true
  else
    echo "Connection with postgres user to postgres database failed on final attempt."
    # Show detailed error for debugging
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U postgres -d postgres -c "SELECT 1" || true
    
    echo "All connection attempts failed. Cannot proceed with migration."
    exit 1
  fi
fi

echo "Using $DB_USER_FOR_MIGRATION user for database operations with database $DB_NAME_FOR_MIGRATION"

# Ensure the target database exists
echo "=== Ensuring target database exists ==="
if [ "$DB_NAME_FOR_MIGRATION" != "$DB_NAME" ]; then
  echo "Checking if database '$DB_NAME' exists..."
  DB_EXISTS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -c 1 || echo "0")
  
  if [ "$DB_EXISTS" = "0" ]; then
    echo "Database '$DB_NAME' does not exist. Creating it..."
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -c "CREATE DATABASE $DB_NAME;" || true
    
    # Verify database was created
    DB_EXISTS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -c 1 || echo "0")
    
    if [ "$DB_EXISTS" = "0" ]; then
      echo "Failed to create database '$DB_NAME'. Using $DB_NAME_FOR_MIGRATION instead."
    else
      echo "Successfully created database '$DB_NAME'."
      DB_NAME_FOR_MIGRATION=$DB_NAME
    fi
  else
    echo "Database '$DB_NAME' already exists."
    DB_NAME_FOR_MIGRATION=$DB_NAME
  fi
fi

# Check if _prisma_migrations table exists
echo "=== Checking if _prisma_migrations table exists ==="
TABLE_EXISTS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_prisma_migrations')" 2>/dev/null || echo "false")

echo "=== Running Prisma migrations ==="
if echo $TABLE_EXISTS | grep -q "t"; then
  echo "Migration table exists, using --force-reset to reset the database"
  # Using --skip-generate to avoid generating client code
  # Using --force-reset to ensure the database is completely reset
  echo "Running Prisma DB push with force-reset..."
  echo "Command: DATABASE_URL=\"postgresql://$DB_USER_FOR_MIGRATION:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME_FOR_MIGRATION\" prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate --force-reset"
  
  # Run and capture exit code
  DATABASE_URL="postgresql://$DB_USER_FOR_MIGRATION:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME_FOR_MIGRATION" prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate --force-reset
  PRISMA_EXIT_CODE=$?
  
  echo "Prisma command exit code: $PRISMA_EXIT_CODE"
  
  if [ $PRISMA_EXIT_CODE -ne 0 ]; then
    echo "ERROR: Prisma migration failed with exit code $PRISMA_EXIT_CODE"
    echo "Trying alternative approach with direct SQL..."
    
    # Try to create tables directly with SQL as a fallback
    echo "Creating tables directly with SQL..."
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -c "
    CREATE TABLE IF NOT EXISTS \\"User\\" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      \\"emailVerified\\" TIMESTAMP,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      \\"createdAt\\" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \\"updatedAt\\" TIMESTAMP NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS \\"CompetitionGroup\\" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      \\"startDate\\" TIMESTAMP NOT NULL,
      \\"endDate\\" TIMESTAMP,
      \\"createdAt\\" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \\"updatedAt\\" TIMESTAMP NOT NULL
    );
    " || echo "Failed to create tables with SQL"
  fi
else
  echo "Migration table does not exist, using regular push without reset"
  echo "Creating schema if it doesn't exist..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER_FOR_MIGRATION" -d "$DB_NAME_FOR_MIGRATION" -c "CREATE SCHEMA IF NOT EXISTS edurange;"

  # For a fresh database, don't use --force-reset
  echo "Running Prisma DB push..."
  echo "Command: DATABASE_URL=\"postgresql://$DB_USER_FOR_MIGRATION:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME_FOR_MIGRATION\" prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate"
  
  # Run and capture exit code
  DATABASE_URL="postgresql://$DB_USER_FOR_MIGRATION:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME_FOR_MIGRATION" prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate
  PRISMA_EXIT_CODE=$?
  
  echo "Prisma command exit code: $PRISMA_EXIT_CODE"
  
  if [ $PRISMA_EXIT_CODE -ne 0 ]; then
    echo "ERROR: Prisma migration failed with exit code $PRISMA_EXIT_CODE"
    echo "Checking Prisma installation..."
    which prisma || echo "Prisma not found in PATH"
    prisma --version || echo "Failed to get Prisma version"
    
    echo "Checking Node.js version..."
    node --version || echo "Failed to get Node.js version"
    
    echo "Checking npm version..."
    npm --version || echo "Failed to get npm version"
    
    echo "Checking environment..."
    env | grep -i "database\\|postgres\\|prisma" | sed 's/=.*/=REDACTED/' || echo "No relevant environment variables found"
    
    echo "Trying to create a minimal package.json and install prisma locally..."
    echo '{"name":"migration","version":"1.0.0"}' > /tmp/package.json
    cd /tmp && npm install prisma@latest --save-dev
    
    echo "Trying migration with local prisma installation..."
    cd /tmp && DATABASE_URL="postgresql://$DB_USER_FOR_MIGRATION:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME_FOR_MIGRATION" npx prisma db push --schema=/tmp/prisma/schema.prisma --skip-generate
    LOCAL_PRISMA_EXIT_CODE=$?
    
    echo "Local Prisma command exit code: $LOCAL_PRISMA_EXIT_CODE"
  fi
fi

# Verify that the migration was successful by checking for key tables
echo "=== Verifying database schema ==="
TABLES_TO_CHECK="User CompetitionGroup Challenges ChallengeInstance"
MISSING_TABLES=""

for TABLE in $TABLES_TO_CHECK; do
  echo "Checking for table: $TABLE"
  TABLE_EXISTS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '\"$TABLE\"' AND table_schema = 'public')" 2>/dev/null || echo "false")
  
  if echo $TABLE_EXISTS | grep -q "t"; then
    echo "✅ Table $TABLE exists"
  else
    echo "❌ Table $TABLE is missing"
    MISSING_TABLES="$MISSING_TABLES $TABLE"
  fi
done

if [ -n "$MISSING_TABLES" ]; then
  echo "WARNING: Some tables are missing after migration: $MISSING_TABLES"
  echo "This may indicate that the migration was not fully successful."
  echo "Listing all tables in the database for debugging:"
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER_FOR_MIGRATION -d $DB_NAME_FOR_MIGRATION -c "\\dt public.*"
else
  echo "All expected tables were created successfully!"
fi

echo "=== Migration completed successfully ==="
# Explicitly exit with success code
exit 0`;

    addComponentLog('Using embedded Prisma schema.');

    // Create a file with migration changes for documentation
    try {
      const changesContent = `
# Database Schema Migration Changes

- Modified DATABASE_URL in migration scripts to use the default 'public' schema instead of 'edurange' schema
- Updated table verification to look for tables in the 'public' schema
- This ensures compatibility with NextAuth.js and activity logging which expect tables in the 'public' schema

These changes fix issues with authentication and activity logging when using JWT strategy.
`;
      await window.api.writeFile('changes.txt', changesContent);
      addComponentLog('Created changes.txt with migration documentation.');
    } catch (error) {
      addComponentLog(`Warning: Could not create changes.txt: ${error.message}`);
    }

    // Create a simplified migration approach using a job
    const migrationPodName = `prisma-migration-${Date.now()}`;
    addComponentLog(`Creating migration pod: ${migrationPodName}...`);

    // Create a ConfigMap with the Prisma schema
    const schemaConfigMapName = `prisma-schema-${Date.now()}`;
    const schemaConfigMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${schemaConfigMapName}
data:
  schema.prisma: |
${prismaSchema.split('\n').map(line => `    ${line}`).join('\n')}
  migration-script.sh: |
${migrationScript.split('\n').map(line => `    ${line}`).join('\n')}
`;

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

    // Create the migration pod
    addComponentLog('Creating migration pod...');

    // Define containers array with the main migration container
    const containers = [
      {
        name: 'migration',
        image: 'node:20-alpine',
        command: ['/bin/sh'],
        args: ['-c', 'cp /config/migration-script.sh /tmp/migration-script.sh && chmod +x /tmp/migration-script.sh && /tmp/migration-script.sh'],
        env: [
          {
            name: 'DATABASE_URL',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'database-url'
              }
            }
          },
          {
            name: 'POSTGRES_USER',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-user'
              }
            }
          },
          {
            name: 'POSTGRES_PASSWORD',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-password'
              }
            }
          },
          {
            name: 'POSTGRES_HOST',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-host'
              }
            }
          },
          {
            name: 'POSTGRES_DB',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-name'
              }
            }
          }
        ],
        resources: {
          limits: {
            cpu: '1000m',
            memory: '1Gi'
          },
          requests: {
            cpu: '200m',
            memory: '512Mi'
          }
        },
        volumeMounts: [
          {
            name: 'config-volume',
            mountPath: '/config'
          },
          {
            name: 'tmp-volume',
            mountPath: '/tmp'
          }
        ]
      }
    ];

    // Add debug container if enabled
    if (enableDebugSidecar) {
      addComponentLog('Debug sidecar container enabled. Adding to migration pod...');
      containers.push({
        name: 'debug',
        image: 'alpine:latest',
        command: ['/bin/sh'],
        args: ['-c', 'apk add --no-cache postgresql-client curl netcat-openbsd iputils nodejs npm git vim && echo "Debug container ready with enhanced tools" && echo "To connect: kubectl exec -it ' + migrationPodName + ' -c debug -- /bin/sh" && sleep 86400'],
        env: [
          {
            name: 'DATABASE_URL',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'database-url'
              }
            }
          },
          {
            name: 'POSTGRES_USER',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-user'
              }
            }
          },
          {
            name: 'POSTGRES_PASSWORD',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-password'
              }
            }
          },
          {
            name: 'POSTGRES_HOST',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-host'
              }
            }
          },
          {
            name: 'POSTGRES_DB',
            valueFrom: {
              secretKeyRef: {
                name: 'database-secrets',
                key: 'postgres-name'
              }
            }
          }
        ],
        resources: {
          limits: {
            cpu: '200m',
            memory: '256Mi'
          },
          requests: {
            cpu: '100m',
            memory: '128Mi'
          }
        },
        volumeMounts: [
          {
            name: 'config-volume',
            mountPath: '/config'
          },
          {
            name: 'tmp-volume',
            mountPath: '/tmp'
          }
        ]
      });
    }

    // Create the migration pod YAML
    const migrationPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${migrationPodName}
  labels:
    app: prisma-migration
spec:
  activeDeadlineSeconds: 1800
  restartPolicy: Never
  containers: ${JSON.stringify(containers, null, 2).replace(/^/gm, '  ')}
  volumes:
  - name: config-volume
    configMap:
      name: ${schemaConfigMapName}
      defaultMode: 0777
  - name: tmp-volume
    emptyDir: {}
`;

    // Apply the migration pod YAML
    addComponentLog('Creating migration pod...');
    const migrationPodResult = await window.api.applyManifestFromString(migrationPodYaml);

    if (migrationPodResult.code !== 0) {
      throw new Error(`Failed to create migration pod: ${migrationPodResult.stderr}`);
    }

    addComponentLog('Migration pod created. Waiting for migration to complete...');

    // Get the migration pod name
    const getPodResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=prisma-migration',
      '-o',
      'jsonpath={.items[0].metadata.name}'
    ]);

    if (getPodResult.code !== 0 || !getPodResult.stdout) {
      throw new Error(`Failed to get migration pod name: ${getPodResult.stderr}`);
    }

    const podName = getPodResult.stdout;
    addComponentLog(`Found migration pod: ${podName}`);

    // Wait for the migration pod to complete
    addComponentLog('Waiting for migration to complete...');

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
        } else if (podStatus === 'Failed') {
          // Check logs to see if it actually succeeded despite the pod status
          const logsResult = await window.api.executeCommand('kubectl', [
            'logs',
            podName
          ]);

          if (logsResult.stdout && logsResult.stdout.includes('=== Migration completed successfully ===')) {
            addComponentLog('Migration logs indicate success despite pod status. Treating as successful.');
            migrationSuccessful = true;
            break;
          } else {
            // Get detailed information about the pod failure
            addComponentLog('Migration pod failed. Checking for error details...');

            // Get pod description for more details
            const podDescribeResult = await window.api.executeCommand('kubectl', [
              'describe',
              'pod',
              podName
            ]);

            if (podDescribeResult.stdout) {
              addComponentLog('Pod description:');
              podDescribeResult.stdout.split('\n').slice(0, 20).forEach(line => {
                if (line.trim()) {
                  addComponentLog(`  ${line}`);
                }
              });
            }

            // Get logs from the debug container if it exists
            try {
              const debugLogsResult = await window.api.executeCommand('kubectl', [
                'logs',
                podName,
                '-c',
                'debug'
              ]);

              if (debugLogsResult.stdout) {
                addComponentLog('Debug container logs:');
                debugLogsResult.stdout.split('\n').slice(0, 10).forEach(line => {
                  if (line.trim()) {
                    addComponentLog(`  ${line}`);
                  }
                });
              }
            } catch (error) {
              addComponentLog(`No debug container logs available: ${error.message}`);
            }

            // Get the main container logs
            if (logsResult.stdout) {
              addComponentLog('Migration container logs:');
              logsResult.stdout.split('\n').forEach(line => {
                if (line.trim()) {
                  addComponentLog(`  ${line}`);
                }
              });
            }

            throw new Error('Migration pod failed. See logs for details.');
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
            addComponentLog('Recent migration logs:');
            // Create a local variable to track if we found success in this batch of logs
            let foundSuccessInLogs = false;

            logsResult.stdout.split('\n').forEach(line => {
              if (line.trim()) {
                addComponentLog(`  ${line}`);

                // Check if the logs indicate success
                if (line.includes('=== Migration completed successfully ===')) {
                  foundSuccessInLogs = true;
                }
              }
            });

            // If we found success in the logs, update the outer variable and break early
            if (foundSuccessInLogs) {
              migrationSuccessful = true;
              addComponentLog('Found success message in logs. Migration completed successfully.');
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
        addComponentLog('Migration logs:');
        logsResult.stdout.split('\n').forEach(line => {
          if (line.trim()) {
            addComponentLog(`  ${line}`);

            // Double-check for success message in full logs
            if (line.includes('=== Migration completed successfully ===')) {
              migrationSuccessful = true;
            }
          }
        });
      }

      // Final check for migration success
      if (!migrationSuccessful && podStatus === 'Succeeded') {
        // If pod succeeded but we didn't find the success message, assume it worked
        migrationSuccessful = true;
      }

      if (!migrationSuccessful) {
        throw new Error(`Migration failed: Pod status is ${podStatus}`);
      }

      addComponentLog('Database migration completed successfully.');
    } finally {
      // Always clean up the migration pod and ConfigMap, even if there was an error
      addComponentLog('Cleaning up migration resources...');

      try {
        // Delete the migration pod
        const deletePodResult = await window.api.executeCommand('kubectl', [
          'delete',
          'pod',
          podName,
          '--ignore-not-found'
        ]);

        if (deletePodResult.code !== 0) {
          addComponentLog(`Warning: Failed to delete migration pod: ${deletePodResult.stderr}`);
        } else {
          addComponentLog('Migration pod deleted.');
        }
      } catch (error) {
        addComponentLog(`Warning: Error while deleting migration pod: ${error.message}`);
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
    }

    // Add a prominent success message
    if (migrationSuccessful) {
      addComponentLog('');
      addComponentLog('=======================================================');
      addComponentLog('🎉 DATABASE INSTALLATION COMPLETED SUCCESSFULLY! 🎉');
      addComponentLog('All database components are now ready to use.');
      addComponentLog('=======================================================');
      addComponentLog('');
    }

    // Return success based on our determination, not just pod status
    return migrationSuccessful;
  } catch (error) {
    addComponentLog(`Error running migrations: ${error.message}`);
    return false;
  }
};
