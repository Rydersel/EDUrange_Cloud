FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary tools for the challenge
RUN apt-get update && apt-get install -y \
    nmap \
    netcat-openbsd \
    curl \
    wget \
    ssh \
    nano \
    vim \
    python3 \
    python3-pip \
    sudo \
    git \
    postgresql \
    postgresql-contrib \
    build-essential \
    libpq-dev \
    zlib1g-dev \
    libpcap-dev \
    libsqlite3-dev \
    ruby \
    ruby-dev \
    bundler \
    sqlmap \
    && rm -rf /var/lib/apt/lists/*

# Set up PostgreSQL for Metasploit
RUN service postgresql start && \
    su postgres -c "createuser -drs root" && \
    su postgres -c "createdb -O root msf" && \
    su postgres -c "createdb -O root msf_test"

# Install Metasploit Framework
RUN cd /opt && \
    git clone --depth=1 https://github.com/rapid7/metasploit-framework.git && \
    cd metasploit-framework && \
    gem install bundler && \
    bundle install && \
    ln -s /opt/metasploit-framework/msfconsole /usr/local/bin/msfconsole && \
    ln -s /opt/metasploit-framework/msfvenom /usr/local/bin/msfvenom

# Create a user for the challenge
RUN useradd -m -s /bin/bash -G sudo kali && \
    echo "kali:kali" | chpasswd && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up working directory
WORKDIR /home/kali
RUN mkdir -p /home/kali/tools

# Create example SQL injection payloads file
RUN mkdir -p /home/kali/payloads && \
    echo "' OR '1'='1\n' OR '1'='1' --\n' OR 1=1 --\n' UNION SELECT 1,2,3,4 --\n' UNION SELECT NULL,NULL,NULL,NULL --\n' UNION SELECT table_name,2,3,4 FROM information_schema.tables --\n' UNION SELECT column_name,2,3,4 FROM information_schema.columns WHERE table_name='flags' --\n' UNION SELECT flag_value,2,3,4 FROM flags --" > /home/kali/payloads/sql_injection.txt && \
    chown -R kali:kali /home/kali/payloads

# Create starter script for metasploit
RUN echo '#!/bin/bash\nservice postgresql start\nmsfconsole "$@"' > /usr/local/bin/msf && \
    chmod +x /usr/local/bin/msf

# Add a help file to guide students
RUN echo -e "# SQL Injection Challenge Help\n\n## Available Tools\n- curl: Web content retrieval and form submission\n- sqlmap: Automated SQL injection tool\n- metasploit-framework: Exploitation framework with SQL injection modules\n\n## Helpful Commands\n- Test basic SQL injection: curl -s 'http://defense-container/search.php?keyword=1%27%20OR%20%271%27=%271'\n- Use SQLMap: sqlmap -u 'http://defense-container/search.php?keyword=1' --dbs\n- Start Metasploit: msf\n- Use Metasploit WMAP scanner: search wmap\n- Use Metasploit SQL injection modules: search type:auxiliary name:sql\n\n## SQL Injection Payloads\nCommon payloads are available in /home/kali/payloads/sql_injection.txt\n" > /home/kali/HELP.md && \
    chown kali:kali /home/kali/HELP.md

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to the kali user
USER kali

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"] 