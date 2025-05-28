FROM ubuntu:22.04

# Set up non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages and basic networking tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    netcat-traditional \
    curl \
    wget \
    vim \
    nano \
    tmux \
    net-tools \
    iputils-ping \
    dnsutils \
    cron \
    sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create kali user with password kali
RUN useradd -m -s /bin/bash kali && \
    echo "kali:kali" | chpasswd && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Copy attack scripts and guides
COPY scripts /home/kali/scripts/
COPY guides /home/kali/guides/

# Set proper permissions
RUN chmod +x /home/kali/scripts/*.sh

# Create symlinks to common scripts
RUN ln -s /home/kali/scripts/help.sh /usr/local/bin/help
RUN ln -s /home/kali/scripts/scan-target.sh /usr/local/bin/scan-target
RUN ln -s /home/kali/scripts/check_security.sh /usr/local/bin/check-security

# Setup bash profile for kali user with convenient aliases
RUN echo 'PATH=$PATH:/home/kali/scripts' >> /home/kali/.bashrc
RUN echo 'alias scan="scan-target"' >> /home/kali/.bashrc
RUN echo 'alias help-challenge="help"' >> /home/kali/.bashrc
RUN echo 'alias check="check-security"' >> /home/kali/.bashrc

# Set welcome message
RUN echo "echo '================================================'" >> /home/kali/.bashrc
RUN echo "echo 'Welcome to Network Defenders: CLI Edition'" >> /home/kali/.bashrc
RUN echo "echo 'Type \"help\" for available commands and guidance'" >> /home/kali/.bashrc
RUN echo "echo '================================================'" >> /home/kali/.bashrc
RUN echo "echo" >> /home/kali/.bashrc

# Set working directory
WORKDIR /home/kali

# Set the default user
USER kali

# Keep container running
CMD ["sleep", "infinity"]
