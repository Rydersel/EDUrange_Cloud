FROM ubuntu:22.04

# Set non-interactive mode for apt
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ssh \
    curl \
    wget \
    gnupg \
    dos2unix \
    sudo \
    tmux \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Install Metasploit Framework
RUN curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall \
    && chmod +x msfinstall \
    && ./msfinstall \
    && rm msfinstall

# Add msfvenom to PATH
ENV PATH="/opt/metasploit-framework/bin:${PATH}"

# Set up a non-root user with sudo privileges
RUN useradd -m -s /bin/bash kali && \
    echo "kali:kali" | chpasswd && \
    adduser kali sudo && \
    mkdir -p /etc/sudoers.d && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kali && \
    chmod 440 /etc/sudoers.d/kali

# Create directory for challenge files
RUN mkdir -p /home/kali/challenge
WORKDIR /home/kali/challenge

# Copy password list and helper scripts
COPY passwords.txt /home/kali/challenge/
COPY entrypoint.sh /entrypoint.sh
COPY hint.txt /home/kali/challenge/

# Make sure files have correct permissions
RUN chmod +x /entrypoint.sh && \
    dos2unix /entrypoint.sh && \
    chown -R kali:kali /home/kali

# Set user and working directory
USER kali
WORKDIR /home/kali

CMD ["/entrypoint.sh"] 