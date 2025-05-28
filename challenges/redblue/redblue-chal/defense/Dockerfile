FROM ubuntu:22.04

# Set up non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages and services
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    apache2 \
    php \
    php-mysql \
    mariadb-server \
    cron \
    supervisor \
    sudo \
    vim \
    curl \
    net-tools \
    iputils-ping \
    dnsutils \
    tmux \
    python3-minimal \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH
RUN mkdir -p /run/sshd
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/g' /etc/ssh/sshd_config

# Create users
RUN useradd -m -s /bin/bash employee && \
    echo "employee:password123" | chpasswd

RUN useradd -m -s /bin/bash admin && \
    echo "admin:Corp2023!" | chpasswd && \
    adduser admin sudo

# Set up web server with vulnerable application
COPY webroot /var/www/html/
RUN chown -R www-data:www-data /var/www/html
RUN chmod -R 755 /var/www/html

# Set up vulnerable service
COPY vulnerable-service /opt/vuln-service/
RUN chmod +x /opt/vuln-service/start.sh

# Set up flags
RUN mkdir -p /flags
COPY flag-setup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/flag-setup.sh

# Set up supervisor to manage services
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create monitor script
COPY monitor.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/monitor.sh

# Expose ports
EXPOSE 22 80 4444

# Start services with supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
