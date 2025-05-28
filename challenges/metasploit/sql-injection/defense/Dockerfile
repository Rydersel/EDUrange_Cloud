FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages
RUN apt-get update && apt-get install -y \
    apache2 \
    php \
    php-mysql \
    mariadb-server \
    mariadb-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure MySQL
RUN service mariadb start && \
    mysql -e "CREATE DATABASE vulnerable_db;" && \
    mysql -e "CREATE USER 'webapp'@'localhost' IDENTIFIED BY 'webapp_password';" && \
    mysql -e "GRANT ALL PRIVILEGES ON vulnerable_db.* TO 'webapp'@'localhost';" && \
    mysql -e "FLUSH PRIVILEGES;"

# Initialize the database with tables and data
COPY setup-db.sql /tmp/
RUN service mariadb start && \
    mysql vulnerable_db < /tmp/setup-db.sql

# Set up the web application
COPY app/ /var/www/html/
RUN chown -R www-data:www-data /var/www/html/

# Expose web server port
EXPOSE 80

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set entrypoint
CMD ["/entrypoint.sh"] 