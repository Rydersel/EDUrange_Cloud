FROM php:7.4-apache

# Install MySQL client, PDO MySQL extension, and other utilities
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    libpq-dev \
    netcat-openbsd \
    iputils-ping \
    && docker-php-ext-install pdo_mysql \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure Apache to use port 8080 instead of 80
RUN sed -i 's/Listen 80/Listen 8080/g' /etc/apache2/ports.conf && \
    sed -i 's/:80>/:8080>/g' /etc/apache2/sites-available/000-default.conf

# Set working directory
WORKDIR /var/www/html

# Copy web files
COPY www /var/www/html/
COPY entrypoint.sh /entrypoint.sh

# Make entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set permissions for web directory
RUN chown -R www-data:www-data /var/www/html

# Expose port 8080 (instead of 80)
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Start Apache in foreground
CMD ["apache2-foreground"]
