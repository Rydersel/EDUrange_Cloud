#!/bin/bash

# Start PostgreSQL
echo "Starting PostgreSQL..."
service postgresql start

# Configure Apache to listen on all interfaces
echo "Configuring Apache..."
cat > /etc/apache2/ports.conf << EOF
Listen 0.0.0.0:80
EOF

cat > /etc/apache2/sites-available/000-default.conf << EOF
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/html
    ErrorLog \${APACHE_LOG_DIR}/error.log
    CustomLog \${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
EOF

# Start Apache
echo "Starting Apache..."
service apache2 stop
sleep 1
service apache2 start

# Verify Apache is running
echo "Verifying Apache status..."
service apache2 status

# Start cron
echo "Starting cron..."
service cron start

# Display network information for debugging
echo "Network Information:"
hostname -I
echo "IP Addresses assigned to interfaces:"
ip addr show | grep -w inet

# Check if web server is accessible
echo "Testing local web server access..."
curl -v http://localhost/
curl -v http://127.0.0.1/execute.php?cmd=hostname

# Check listening ports
echo "Checking listening ports:"
netstat -tulpn | grep LISTEN

# Keep the container running
echo "All services started. Container is now running."
tail -f /dev/null
