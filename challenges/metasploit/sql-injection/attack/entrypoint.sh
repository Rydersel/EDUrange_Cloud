#!/bin/bash

# Start PostgreSQL service for Metasploit
sudo service postgresql start

# Print banner
cat << "EOF"
 ____   ___  _       ___        _           _   _             
/ ___| / _ \| |     |_ _|_ __  (_) ___  ___| |_(_) ___  _ __  
\___ \| | | | |      | || '_ \ | |/ _ \/ __| __| |/ _ \| '_ \ 
 ___) | |_| | |___   | || | | || |  __/ (__| |_| | (_) | | | |
|____/ \__\_\_____|_|___|_| |_|/ |\___|\___|\__|_|\___/|_| |_|
                             |__/                              
Challenge: SQL Injection Vulnerability Exploitation
================================================================
EOF

echo -e "\nWelcome to the SQL Injection Challenge!"
echo -e "Your task is to exploit SQL injection vulnerabilities in a web application and extract the flag.\n"

echo -e "Target System: defense-[competition-id]\n"

echo -e "Available tools:"
echo "  - curl/wget: Web content retrieval"
echo "  - sqlmap: Automated SQL injection tool"
echo "  - metasploit-framework: Exploitation tools (use 'msf' command)"
echo "  - /home/kali/payloads/sql_injection.txt: Common SQL injection payloads"
echo "  - And many more...\n"

echo -e "Getting Started:"
echo "  1. Explore the web application (curl)"
echo "  2. Identify SQL injection points in forms and URL parameters"
echo "  3. Exploit the vulnerabilities to access the database"
echo "  4. Extract the flag from the database"
echo -e "\nSee HELP.md for more information and tips.\n"

# Create useful aliases
cat >> /home/kali/.bash_profile << EOL
# Useful aliases
alias msf='sudo service postgresql start && msfconsole'
alias connect='nc'
alias web='curl -s'
alias sqltest='curl -s "http://defense-[competition-id]/search.php?keyword=1%27%20OR%20%271%27=%271"'
alias sqlinfo='sqlmap -u "http://defense-[competition-id]/search.php?keyword=1" --dbs --batch'
alias help='cat /home/kali/HELP.md | less'
EOL

# Source bash profile
source /home/kali/.bash_profile

# Stay alive
if [[ $1 == "shell" ]]; then
  /bin/bash
else
  # Keep container running
  tail -f /dev/null
fi 