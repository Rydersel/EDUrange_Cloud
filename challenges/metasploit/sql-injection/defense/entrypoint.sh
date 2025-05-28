#!/bin/bash

# Start MySQL service
service mariadb start
echo "MySQL service started"

# Start Apache service
service apache2 start
echo "Apache service started"

# Print information
echo "Vulnerable web application running on port 80"
echo "Database initialized with vulnerable_db database"

# Keep container running
tail -f /dev/null 