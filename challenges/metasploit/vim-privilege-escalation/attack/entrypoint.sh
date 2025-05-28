#!/bin/bash

# Add defense container to hosts file
echo "Updating /etc/hosts to include localhost..."
if ! grep -q "localhost" /etc/hosts; then
    echo "127.0.0.1  localhost" >> /etc/hosts
fi

# Set up SSH known hosts to avoid prompts
sudo -u kali mkdir -p /home/kali/.ssh
if [ ! -f /home/kali/.ssh/known_hosts ]; then
    sudo -u kali touch /home/kali/.ssh/known_hosts
fi

# Create a welcome message
cat << EOF > /home/user/.bash_login
echo "Welcome to the Vim Privilege Escalation Challenge!"
echo "=================================================="
echo ""
echo "Your goal is to exploit sudo privileges for vim to gain root access."
echo "Try running 'sudo -l' to see what commands you can run with sudo."
echo ""
echo "There is a hint file in your home directory: ~/hint.txt"
echo ""
EOF
# Make sure permissions are correct
chown -R kali:kali /home/kali

# Keep container running but switch to the kali user for interactive shell
echo "Environment is ready! Starting interactive shell as kali user..."
su -l kali
sleep infinity
