FROM ubuntu:22.04

# Set non-interactive mode for apt
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    netcat-traditional \
    tmux \
    curl \
    wget \
    gnupg \
    dos2unix \
    sudo \
    vim \
    ssh \
    openssh-client \
    nmap \
    && rm -rf /var/lib/apt/lists/*

# Install Metasploit Framework (minimal installation)
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

# Copy exploit script and other files
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && \
    dos2unix /entrypoint.sh

# Set working directory and switch to non-root user
WORKDIR /home/kali


# Ensure proper ownership
RUN chown -R kali:kali /home/kali

CMD ["/entrypoint.sh"]
