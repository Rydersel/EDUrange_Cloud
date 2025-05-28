#!/bin/bash

# Remove flag setup script to prevent accidental disclosure 
if [ -f /home/challengeuser/entrypoint.sh ]; then
  # Try to make the file writable first
  chmod 644 /home/challengeuser/entrypoint.sh 2>/dev/null || true
  
  # Try to remove the file, but don't fail if it can't be removed
  rm /home/challengeuser/entrypoint.sh 2>/dev/null || {
    echo "Warning: Could not remove entrypoint.sh, but will continue execution"
  }
fi

# Keep the Exec tab running
sleep infinity