#!/bin/bash

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="CTF{or_1_equals_1_classic}"
    echo "WARNING: Using default flag. Set the FLAG environment variable in production."
fi

# Check if database environment variables are set
if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo "ERROR: Database environment variables not fully set."
    echo "Required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    exit 1
fi

echo "Database connection details:"
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "DB Name: $DB_NAME"
echo "User: $DB_USER"

# Replace placeholders in configuration
sed -i "s/DB_HOST_PLACEHOLDER/$DB_HOST/g" /var/www/html/config.php
sed -i "s/DB_PORT_PLACEHOLDER/$DB_PORT/g" /var/www/html/config.php
sed -i "s/DB_NAME_PLACEHOLDER/$DB_NAME/g" /var/www/html/config.php
sed -i "s/DB_USER_PLACEHOLDER/$DB_USER/g" /var/www/html/config.php
sed -i "s/DB_PASSWORD_PLACEHOLDER/$DB_PASSWORD/g" /var/www/html/config.php
sed -i "s/FLAG_PLACEHOLDER/$FLAG/g" /var/www/html/config.php

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready at $DB_HOST:$DB_PORT..."
MAX_TRIES=120
COUNT=1
while [ $COUNT -le $MAX_TRIES ]; do
    echo "Attempt $COUNT of $MAX_TRIES: Checking MySQL connection..."
    if nc -z -w5 $DB_HOST $DB_PORT; then
        echo "MySQL port is available. Checking if we can connect with credentials..."
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
            echo "MySQL is ready and accessible with provided credentials!"
            break
        else
            echo "MySQL port is open, but can't connect with credentials yet. Waiting 2 seconds..."
        fi
    else
        echo "MySQL not ready yet. Waiting 2 seconds..."
    fi
    
    COUNT=$((COUNT + 1))
    sleep 2
    
    # After 10 attempts, try to ping the host
    if [ $COUNT -eq 10 ]; then
        echo "Testing network connectivity to $DB_HOST..."
        ping -c 3 $DB_HOST || echo "Unable to ping $DB_HOST"
    fi
done

if [ $COUNT -gt $MAX_TRIES ]; then
    echo "Maximum attempts reached. Continuing anyway, but the application may not work correctly."
else
    echo "MySQL is ready!"
fi

# Check if database exists, if not create it and populate with sample data
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" >/dev/null 2>&1; then
    echo "Database $DB_NAME exists, checking if tables are set up..."
    
    # Check if users table exists and has data
    USER_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT COUNT(*) FROM $DB_NAME.users;" 2>/dev/null | tail -n 1)
    
    if [ -z "$USER_COUNT" ] || [ "$USER_COUNT" -eq "0" ]; then
        echo "Users table empty or not found. Setting up tables and sample data..."
        
        # Create users table and populate with data for Challenge 1
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            password VARCHAR(255) NOT NULL
        );
        
        -- Insert sample users for Challenge 1
        INSERT INTO users (username, password) VALUES 
        ('admin', 'admin123'),
        ('john', 'doe');
        
        -- Create flags table with the challenge flag
        CREATE TABLE IF NOT EXISTS flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            flag VARCHAR(255) NOT NULL
        );
        
        -- Insert the flag
        INSERT INTO flags (flag) VALUES ('$FLAG');"
        
        echo "Database tables and sample data setup complete!"
    else
        echo "Users table exists with $USER_COUNT records. Skipping data initialization."
    fi
else
    echo "Database $DB_NAME does not exist. Creating database and tables..."
    
    # Create database and tables
    mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
    
    # Create users table and populate with data for Challenge 1
    mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL
    );
    
    -- Insert sample users for Challenge 1
    INSERT INTO users (username, password) VALUES 
    ('admin', 'admin123'),
    ('john', 'doe');
    
    -- Create flags table with the challenge flag
    CREATE TABLE IF NOT EXISTS flags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        flag VARCHAR(255) NOT NULL
    );
    
    -- Insert the flag
    INSERT INTO flags (flag) VALUES ('$FLAG');"
    
    echo "Database setup complete!"
fi

# Unset sensitive environment variables
unset FLAG
unset DB_PASSWORD

# Start Apache
exec "$@"