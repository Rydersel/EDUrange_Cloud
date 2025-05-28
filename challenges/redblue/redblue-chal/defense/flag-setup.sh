#!/bin/bash

# This script sets up flags in the defender container

# Wait for environment variables
echo "Waiting for flag environment variables..."
while [ -z "$TARGET_FLAG" ]; do
  sleep 2
  echo "Still waiting for TARGET_FLAG..."
done

echo "Received flags, setting up challenge environment..."

# Generate flag values from main flag
WEB_FLAG="flag{web_$(echo $TARGET_FLAG | md5sum | cut -c 1-8)}"
DB_FLAG="flag{db_$(echo $TARGET_FLAG | md5sum | cut -c 9-16)}"
SSH_FLAG="flag{ssh_$(echo $TARGET_FLAG | md5sum | cut -c 17-24)}"
ROOT_FLAG=$TARGET_FLAG  # Use the provided flag as the root flag

# Save flags to files for verification
mkdir -p /flags
echo $WEB_FLAG > /flags/web_flag.txt
echo $DB_FLAG > /flags/db_flag.txt
echo $SSH_FLAG > /flags/ssh_flag.txt
echo $ROOT_FLAG > /flags/root_flag.txt

# Place web flag in HTML comment
sed -i "s/<!-- FLAG_PLACEHOLDER -->/<\!-- Flag: $WEB_FLAG -->/g" /var/www/html/index.html
sed -i "s/\/\* FLAG_PLACEHOLDER \*\//\/\* Flag: $WEB_FLAG \*\//g" /var/www/html/js/main.js

# Place database flag in the database
mysql -e "CREATE DATABASE IF NOT EXISTS corp_data;"
mysql -e "USE corp_data; CREATE TABLE IF NOT EXISTS employees (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), position VARCHAR(100), department VARCHAR(100), salary INT, notes TEXT);"
mysql -e "USE corp_data; INSERT INTO employees (name, position, department, salary, notes) VALUES ('John Smith', 'CEO', 'Executive', 500000, 'Flag: $DB_FLAG');"
mysql -e "USE corp_data; INSERT INTO employees (name, position, department, salary, notes) VALUES ('Jane Doe', 'CTO', 'IT', 400000, 'Works directly with vendors');"
mysql -e "USE corp_data; INSERT INTO employees (name, position, department, salary, notes) VALUES ('Bob Johnson', 'Manager', 'Sales', 150000, 'Handles key accounts');"
mysql -e "USE corp_data; INSERT INTO employees (name, position, department, salary, notes) VALUES ('Alice Brown', 'Developer', 'IT', 120000, 'Security specialist');"

# Update database user credentials
mysql -e "CREATE USER 'webapp'@'localhost' IDENTIFIED BY 'insecure_db_pw';"
mysql -e "GRANT SELECT ON corp_data.* TO 'webapp'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Update PHP files with database credentials
sed -i "s/DB_PASSWORD_PLACEHOLDER/insecure_db_pw/g" /var/www/html/config.php

# Place SSH flag in employee home directory
echo "Employee notes" > /home/employee/notes.txt
echo "Remember to change the default password!" >> /home/employee/notes.txt
echo "SSH Flag: $SSH_FLAG" >> /home/employee/notes.txt
chown employee:employee /home/employee/notes.txt
chmod 640 /home/employee/notes.txt

# Place root flag
echo "Congratulations! You've reached root level access." > /root/root_flag.txt
echo "Root Flag: $ROOT_FLAG" >> /root/root_flag.txt
chmod 600 /root/root_flag.txt

# Set up local privilege escalation vulnerability
echo "admin ALL=(ALL) NOPASSWD: /usr/bin/vim" >> /etc/sudoers

echo "Flag setup complete!" 