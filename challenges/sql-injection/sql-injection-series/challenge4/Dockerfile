FROM php:7.4-apache

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    netcat-openbsd \
    iputils-ping \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Configure PHP error settings for the challenge
RUN echo "display_errors = Off" >> /usr/local/etc/php/php.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/php.ini \
    && echo "error_reporting = E_ALL" >> /usr/local/etc/php/php.ini

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Configure Apache to run on port 8080 instead of 80
RUN sed -i 's/Listen 80/Listen 8080/g' /etc/apache2/ports.conf \
    && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/g' /etc/apache2/sites-available/000-default.conf

# Copy the web application files
COPY www /var/www/html/

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set the working directory
WORKDIR /var/www/html

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Expose port 8080 instead of 80
EXPOSE 8080

# Start Apache in foreground
CMD ["apache2-foreground"]
