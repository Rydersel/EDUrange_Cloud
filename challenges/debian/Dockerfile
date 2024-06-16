
# docker buildx build --platform linux/amd64,linux/arm64 -t gcr.io/edurangectf/debiantest . --push
FROM debian:latest

# Install basic utilities
RUN apt-get update && \
    apt-get install -y apt-utils \
    curl \
    wget \
    vim \
    git \
    sudo \
    lsb-release

# Clean up APT when done
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a user and set up sudo
RUN useradd -m -s /bin/bash user && \
    echo 'user:user' | chpasswd && adduser user sudo

# Set the working directory
WORKDIR /home/user

# Keep the container running by default
CMD ["sleep", "infinity"]
