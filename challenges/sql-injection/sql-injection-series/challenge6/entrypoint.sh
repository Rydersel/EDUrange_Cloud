#!/bin/bash
set -e

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="CTF{SQL_update_injection_master}"
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
  image_url VARCHAR(255)
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  reviewer_name VARCHAR(100) NOT NULL,
  rating INT NOT NULL,
  review_text TEXT NOT NULL,
  hidden BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Insert sample product
INSERT INTO products (name, description, price, image_url) VALUES
('UltraPhone X', 'The latest smartphone with advanced AI capabilities, 8K camera, and all-day battery life.', 999.99, 'phone.jpg');

-- Insert some sample reviews
INSERT INTO reviews (product_id, reviewer_name, rating, review_text, hidden) VALUES
(1, 'John Smith', 5, 'Amazing phone! The camera quality is outstanding and the battery lasts all day.', 0),
(1, 'Sarah Johnson', 4, 'Great phone overall. A bit pricey but worth it for the features.', 0),
(1, 'Michael Brown', 3, 'Decent phone but I expected more for the price. The battery life is not as advertised.', 0),
(1, 'Emily Davis', 5, 'Best phone I have ever owned! The AI features are incredible.', 0);

-- Insert hidden admin review with the flag
INSERT INTO reviews (product_id, reviewer_name, rating, review_text, hidden) VALUES
(1, 'Admin', 5, 'Special pre-release review. The flag is: $FLAG. Do not publish this review!', 1);
EOF

# Unset sensitive environment variables
unset FLAG
unset DB_PASSWORD

# Start Apache
echo "Starting Apache..."
exec "$@"
