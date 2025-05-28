#!/bin/bash
# /home/kali/scripts/scan-target.sh
# This script performs a basic scan of the target system

echo "🔍 Network Defenders Scanner 🔍"
echo "==============================="
echo "This script will scan the defender system for open ports."
echo

# Get target from environment variable or use default
if [ -z "$DEFENSE_CONTAINER_HOST" ]; then
  echo "Warning: DEFENSE_CONTAINER_HOST environment variable not set."
  echo "Using default target: defense-service"
  TARGET="defense-service"
else
  TARGET="$DEFENSE_CONTAINER_HOST"
  echo "Using target from environment: $TARGET"
fi

echo
echo "Starting basic port scan of $TARGET..."
echo

# Get current security level
SECURITY_FILE="/home/kali/.security_level"
if [ ! -f "$SECURITY_FILE" ]; then
  echo "5" > "$SECURITY_FILE"  # Start with max security
fi
LOCAL_SECURITY=$(cat "$SECURITY_FILE")

# Initial basic scan - only shows standard ports
echo "Scanning common service ports..."
nmap -T4 -p 22,80,443,4444,3389 $TARGET

# If security level is still at 5, do a more thorough scan
if [ "$LOCAL_SECURITY" = "5" ]; then
  echo
  echo "Initial scan complete. Security level is still at maximum (5)."
  echo "For better results, try a more thorough port scan:"
  echo
  echo "  nmap -p- $TARGET"
  echo
  echo "Running full port scan to look for hidden services..."
  
  # Run a "full" port scan but actually just check port 8888
  echo "Starting full port scan (this might take a minute)..."
  PORT_8888_OPEN=$(nmap -p 8888 $TARGET | grep "8888/tcp" | grep "open")
  
  if [ ! -z "$PORT_8888_OPEN" ]; then
    echo
    echo "Hidden service found!"
    echo "Port 8888: OPEN (Security Token Service)"
    echo 
    echo "Connecting to Security Token Service on port 8888..."
    TOKEN_RESPONSE=$(nc $TARGET 8888 2>/dev/null)
    
    if [[ $TOKEN_RESPONSE == *"TOKEN: "* ]]; then
      # Extract the token
      TOKEN=$(echo "$TOKEN_RESPONSE" | grep -oP "TOKEN: \K[A-Z0-9]+" | head -1)
      echo
      echo "🔑 Security token received: $TOKEN"
      echo 
      echo "You can now connect to port 4444 using the token:"
      echo "  echo \"TOKEN=$TOKEN\" | nc $TARGET 4444"
      echo
      # Save the token for later use
      echo "$TOKEN" > /home/kali/.security_token
      echo "Token saved to ~/.security_token for future use"
    else
      echo "Connected to port 8888 but couldn't retrieve a security token."
    fi
  else
    echo "Still searching for hidden services..."
    echo "Try running: nmap -p- $TARGET to scan all ports"
  fi
else
  # If security level is already below 5, check port 4444
  if nc -z -w 1 $TARGET 4444 >/dev/null 2>&1; then
    echo
    echo "Port 4444 is accessible. Current security level: $LOCAL_SECURITY"
    echo "You can connect directly with: nc $TARGET 4444"
  fi
fi

echo
echo "Scan complete!"
echo "For more detailed scanning, try these commands:"
echo "  - nmap -sV $TARGET            (service version detection)"
echo "  - nmap -p- $TARGET            (all ports)"
if [ "$LOCAL_SECURITY" = "5" ] && [ -f "/home/kali/.security_token" ]; then
  TOKEN=$(cat /home/kali/.security_token)
  echo "  - echo \"TOKEN=$TOKEN\" | nc $TARGET 4444    (connect with token)"
elif [ "$LOCAL_SECURITY" -lt "5" ]; then
  echo "  - nc $TARGET 4444             (connect to network service)"
fi
echo 