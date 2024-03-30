#!/bin/bash
# entrypoint.sh

# Generate the challenge file with a unique flag
/challenge/generate_challenge.sh

# Provide instructions
echo "Welcome to the File Carving Challenge!"
echo "Find the hidden flag within 'challenge.txt'."
echo "Once you think you've found it, run 'check_solution' to submit your solution."

# Start a shell session
/bin/bash
