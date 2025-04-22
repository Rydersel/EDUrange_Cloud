FROM php:7.4-apache

# Install required dependencies
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    netcat-openbsd \
    iputils-ping \
    && docker-php-ext-install pdo pdo_mysql mysqli \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure Apache to use port 8080 instead of 80
RUN sed -i 's/Listen 80/Listen 8080/g' /etc/apache2/ports.conf && \
    sed -i 's/:80>/:8080>/g' /etc/apache2/sites-available/000-default.conf

# Copy application files
COPY www /var/www/html/

# Make entrypoint script executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set permissions for web directory
RUN chown -R www-data:www-data /var/www/html

# Apache configuration: Enable display_errors for educational purposes
RUN echo "display_errors = On" >> /usr/local/etc/php/php.ini \
    && echo "display_startup_errors = On" >> /usr/local/etc/php/php.ini \
    && echo "error_reporting = E_ALL" >> /usr/local/etc/php/php.ini

# Expose port 8080 (instead of 80)
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["apache2-foreground"]
