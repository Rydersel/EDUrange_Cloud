#!/bin/bash

# Tmux-based Attack Environment Setup Script

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required commands
for cmd in tmux python3 msfconsole nc; do
    if ! command_exists "$cmd"; then
        echo "Error: $cmd is not installed or not in PATH"
        exit 1
    fi
done

# Start a new tmux session
tmux new-session -d -s metasploit_challenge

# Split the window into three panes
tmux split-window -v
tmux split-window -h

# Select the first pane (top)
tmux select-pane -t 0
tmux send-keys "echo 'Pane 1: Run python3 /root/exploit.py | nc <defender-ip> 4444'" C-m

# Select the second pane (bottom-left)
tmux select-pane -t 1
tmux send-keys "echo 'Pane 2: Run msfconsole and set up the handler'" C-m
tmux send-keys "msfconsole -q" C-m

# Select the third pane (bottom-right)
tmux select-pane -t 2
tmux send-keys "echo 'Pane 3: Additional terminal for commands or monitoring'" C-m

# Attach to the tmux session
tmux attach-session -t metasploit_challenge
