#!/bin/bash

# Check if database environment variables are set
if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo "ERROR: Database environment variables not fully set."
    echo "Required: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD"
    exit 1
fi

# Use environment variable for DB_NAME or default
if [ -z "$DB_NAME" ]; then
    # Use whatever name is provided in the environment
    DB_NAME="challenge_db"
    echo "WARNING: Using default database name. Set the DB_NAME environment variable in production."
fi

# Define our flag value - this will be hidden in the database
if [ -z "$FLAG" ]; then
    # Use default flag if environment variable is not set
    FLAG="CTF_time_based_extraction_win"
    echo "Using default flag value. For custom flag, set the FLAG environment variable."
else
    echo "Using custom flag value from environment variable."
fi

# Generate a random 4-digit PIN code that students need to extract
PIN_CODE=$(printf "%04d" $((RANDOM % 10000)))
echo "Generated random PIN code: $PIN_CODE"

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
sed -i "s/PIN_CODE_PLACEHOLDER/$PIN_CODE/g" /var/www/html/config.php

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready at $DB_HOST:$DB_PORT..."
MAX_TRIES=60
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

        # Create users table and populate with data
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            password VARCHAR(100) NOT NULL
        );

        -- Insert sample users
        INSERT INTO users (username, password) VALUES
        ('admin', 'secure_password123'),
        ('john', 'password123'),
        ('jane', 'test123'),
        ('guest', 'guest');

        -- Create flags table with the CTF flag
        -- Using '_s3cr3t_flag' as the column name to make it less obvious in basic SQL injections
        CREATE TABLE IF NOT EXISTS flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            _s3cr3t_flag VARCHAR(255) NOT NULL,
            pin_code VARCHAR(4) NOT NULL
        );

        -- Insert the flag
        INSERT INTO flags (_s3cr3t_flag, pin_code) VALUES ('$FLAG', '$PIN_CODE');
        "

        echo "Database tables and sample data setup complete!"
    else
        echo "Users table exists with $USER_COUNT records. Checking if flags table exists..."

        # Create flags table if it doesn't exist yet
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
        CREATE TABLE IF NOT EXISTS flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            _s3cr3t_flag VARCHAR(255) NOT NULL,
            pin_code VARCHAR(4) NOT NULL
        );

        -- Make sure flag is inserted (ignore if exists)
        INSERT IGNORE INTO flags (id, _s3cr3t_flag, pin_code) VALUES (1, '$FLAG', '$PIN_CODE');
        "

        echo "Flag table check/creation complete."
    fi
else
    echo "Database $DB_NAME does not exist. Attempting to create database..."

    # Try to create database (this might fail if user doesn't have permission)
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null; then
        echo "Successfully created database $DB_NAME."

        # Create users table and populate with data
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            password VARCHAR(100) NOT NULL
        );

        -- Insert sample users
        INSERT INTO users (username, password) VALUES
        ('admin', 'secure_password123'),
        ('john', 'password123'),
        ('jane', 'test123'),
        ('guest', 'guest');

        -- Create flags table with the CTF flag
        -- Using '_s3cr3t_flag' as the column name to make it less obvious in basic SQL injections
        CREATE TABLE IF NOT EXISTS flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            _s3cr3t_flag VARCHAR(255) NOT NULL,
            pin_code VARCHAR(4) NOT NULL
        );

        -- Insert the flag
        INSERT INTO flags (_s3cr3t_flag, pin_code) VALUES ('$FLAG', '$PIN_CODE');
        "

        echo "Database setup complete!"
    else
        echo "WARNING: Cannot create database $DB_NAME. The user likely doesn't have CREATE DATABASE permission."
        echo "The challenge will use the existing database provided by the environment."

        # Try to use the database that was already created for us
        echo "Attempting to create tables in the existing database..."
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            password VARCHAR(100) NOT NULL
        );

        -- Insert sample users if table was created
        INSERT IGNORE INTO users (username, password) VALUES
        ('admin', 'secure_password123'),
        ('john', 'password123'),
        ('jane', 'test123'),
        ('guest', 'guest');

        -- Create flags table with the CTF flag
        -- Using '_s3cr3t_flag' as the column name to make it less obvious in basic SQL injections
        CREATE TABLE IF NOT EXISTS flags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            _s3cr3t_flag VARCHAR(255) NOT NULL,
            pin_code VARCHAR(4) NOT NULL
        );

        -- Insert the flag
        INSERT IGNORE INTO flags (id, _s3cr3t_flag, pin_code) VALUES (1, '$FLAG', '$PIN_CODE');
        "

        echo "Database setup attempt complete."
    fi
fi

# Unset sensitive environment variables
unset DB_PASSWORD
unset FLAG

# Start Apache
exec "$@"
