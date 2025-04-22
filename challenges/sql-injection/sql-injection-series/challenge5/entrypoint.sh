#!/bin/bash
set -e

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="CTF{UNION_all_the_things_for_data_extraction}"
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
echo "Waiting for MySQL to be ready..."
until mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1"; do
  sleep 1
done

# Initialize the database tables
echo "Initializing database tables..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" <<EOF
-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  image_url VARCHAR(255)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer'
);

-- Create secret_documents table (hidden from application)
CREATE TABLE IF NOT EXISTS secret_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_name VARCHAR(100) NOT NULL,
  document_content TEXT NOT NULL,
  access_level VARCHAR(20) NOT NULL DEFAULT 'top_secret'
);

-- Insert sample products
INSERT INTO products (name, description, price, category, image_url) VALUES
('Smartphone X', 'Latest smartphone with advanced features', 999.99, 'Electronics', 'smartphone.jpg'),
('Laptop Pro', 'Professional laptop for developers', 1499.99, 'Electronics', 'laptop.jpg'),
('Wireless Headphones', 'Noise-cancelling wireless headphones', 199.99, 'Audio', 'headphones.jpg'),
('Smart Watch', 'Fitness tracking smart watch', 249.99, 'Wearables', 'smartwatch.jpg'),
('Coffee Maker', 'Automatic coffee maker with timer', 89.99, 'Kitchen', 'coffeemaker.jpg'),
('Bluetooth Speaker', 'Portable bluetooth speaker with deep bass', 79.99, 'Audio', 'speaker.jpg'),
('Gaming Console', 'Next-gen gaming console', 499.99, 'Gaming', 'console.jpg'),
('Tablet Ultra', 'Lightweight tablet with high resolution display', 399.99, 'Electronics', 'tablet.jpg'),
('Digital Camera', 'Professional digital camera with 4K video', 699.99, 'Photography', 'camera.jpg'),
('Smart Thermostat', 'Energy-saving smart home thermostat', 129.99, 'Smart Home', 'thermostat.jpg');

-- Insert users
INSERT INTO users (username, password, email, role) VALUES
('admin', 'admin123', 'admin@example.com', 'admin'),
('john', 'password123', 'john@example.com', 'customer'),
('alice', 'secure456', 'alice@example.com', 'customer'),
('bob', 'bob789', 'bob@example.com', 'customer');

-- Insert secret documents (including the flag)
INSERT INTO secret_documents (document_name, document_content, access_level) VALUES
('Company Strategy', 'Expand into international markets by Q3 2025', 'confidential'),
('Financial Report', 'Revenue increased by 25% in Q1 2025', 'confidential'),
('Customer Database', 'Contains sensitive customer information and payment details', 'restricted'),
('Security Credentials', 'Server access credentials and API keys', 'top_secret'),
('Flag Document', '$FLAG', 'top_secret');
EOF

# Unset sensitive environment variables
unset FLAG
unset DB_PASSWORD

# Start Apache
echo "Starting Apache..."
exec "$@"
