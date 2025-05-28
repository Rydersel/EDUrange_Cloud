#!/bin/bash

# Create log directory
mkdir -p /var/log/challenge

# Set up the flags and files
echo "Setting up flags and files..."
/opt/service/setup_flags.sh &

# Start SSH daemon
echo "Starting SSH daemon..."
/usr/sbin/sshd &

# Wait a moment for SSH to initialize
sleep 2

# Start the main network service
echo "Starting Network Defenders vulnerable service on port 4444..."
cd /opt/service
python3 /opt/service/network_service.py 