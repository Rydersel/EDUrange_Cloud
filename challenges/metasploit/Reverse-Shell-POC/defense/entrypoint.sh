#!/bin/bash

# Print effective user and check if we're root
echo "Running as user: $(whoami) with UID: $(id -u)"
echo "Running with EUID: $EUID"


# Create a simple flag and hide it
echo $TARGET_FLAG > /home/user/flag.txt

# Prevent use of debuggers to pull env value
unset TARGET_FLAG

chmod 644 /home/user/flag.txt
chown user:user /home/user/flag.txt




echo "Starting simple netcat listener on port 4444..."
echo "This is a proof of concept for testing Metasploit connections"

# Start a netcat listener that responds to connections
# Using socat for better reliability and to keep the connection open
socat TCP-LISTEN:4444,fork,reuseaddr EXEC:/bin/bash,pty,stderr,setsid,sigint,sane &

# Log that the listener is running
echo "Netcat listener is now running on port 4444"
echo "Attack pod can connect using Metasploit or direct tools"

# Execute the cleanup script from its new location
/tmp/scripts/cleanup.sh
