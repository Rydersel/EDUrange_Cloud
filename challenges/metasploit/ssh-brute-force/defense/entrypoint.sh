#!/bin/bash

# Print effective user
echo "Starting SSH server as user: $(whoami)"

# Set up the flag
/flag-setup.sh

# Start SSH server
echo "Starting SSH server on port 22..."
/usr/sbin/sshd -D &
SSH_PID=$!

# Log that the server is running
echo "SSH server is now running with PID: $SSH_PID"
echo "Target username is 'target'"
echo "The flag is located in the target user's home directory"

# Keep container running
tail -f /dev/null 