FROM ubuntu:22.04


# Set up non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages and penetration testing tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    hydra \
    sqlmap \
    dirb \
    john \
    netcat-traditional \
    curl \
    wget \
    vim \
    tmux \
    net-tools \
    iputils-ping \
    dnsutils \
    whois \
    python3-pip \
    sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create kali user with password kali
RUN useradd -m -s /bin/bash kali && \
    echo "kali:kali" | chpasswd && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Copy attack scripts
COPY scripts /home/kali/scripts/
RUN chmod +x /home/kali/scripts/*.sh
RUN chown -R kali:kali /home/kali/scripts

# Create helper files and welcome message
RUN echo "Welcome to the Corporate Network Breach Challenge - Attacker Container" > /etc/motd
RUN echo "Target: \$DEFENSE_CONTAINER_HOST" > /home/kali/target.txt
RUN echo 'PS1="\[\033[1;31m\]Attacker[\w]$ \[\033[0m\]"' >> /home/kali/.bashrc

# Keep container running
CMD ["sleep", "infinity"]
