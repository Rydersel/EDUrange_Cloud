# Use a smaller base image
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
RUN useradd -m -s /bin/bash challengeuser && \
    mkdir -p /home/challengeuser/Documents /home/challengeuser/Downloads /home/challengeuser/Pictures && \
    touch /home/challengeuser/Documents/doc1.txt /home/challengeuser/Documents/doc2.txt && \
    touch /home/challengeuser/Downloads/file1.zip /home/challengeuser/Downloads/file2.tar.gz && \
    touch /home/challengeuser/Pictures/image1.jpg /home/challengeuser/Pictures/image2.png && \
    mkdir -p /home/challengeuser/.config /home/challengeuser/.local/share && \
    touch /home/challengeuser/.config/config1.conf /home/challengeuser/.config/config2.conf && \
    touch /home/challengeuser/.local/share/data1.dat /home/challengeuser/.local/share/data2.dat

# Copy the entrypoint script
COPY entrypoint.sh /home/challengeuser/entrypoint.sh
RUN chmod +x /home/challengeuser/entrypoint.sh

# Switch to the new user
USER challengeuser
WORKDIR /home/challengeuser

# Set the command to run the entrypoint script
CMD ["/home/challengeuser/entrypoint.sh"]
