FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    bash \
    dos2unix \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set up SSH server
RUN mkdir /var/run/sshd
RUN echo 'PermitRootLogin no' >> /etc/ssh/sshd_config
RUN echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config

# Create target user with weak password
RUN useradd -m -s /bin/bash target && \
    echo "target:password123" | chpasswd && \
    mkdir -p /home/target && \
    chown -R target:target /home/target

# Copy scripts
COPY entrypoint.sh /entrypoint.sh
COPY flag-setup.sh /flag-setup.sh

# Make scripts executable
RUN chmod +x /entrypoint.sh /flag-setup.sh && \
    dos2unix /entrypoint.sh /flag-setup.sh

# Expose SSH port
EXPOSE 22

CMD ["/entrypoint.sh"] 