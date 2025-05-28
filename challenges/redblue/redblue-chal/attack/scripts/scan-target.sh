#!/bin/bash

echo "🔍 Corporate Network Scanner 🔍"
echo "==============================="
echo "This script will scan the defender system for open ports and vulnerabilities."
echo

if [ -z "$DEFENSE_CONTAINER_HOST" ]; then
  echo "Error: DEFENSE_CONTAINER_HOST environment variable not set."
  echo "Using default target: defense-service"
  TARGET="defense-service"
else
  TARGET="$DEFENSE_CONTAINER_HOST"
  echo "Using target from environment: $TARGET"
fi

echo
echo "Starting basic port scan of $TARGET..."
echo

nmap -sV $TARGET

echo
echo "Scan complete!"
echo "For a more comprehensive scan, try these commands:"
echo "  - nmap -sC -sV -p- $TARGET"
echo "  - nmap -sV --script vuln $TARGET"
echo "  - dirb http://$TARGET/"
echo
echo "To run Metasploit:"
echo "  - msfconsole"
echo
echo "Happy hacking!" 