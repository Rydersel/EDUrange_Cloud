FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    socat \
    dos2unix \
    sudo \
    findutils \
    grep \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create the user who will own the flag
RUN useradd -m user && \
    mkdir -p /home/user && \
    chown -R user:user /home/user && \
    echo "user ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/user && \
    chmod 440 /etc/sudoers.d/user

# Create a writable directory for scripts
RUN mkdir -p /tmp/scripts && \
    chmod 777 /tmp/scripts

# Copy the scripts to the container
COPY entrypoint.sh /tmp/scripts/entrypoint.sh
COPY cleanup.sh /tmp/scripts/cleanup.sh

# Make scripts executable and convert line endings
RUN chmod +x /tmp/scripts/*.sh && \
    dos2unix /tmp/scripts/*.sh

# Create some interesting directories to explore
RUN mkdir -p /var/secret_location /opt/hidden-data /etc/custom-config

# Explicitly set user to root
USER root

# Set up the service to run on port 4444
EXPOSE 4444

# Use the script from its writable location
CMD ["/tmp/scripts/entrypoint.sh"]
