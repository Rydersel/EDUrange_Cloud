#!/bin/bash
# /home/kali/scripts/check_stage.sh
# This script checks for stage updates from the defense container

# File to store previous stage
STAGE_FILE="/home/kali/.current_stage"

# Initialize if not exists
if [ ! -f "$STAGE_FILE" ]; then
  echo "1" > "$STAGE_FILE"
  echo "Initialized stage tracking. Current stage: 1"
fi

# Read local stage
CURRENT_STAGE=$(cat "$STAGE_FILE")

# Get target from environment variable or use default
if [ -z "$DEFENSE_CONTAINER_HOST" ]; then
  TARGET="defense-service"
else
  TARGET="$DEFENSE_CONTAINER_HOST"
fi

# Try to get remote stage from defense container
REMOTE_STAGE=""
RESPONSE=$(timeout 5 bash -c "echo 'status' | nc $TARGET 4444 2>/dev/null" || echo "Connection failed")

if [[ $RESPONSE == *"Stage: "* ]]; then
  REMOTE_STAGE=$(echo "$RESPONSE" | grep -oP "Stage: \K[0-9]")
  
  # If remote stage is higher than our current stage, update
  if [[ ! -z "$REMOTE_STAGE" ]] && [[ "$REMOTE_STAGE" -gt "$CURRENT_STAGE" ]]; then
    # Update our local stage file
    echo "$REMOTE_STAGE" > "$STAGE_FILE"
    
    # Display notification
    echo
    echo "╔═══════════════════════════════════════════════╗"
    echo "║           !!! STAGE ADVANCED !!!              ║"
    echo "║                                               ║"
    echo "║  The challenge has progressed to Stage $REMOTE_STAGE      ║"
    echo "║  Another student completed the previous stage  ║"
    echo "╚═══════════════════════════════════════════════╝"
    echo
    echo "Type 'help stage$REMOTE_STAGE' for guidance on this stage."
    echo
    
    # Optional: clear screen after a delay to ensure message is seen
    # sleep 5
    # clear
  elif [[ "$REMOTE_STAGE" -lt "$CURRENT_STAGE" ]]; then
    # This shouldn't happen normally, but if it does, sync to the network service's stage
    echo "$REMOTE_STAGE" > "$STAGE_FILE"
    echo "Warning: Remote stage ($REMOTE_STAGE) is lower than local stage ($CURRENT_STAGE)."
    echo "Syncing to remote stage."
  fi
else
  # If we couldn't get the status, check if we're still in stage 1
  if [[ "$CURRENT_STAGE" -eq "1" ]]; then
    echo "Could not connect to defense service. Run scan-target.sh to start the challenge."
  fi
fi

# Output current stage silently for other scripts to use
echo "$CURRENT_STAGE" > "$STAGE_FILE" 