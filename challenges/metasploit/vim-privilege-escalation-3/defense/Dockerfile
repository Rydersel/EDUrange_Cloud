# Use an official Ubuntu base image
FROM ubuntu:latest

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive


# Update and install sudo, vim and openssh-server
RUN apt-get update && \
    apt-get install -y sudo vim openssh-server && \
    mkdir /var/run/sshd

# Configure SSH to allow password authentication
RUN sed -i 's/^#*\(PermitRootLogin\s*\).*$/\1yes/' /etc/ssh/sshd_config && \
    sed -i 's/^#*\(PasswordAuthentication\s*\).*$/\1yes/' /etc/ssh/sshd_config

# Make user and set restricted bash as shell
RUN useradd -m user -s /bin/rbash && \
    echo "user:user" | chpasswd && \
    adduser user sudo

# Create hidden directory and copy vim
RUN mkdir -p /opt/.hidden && \
    cp /usr/bin/vim /opt/.hidden/editor && \
    chmod 755 /opt/.hidden/editor

# Create restricted PATH directory and basic binaries
RUN mkdir -p /home/user/bin && \
    chown user:user /home/user/bin && \
    chmod 755 /home/user/bin

# Misconfigure sudo to allow 'user' to run only hidden vim as root without a password
RUN echo 'user ALL=(root) NOPASSWD: /opt/.hidden/editor' > /etc/sudoers.d/user_vim && \
    chmod 0440 /etc/sudoers.d/user_vim

# Ensure the user doesn't have broader sudo privileges
RUN sed -i '/^%sudo/d' /etc/sudoers

# Create secret directory for encoded flag
RUN mkdir -p /opt/.secret

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose SSH port
EXPOSE 22

# Start SSH service
CMD ["/entrypoint.sh"]
