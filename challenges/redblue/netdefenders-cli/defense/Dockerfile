FROM ubuntu:22.04

# Set up non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages and services
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    python3 \
    python3-pip \
    netcat \
    vim \
    curl \
    net-tools \
    iputils-ping \
    dnsutils \
    tmux \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --no-cache-dir flask

# Configure SSH
RUN mkdir -p /run/sshd
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/g' /etc/ssh/sshd_config

# Create users
RUN useradd -m -s /bin/bash user && \
    echo "user:password123" | chpasswd

RUN useradd -m -s /bin/bash admin && \
    echo "admin:SecurePass2023!" | chpasswd

# Create necessary directories
RUN mkdir -p /var/log/challenge /opt/service /opt/service/files

# Set default environment variables
ENV CURRENT_STAGE=1
ENV SECURITY_LEVEL=5
ENV TARGET_FLAG="flag{n3tw0rk_d3f3nd3rs_ch4ll3ng3_c0mpl3t3d}"

# Create the network service Python script
COPY service/network_service.py /opt/service/network_service.py
COPY service/setup_flags.sh /opt/service/setup_flags.sh
COPY service/entrypoint.sh /entrypoint.sh

# Set proper permissions
RUN chmod +x /opt/service/network_service.py /opt/service/setup_flags.sh /entrypoint.sh

# Expose the SSH port and the vulnerable service port
EXPOSE 22 4444 8888

# Start services using entrypoint script
ENTRYPOINT ["/entrypoint.sh"] 