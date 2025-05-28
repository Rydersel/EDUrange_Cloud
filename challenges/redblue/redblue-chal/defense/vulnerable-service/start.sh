#!/bin/bash

# This script starts a vulnerable service on port 4444

echo "Starting vulnerable service on port 4444"

# Create the vulnerable service script
cat > /opt/vuln-service/vuln-service.py << EOL
#!/usr/bin/env python3

import socket
import os
import subprocess
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(filename='/var/log/vuln-service.log', level=logging.INFO, 
                   format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration
HOST = '0.0.0.0'  # Listen on all interfaces
PORT = 4444       # Port to listen on

# Create socket
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

try:
    server_socket.bind((HOST, PORT))
    server_socket.listen(5)
    logging.info(f"Vulnerable service started on {HOST}:{PORT}")
    print(f"Vulnerable service started on {HOST}:{PORT}")

    while True:
        # Accept connection
        client_socket, client_address = server_socket.accept()
        logging.info(f"Connection from {client_address}")
        
        try:
            # Send welcome message
            welcome = "Welcome to the Corporate File Service v1.2\\n"
            welcome += "Enter command or 'help' for available commands:\\n"
            client_socket.send(welcome.encode())
            
            while True:
                # Receive command
                data = client_socket.recv(1024).decode().strip()
                if not data:
                    break
                
                logging.info(f"Received command: {data}")
                
                if data == 'help':
                    help_text = "Available commands:\\n"
                    help_text += "  help - Show this message\\n"
                    help_text += "  list - List available files\\n"
                    help_text += "  get <filename> - Get file content\\n"
                    help_text += "  run <command> - Run system command (admin only)\\n"
                    help_text += "  exit - Close connection\\n"
                    client_socket.send(help_text.encode())
                    
                elif data == 'list':
                    try:
                        # Vulnerable implementation - directory listing
                        files = os.listdir('/opt/vuln-service/files')
                        file_list = "Available files:\\n"
                        for file in files:
                            file_list += f"  - {file}\\n"
                        client_socket.send(file_list.encode())
                    except Exception as e:
                        error_msg = f"Error listing files: {str(e)}\\n"
                        client_socket.send(error_msg.encode())
                        
                elif data.startswith('get '):
                    # Vulnerable implementation - path traversal
                    filename = data[4:]
                    try:
                        # No validation of filename - vulnerable to path traversal
                        with open(f'/opt/vuln-service/files/{filename}', 'r') as f:
                            content = f.read()
                            client_socket.send(f"Content of {filename}:\\n{content}\\n".encode())
                    except Exception as e:
                        error_msg = f"Error reading file: {str(e)}\\n"
                        client_socket.send(error_msg.encode())
                
                elif data.startswith('run '):
                    # Vulnerable implementation - command injection
                    cmd = data[4:]
                    client_socket.send(f"Running command: {cmd}\\n".encode())
                    
                    try:
                        # Vulnerable to command injection
                        output = subprocess.check_output(cmd, shell=True)
                        client_socket.send(output)
                        client_socket.send("\\nCommand executed successfully\\n".encode())
                    except Exception as e:
                        error_msg = f"Error executing command: {str(e)}\\n"
                        client_socket.send(error_msg.encode())
                
                elif data == 'exit':
                    client_socket.send("Closing connection. Goodbye!\\n".encode())
                    break
                    
                else:
                    client_socket.send("Unknown command. Type 'help' for available commands.\\n".encode())
        
        except Exception as e:
            logging.error(f"Error handling client: {str(e)}")
        finally:
            client_socket.close()
            logging.info(f"Connection from {client_address} closed")

except Exception as e:
    logging.error(f"Server error: {str(e)}")
finally:
    server_socket.close()
    logging.info("Server stopped")
EOL

# Set up sample files
mkdir -p /opt/vuln-service/files
echo "This is a sample file." > /opt/vuln-service/files/sample.txt
echo "User list for reference only." > /opt/vuln-service/files/users.txt
echo "admin:Corp2023!" >> /opt/vuln-service/files/users.txt
echo "employee:password123" >> /opt/vuln-service/files/users.txt

# Make the script executable
chmod +x /opt/vuln-service/vuln-service.py

# Run the service
python3 /opt/vuln-service/vuln-service.py 