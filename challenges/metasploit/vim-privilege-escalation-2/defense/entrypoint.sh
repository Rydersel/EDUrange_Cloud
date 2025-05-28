#!/bin/bash

# Print startup message
echo "Starting defense container for Vim Privilege Escalation Part 2 challenge..."

# For debugging: show system info
echo "Running as user: $(id)"
echo "Container hostname: $(hostname)"

# Create a file that only root can read with the flag from environment variable
if [ -z "$TARGET_FLAG" ]; then

    echo "CTF{default-flag}" > /root/root.txt
else
    # Use the flag provided in the environment variable
    echo "$TARGET_FLAG" > /root/root.txt
fi

# Ensure proper permissions
chmod 0400 /root/root.txt



# Clear the environment variable for security
unset TARGET_FLAG

# Create a hint file for users with improved hints
mkdir -p /home/user
cat << EOF > /home/user/hint.txt
Hint: Something seems different about this system...
Many applications aren't working as expected.

Sometimes the most useful tools are hidden in unusual places.
Look for directories starting with a dot (.) and check what
commands you're allowed to run with elevated privileges.

Find a way to run commands freely, then look for the flag in an unusual location.
EOF

chmod 644 /home/user/hint.txt
chown user:user /home/user/hint.txt

# Create a breadcrumb file pointing to /opt
cat << EOF > /home/user/notes.txt
TODO: Clean up the mess in /opt
- Move system backups
- Archive old configs
- Check dot directories for leftover files
EOF
chmod 644 /home/user/notes.txt
chown user:user /home/user/notes.txt

# Create symlinks to basic navigation commands in the user's bin directory
mkdir -p /home/user/bin
for cmd in ls cd pwd cat grep find head tail; do
    ln -sf /bin/$cmd /home/user/bin/$cmd
done

# Set up restricted shell environment
cat << EOF > /home/user/.bash_profile
# Include /usr/bin in PATH for sudo and other necessary commands
export PATH=/home/user/bin:/usr/bin
# Set suspicious environment variable hinting at the location
export EDITOR_BACKUP_PATH="/opt/.hidden/editor"
# Don't alias navigation commands, but block editors and shells
alias vim="echo 'Command not found: vim'"
alias vi="echo 'Command not found: vi'"
alias nano="echo 'Command not found: nano'"
alias emacs="echo 'Command not found: emacs'"
alias pico="echo 'Command not found: pico'"
alias bash="echo 'Command not found: bash'"
alias sh="echo 'Command not found: sh'"
alias less="echo 'Command not found: less'"
alias more="echo 'Command not found: more'"
EOF

chmod 644 /home/user/.bash_profile
chown user:user /home/user/.bash_profile

# Create .bashrc with restrictions
cat << EOF > /home/user/.bashrc
# Include /usr/bin in PATH for sudo and other necessary commands
export PATH=/home/user/bin:/usr/bin
# Set suspicious environment variable here too in case .bash_profile isn't sourced
export EDITOR_BACKUP_PATH="/opt/.hidden/editor"
EOF

chmod 644 /home/user/.bashrc
chown user:user /home/user/.bashrc

# Add a hint to sudo -l permissions (readable but not in PATH)
cat << EOF > /home/user/bin/help
echo "Hint: Try 'sudo -l' to see what commands you might be able to run as root."
echo "Also, check your environment variables with 'env' for clues."
EOF
chmod 755 /home/user/bin/help
chown user:user /home/user/bin/help

# Make env command available to see environment variables
ln -sf /usr/bin/env /home/user/bin/env
chown user:user /home/user/bin/env

# Set up SSH known hosts to avoid prompts
mkdir -p /root/.ssh
touch /root/.ssh/known_hosts

# Start SSH server
/usr/sbin/sshd -D
