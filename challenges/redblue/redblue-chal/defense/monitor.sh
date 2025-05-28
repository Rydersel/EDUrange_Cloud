#!/bin/bash

# Monitor script for the defender container
# This script continuously monitors the system and updates the status page

STATUS_FILE="/var/www/html/status/index.html"
JSON_STATUS_FILE="/var/www/html/status/status.json"
LOG_FILE="/var/log/monitor.log"

# Initialize status files
create_status_files() {
  mkdir -p /var/www/html/status
  cat > $STATUS_FILE << EOL
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Corporate Defender Status</title>
    <meta http-equiv="refresh" content="10">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f0f0f0; }
        .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status-item { margin-bottom: 15px; padding: 10px; border-radius: 5px; }
        .status-ok { background-color: #d4edda; color: #155724; }
        .status-warning { background-color: #fff3cd; color: #856404; }
        .status-danger { background-color: #f8d7da; color: #721c24; }
        .time { color: #666; margin-top: 20px; }
        .attack-log { background-color: #f8f9fa; padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Corporate Defender Status</h1>
        <div id="system-status">Loading status...</div>
        <div id="connection-status">Loading connections...</div>
        <h2>Recent Attack Attempts</h2>
        <div id="attack-log" class="attack-log">Loading logs...</div>
        <div class="time">Last updated: <span id="timestamp"></span></div>
    </div>
    <script>
        // Load status data
        fetch('status.json')
            .then(response => response.json())
            .then(data => {
                document.getElementById('system-status').innerHTML = data.system_status;
                document.getElementById('connection-status').innerHTML = data.connection_status;
                document.getElementById('attack-log').innerHTML = data.attack_log;
                document.getElementById('timestamp').textContent = data.timestamp;
            });
    </script>
</body>
</html>
EOL

  # Initialize JSON status
  cat > $JSON_STATUS_FILE << EOL
{
    "system_status": "<div class='status-item status-ok'>All systems operational</div>",
    "connection_status": "<div class='status-item status-ok'>No active connections</div>",
    "attack_log": "<p>No attacks detected yet</p>",
    "timestamp": "$(date)"
}
EOL

  chown www-data:www-data $STATUS_FILE $JSON_STATUS_FILE
  chmod 644 $STATUS_FILE $JSON_STATUS_FILE
}

# Get system status HTML
get_system_status() {
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
  local memory_usage=$(free -m | awk '/Mem:/ {printf "%.1f", $3*100/$2}')
  local disk_usage=$(df -h / | awk 'NR==2 {print $(NF-1)}' | tr -d '%')
  
  # Determine status based on resource usage
  local status_class="status-ok"
  local status_message="All systems operational"
  
  if (( $(echo "$cpu_usage > 80" | bc -l) )) || (( $(echo "$memory_usage > 80" | bc -l) )) || (( $(echo "$disk_usage > 80" | bc -l) )); then
    status_class="status-danger"
    status_message="High resource usage detected"
  elif (( $(echo "$cpu_usage > 60" | bc -l) )) || (( $(echo "$memory_usage > 60" | bc -l) )) || (( $(echo "$disk_usage > 70" | bc -l) )); then
    status_class="status-warning"
    status_message="Elevated resource usage"
  fi
  
  echo "<div class='status-item $status_class'>
    <strong>Status:</strong> $status_message<br>
    <strong>CPU Usage:</strong> $cpu_usage%<br>
    <strong>Memory Usage:</strong> $memory_usage%<br>
    <strong>Disk Usage:</strong> $disk_usage%
  </div>"
}

# Get connection status HTML
get_connection_status() {
  local connection_count=$(netstat -an | grep ESTABLISHED | wc -l)
  local ssh_connections=$(netstat -an | grep ":22" | grep ESTABLISHED | wc -l)
  local web_connections=$(netstat -an | grep ":80" | grep ESTABLISHED | wc -l)
  local vuln_connections=$(netstat -an | grep ":4444" | grep ESTABLISHED | wc -l)
  
  # Determine status based on connection count
  local status_class="status-ok"
  local status_message="Normal traffic"
  
  if (( connection_count > 10 )); then
    status_class="status-danger"
    status_message="High traffic detected - possible DoS attack"
  elif (( connection_count > 5 )); then
    status_class="status-warning"
    status_message="Elevated traffic detected"
  fi
  
  echo "<div class='status-item $status_class'>
    <strong>Traffic:</strong> $status_message<br>
    <strong>Active Connections:</strong> $connection_count<br>
    <strong>SSH Connections:</strong> $ssh_connections<br>
    <strong>Web Connections:</strong> $web_connections<br>
    <strong>Service Connections:</strong> $vuln_connections
  </div>"
}

# Get attack log HTML
get_attack_log() {
  # Check auth log for SSH attacks
  local ssh_failures=$(grep "Failed password" /var/log/auth.log 2>/dev/null | tail -5)
  local invalid_users=$(grep "invalid user" /var/log/auth.log 2>/dev/null | tail -5)
  
  # Check Apache logs for web attacks
  local web_attacks=$(grep -E "(\\.\\./|\\.\\./\\.\\.|\\'|SELECT|UNION|INSERT|script|XSS)" /var/log/apache2/access.log 2>/dev/null | tail -5)
  
  # Format the log entries
  local log_html="<p><strong>Recent SSH Failed Logins:</strong></p>"
  
  if [ -n "$ssh_failures" ]; then
    log_html+="<pre>$ssh_failures</pre>"
  else
    log_html+="<p>No failed SSH logins detected</p>"
  fi
  
  log_html+="<p><strong>Invalid SSH Users:</strong></p>"
  if [ -n "$invalid_users" ]; then
    log_html+="<pre>$invalid_users</pre>"
  else
    log_html+="<p>No invalid users detected</p>"
  fi
  
  log_html+="<p><strong>Web Attack Attempts:</strong></p>"
  if [ -n "$web_attacks" ]; then
    log_html+="<pre>$web_attacks</pre>"
  else
    log_html+="<p>No web attacks detected</p>"
  fi
  
  echo "$log_html"
}

# Main monitoring loop
while true; do
  # Create status files if they don't exist
  if [ ! -f "$STATUS_FILE" ] || [ ! -f "$JSON_STATUS_FILE" ]; then
    create_status_files
  fi
  
  # Get current status
  system_status=$(get_system_status)
  connection_status=$(get_connection_status)
  attack_log=$(get_attack_log)
  timestamp=$(date)
  
  # Update JSON status file
  jq -n \
    --arg system_status "$system_status" \
    --arg connection_status "$connection_status" \
    --arg attack_log "$attack_log" \
    --arg timestamp "$timestamp" \
    '{system_status: $system_status, connection_status: $connection_status, attack_log: $attack_log, timestamp: $timestamp}' > $JSON_STATUS_FILE
  
  # Log update
  echo "[$(date)] Updated status page" >> $LOG_FILE
  
  # Wait before next update
  sleep 10
done 