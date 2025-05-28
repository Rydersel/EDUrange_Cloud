# docker buildx build --platform linux/amd64,linux/arm64 -t registry.edurange.cloud/challenges/bandit6 . --push


FROM debian:bullseye-slim

# Install basic utilities in a single RUN command and clean up afterwards to reduce image size
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    apt-utils \
    curl \
    wget \
    vim \
    git \
    sudo \
    lsb-release && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create a user and set up directory structure in a single RUN command
RUN useradd -m -s /bin/bash challengeuser

# Provide Starting Hints
COPY readme /home/challengeuser/

# Copy the entrypoint and cleanup scripts
COPY entrypoint.sh /home/challengeuser/entrypoint.sh
COPY cleanup.sh /home/challengeuser/.cleanup.sh
RUN touch /var/lib/dpkg/info/bandit7.password
RUN chmod +x /home/challengeuser/entrypoint.sh && \
    chmod +x /home/challengeuser/.cleanup.sh && \
    chmod a=rw /var/lib/dpkg/info/bandit7.password && \
    chown challengeuser:challengeuser /var/lib/dpkg/info/bandit7.password

# Switch to the new user
USER challengeuser
WORKDIR /home/challengeuser

# Set the command to run the entrypoint script
CMD ["/home/challengeuser/entrypoint.sh"]
