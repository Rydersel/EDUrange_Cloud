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

# Make user
RUN useradd -m user && \
    echo "user:user" | chpasswd && \
    adduser user sudo

# Misconfigure sudo to allow 'user' to run only vim as root without a password
RUN echo 'user ALL=(root) NOPASSWD: /usr/bin/vim' > /etc/sudoers.d/user_vim && \
    chmod 0440 /etc/sudoers.d/user_vim

# Ensure the user doesn't have broader sudo privileges
RUN sed -i '/^%sudo/d' /etc/sudoers

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose SSH port
EXPOSE 22

# Start SSH service
CMD ["/entrypoint.sh"]
