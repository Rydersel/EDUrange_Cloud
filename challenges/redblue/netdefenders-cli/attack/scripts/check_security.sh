#!/bin/bash
# /home/kali/scripts/check_security.sh
# This script checks for security level updates from the defense container

# File to store security level
SECURITY_FILE="/home/kali/.security_level"

# Initialize if not exists
if [ ! -f "$SECURITY_FILE" ]; then
  echo "5" > "$SECURITY_FILE"  # Start with max security (5)
  echo "Initialized security tracking. Current security level: 5 (Maximum)"
fi

# Read local security level
LOCAL_SECURITY=$(cat "$SECURITY_FILE")

# Get target from environment variable or use default
if [ -z "$DEFENSE_CONTAINER_HOST" ]; then
  TARGET="defense-service"
else
  TARGET="$DEFENSE_CONTAINER_HOST"
fi

# Check if token is needed for connection
TOKEN_FILE="/home/kali/.security_token"
TOKEN_PARAM=""

if [ "$LOCAL_SECURITY" = "5" ] && [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  TOKEN_PARAM="TOKEN=$TOKEN"
  echo "Using stored security token: $TOKEN"
fi

# Try to get remote security level from defense container
if [ -n "$TOKEN_PARAM" ]; then
  # Use token when connecting
  RESPONSE=$(timeout 5 bash -c "echo \"$TOKEN_PARAM\" | nc $TARGET 4444 2>/dev/null" || echo "Connection failed")
  
  # If connection fails with token, suggest scanning again
  if [[ $RESPONSE == *"Connection refused"* || $RESPONSE == *"Connection failed"* ]]; then
    echo "Token connection failed. Your token may be invalid or expired."
    echo "Try running scan-target.sh again to get a new token."
    exit 1
  fi
else
  # Direct connection for security levels < 5
  RESPONSE=$(timeout 5 bash -c "echo 'status' | nc $TARGET 4444 2>/dev/null" || echo "Connection failed")
fi

if [[ $RESPONSE == *"Security Level: "* ]]; then
  # Extract only the first digit after "Security Level: "
  REMOTE_SECURITY=$(echo "$RESPONSE" | grep -oP "Security Level: \K[0-9]" | head -1)
  
  # Ensure we have a clean number
  if [[ "$REMOTE_SECURITY" =~ ^[1-5]$ ]]; then
    # If remote security is different from local, update local
    if [ "$REMOTE_SECURITY" != "$LOCAL_SECURITY" ]; then
      # Update our local security file
      echo "$REMOTE_SECURITY" > "$SECURITY_FILE"
      
      # If security decreased (system more vulnerable), show a notification
      if [ "$REMOTE_SECURITY" -lt "$LOCAL_SECURITY" ]; then
        echo
        echo "╔═══════════════════════════════════════════════╗"
        echo "║       !!! SECURITY LEVEL DECREASED !!!        ║"
        echo "║                                               ║"
        echo "║  Security level is now ${REMOTE_SECURITY}                      ║"
        echo "║  Another student successfully breached        ║"
        echo "║  the system's defenses!                       ║"
        echo "╚═══════════════════════════════════════════════╝"
        echo
        echo "Type 'help level${REMOTE_SECURITY}' for guidance on the new tasks available."
        echo
      else
        # Security increased (extremely rare, probably a system reset)
        echo "Note: Security level changed from ${LOCAL_SECURITY} to ${REMOTE_SECURITY}."
        echo "This typically means the system was reset or restarted."
      fi
    else
      echo "Security level is still ${LOCAL_SECURITY}."
      
      # Show hint based on security level
      case $LOCAL_SECURITY in
        5) 
          echo "Hint: Start with a full port scan to find hidden services."
          echo "Try running: nmap -p- $TARGET"
          ;;
        4) 
          echo "Hint: Explore the services using 'explore <service-name> --depth=full'."
          echo "Pay special attention to the registry.service and network.controller."
          ;;
        3) 
          echo "Hint: Use 'data --show-config' to find encoded credentials."
          echo "You'll need to decode them (base64 -> rot13) and validate the key."
          ;;
        2) 
          echo "Hint: Login with validated credentials and find ways to bypass command filters."
          echo "Try command substitution with \$(command) or \`command\`."
          ;;
        1) 
          echo "Hint: Locate all flag pieces and assemble them with 'debug --assemble'."
          echo "Use command injection to search the file system."
          ;;
      esac
    fi
  else
    echo "Received invalid security level format from server."
    echo "Local security level remains at ${LOCAL_SECURITY}."
  fi
else
  # If we couldn't get the status
  if nc -z -w 1 $TARGET 4444 >/dev/null 2>&1; then
    if [ "$LOCAL_SECURITY" = "5" ]; then
      echo "Connected to port 4444 but token authentication is required."
      echo "Run scan-target.sh to find the hidden token service."
    else
      echo "Connected to defense service, but couldn't retrieve security level."
      echo "Try connecting manually: nc ${TARGET} 4444"
    fi
  else
    # Check if port 8888 is open (hidden token service)
    if nc -z -w 1 $TARGET 8888 >/dev/null 2>&1; then
      echo "Port 4444 is filtered, but port 8888 (token service) is available."
      echo "Run scan-target.sh to scan for hidden services and get a token."
    else
      echo "Could not connect to defense service at ${TARGET}:4444 or 8888."
      echo "Run scan-target.sh to start the challenge."
    fi
  fi
fi 