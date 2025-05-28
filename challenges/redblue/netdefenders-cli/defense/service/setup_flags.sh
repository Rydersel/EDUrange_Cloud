#!/bin/bash

# This script sets up the flags in the defender container

# Wait for environment variable
echo "Setting up challenge flags..."

# Use the environment variable or a default value
if [ -z "$TARGET_FLAG" ]; then
    FLAG="flag{n3tw0rk_d3f3nd3rs_d3fault_fl4g}"
    echo "Warning: TARGET_FLAG not set. Using default flag."
else
    FLAG=$TARGET_FLAG
    echo "Using provided TARGET_FLAG."
fi

# Create the flags directory
mkdir -p /flags

# Create the root flag
echo "Creating final flag..."
echo "$FLAG" > /flags/final_flag.txt
chmod 600 /flags/final_flag.txt

# Create some decoy flags for fun
echo "flag{th1s_1s_n0t_th3_r34l_fl4g}" > /flags/decoy1.txt
echo "flag{n1c3_try_but_k33p_l00k1ng}" > /home/user/decoy_flag.txt

# Update database credentials file in the service directory
mkdir -p /opt/service/files
echo "# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=appuser
DB_PASS=password123
" > /opt/service/files/database.conf
chmod 644 /opt/service/files/database.conf

# Create users.txt file
echo "# Network Service Users
user:password123:regular
admin:SecurePass2023!:administrator" > /opt/service/files/users.txt
chmod 644 /opt/service/files/users.txt

# Create service.conf file
echo "# Service Configuration
SERVICE_PORT=4444
MAX_CONNECTIONS=10
TIMEOUT=300
DEBUG_MODE=false" > /opt/service/files/service.conf
chmod 644 /opt/service/files/service.conf

echo "Flag setup completed." 