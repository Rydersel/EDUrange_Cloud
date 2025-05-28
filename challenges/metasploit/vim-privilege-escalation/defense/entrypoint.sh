#!/bin/bash

# Print startup message
echo "Starting defense container for Vim Privilege Escalation challenge..."

# For debugging: show system info
echo "Running as user: $(id)"
echo "Container hostname: $(hostname)"

# Create a file that only root can read with the flag from environment variable
if [ -z "$TARGET_FLAG" ]; then
    # Use a default flag if not provided
    echo "CTF{vim_privilege_escalation_default}" > /root/root.txt
else
    # Use the flag provided in the environment variable
    echo "$TARGET_FLAG" > /root/root.txt
fi

# Ensure proper permissions
chmod 0400 /root/root.txt

# Clear the environment variable for security
unset TARGET_FLAG

# Add a welcome message to root's bashrc that reveals the flag location
cat << EOF >> /root/.bashrc

# Congratulations on gaining root access!
echo "==============================================="
echo "Congratulations on successfully escalating privileges!"
echo "You have gained root access to this system."
echo "The flag is located at: /root/root.txt"
echo "Use 'cat /root/root.txt' to read it."
echo "==============================================="
EOF

# Create a more subtle hint file for users that doesn't give away everything
mkdir -p /home/user
cat << EOF > /home/user/hint.txt
Hint: Check what commands you can run with elevated privileges (sudo -l).
Some programs have features that might be useful for privilege escalation.

Good luck!
EOF

chmod 644 /home/user/hint.txt
chown user:user /home/user/hint.txt

#

chmod 644 /home/user/.bash_login
chown user:user /home/user/.bash_login

# Set up SSH known hosts to avoid prompts
mkdir -p /root/.ssh
touch /root/.ssh/known_hosts

# Start SSH server
/usr/sbin/sshd -D
