#!/bin/bash

# Add defense container to hosts file
echo "Updating /etc/hosts to include defense-container..."
if ! grep -q "defense-container" /etc/hosts; then
    echo "127.0.0.1  defense-container" >> /etc/hosts
fi

# Set up SSH known hosts to avoid prompts
sudo -u kali mkdir -p /home/kali/.ssh
if [ ! -f /home/kali/.ssh/known_hosts ]; then
    sudo -u kali touch /home/kali/.ssh/known_hosts
fi

# Update the instructions file for the new challenge
cat << EOF > /home/kali/instructions.txt
Vim Privilege Escalation Challenge Part 2: Restricted Access
===========================================================

This challenge builds on the previous vim privilege escalation challenge with some new twists!

You can connect to the defense container via SSH:
ssh user@localhost -p 22
Password: user

Challenge Goals:
1. Overcome the restricted shell environment
2. Find the hidden vim binary
3. Elevate privileges using vim
4. Locate and decode the hidden flag

Hints:
- The environment is more restrictive than before
- Try to understand what limitations are in place
- The flag is not in the same location as last time
- Look for unusual directories and encoded files

Good luck!
EOF

# Create a welcome message
cat << EOF > /home/kali/welcome.txt
Welcome to the Vim Privilege Escalation Part 2 Challenge!
======================================================

In this challenge, you'll need to:
1. Break out of a restricted shell environment
2. Find a hidden vim binary
3. Use vim for privilege escalation
4. Find and decode a hidden flag

Type 'cat instructions.txt' for detailed instructions.

Good luck!
EOF

# Make sure permissions are correct
chown -R kali:kali /home/kali

# Display welcome message at login
cat << EOF > /home/kali/.bashrc.custom
cat /home/kali/welcome.txt
EOF

echo "source /home/kali/.bashrc.custom" >> /home/kali/.bashrc
chown kali:kali /home/kali/.bashrc.custom
chown kali:kali /home/kali/.bashrc

# Keep container running but switch to the kali user for interactive shell
echo "Environment is ready! Starting interactive shell as kali user..."
su -l kali
sleep infinity
