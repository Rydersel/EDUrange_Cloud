# Use the official Debian Buster image
FROM debian:buster

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install required packages
RUN apt-get update && \
    apt-get install -y \
        apache2 php libapache2-mod-php \
        postgresql postgresql-contrib \
        cron netcat curl \
        sudo vim \
        net-tools iputils-ping iproute2 procps && \
    rm -rf /var/lib/apt/lists/*

# Set PostgreSQL database
USER postgres
RUN /etc/init.d/postgresql start && \
    psql --command "CREATE USER vulnerable_user WITH PASSWORD 'weakpassword';" && \
    psql --command "CREATE DATABASE vulnerable_db OWNER vulnerable_user;"

# Switch back to root to set up the web application
USER root

# Configure Apache to listen on all interfaces
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf && \
    echo "Listen 0.0.0.0:80" > /etc/apache2/ports.conf

# Create the web directory
RUN mkdir -p /var/www/html

# Copy frontend and backend
COPY index.html /var/www/html/index.html
COPY execute.php /var/www/html/execute.php

# Enable Apache mods and restart service
RUN a2enmod php7.3 && service apache2 restart

# Create a directory for cron scripts
RUN mkdir -p /opt/cronjobs

# Create a vulnerable script executed by cron
RUN echo '#!/bin/bash\n' \
         '# Example script run by cron\n' \
         'echo "Running cronjob as $(whoami)"' \
         > /opt/cronjobs/just-script.sh && \
    chmod +x /opt/cronjobs/just-script.sh

# Make the script writable by all users (vulnerability)
RUN chmod 777 /opt/cronjobs/just-script.sh

# Add cron job to execute the script every minute
RUN echo "* * * * * root /opt/cronjobs/just-script.sh" >> /etc/crontab

# Create a flag file for the challenge
RUN echo "CTF{linux_db_server_debian_flag}" > /root/flag.txt && \
    chmod 600 /root/flag.txt

# Copy the start script into the container
COPY start-services.sh /start-services.sh

# Make the script executable
RUN chmod +x /start-services.sh

# Expose web server port
EXPOSE 80

# Start both PostgreSQL and Apache when the container runs
CMD ["/start-services.sh"]
