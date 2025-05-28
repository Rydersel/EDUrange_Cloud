#!/usr/bin/env python3

import socket
import os
import subprocess
import time
import json
import sys
import threading
import re
import base64
import random
import string
from datetime import datetime

# Set up logging
def log_activity(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        os.makedirs('/var/log/challenge', exist_ok=True)
        with open('/var/log/challenge/activity.log', 'a') as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception as e:
        print(f"Error writing to log: {e}")
    print(f"[{timestamp}] {message}")

# Global state variables
SECURITY_LEVEL = int(os.environ.get('SECURITY_LEVEL', '5'))
authenticated_users = {}  # Store authenticated sessions
active_connections = []   # List of active client sockets for broadcasting updates
security_tokens = {}      # Store valid security tokens for port 4444
validated_keys = set()    # Store validated access keys
flag_pieces = {           # Store the distributed flag pieces
    'part1': 'flag{n3tw0rk_',
    'part2': 'd3f3nd3rs_',
    'part3': 'ch4ll3ng3_',
    'part4': 'c0mpl3t3d}'
}

# Lock for thread safety when modifying security level
security_level_lock = threading.Lock()

# Service state file
STATE_FILE = '/opt/service/state.json'

def load_state():
    global SECURITY_LEVEL
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r') as f:
                data = json.load(f)
                SECURITY_LEVEL = data.get('security_level', SECURITY_LEVEL)
                log_activity(f"Loaded state: Security Level {SECURITY_LEVEL}")
        else:
            save_state()
            log_activity("Created new state file")
    except Exception as e:
        log_activity(f"Error loading state: {str(e)}")

def save_state():
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump({
                'security_level': SECURITY_LEVEL,
                'last_updated': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }, f)
        log_activity(f"Saved state: Security Level {SECURITY_LEVEL}")
    except Exception as e:
        log_activity(f"Error saving state: {str(e)}")

# Initialize state
load_state()

# Generate a random security token
def generate_security_token():
    token = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    security_tokens[token] = True
    return token

# ROT13 Encoder for password obfuscation
def rot13(text):
    result = ""
    for char in text:
        if 'a' <= char <= 'z':
            result += chr((ord(char) - ord('a') + 13) % 26 + ord('a'))
        elif 'A' <= char <= 'Z':
            result += chr((ord(char) - ord('A') + 13) % 26 + ord('A'))
        else:
            result += char
    return result

# Broadcast message to all connected clients
def broadcast_message(message):
    for client in list(active_connections):
        try:
            client.send(message.encode())
        except:
            # If sending fails, the client might be disconnected
            if client in active_connections:
                active_connections.remove(client)

# Update security level and notify all clients
def update_security_level(new_level, source_addr="system"):
    global SECURITY_LEVEL
    
    with security_level_lock:
        if new_level >= SECURITY_LEVEL:
            return False  # Only allow decreasing security level
        
        old_level = SECURITY_LEVEL
        SECURITY_LEVEL = new_level
        save_state()
        
        # Log the change
        log_activity(f"Security level decreased from {old_level} to {new_level} by {source_addr}")
        
        # Broadcast the change to all clients
        message = f"\n\n[ALERT] Security level decreased to {new_level}! New commands may be available now.\nType 'help' to see available commands.\n\n> "
        broadcast_message(message)
        
        return True

# Command handlers
def handle_status(client_socket, args, addr):
    response = f"""
Network Service Status:
  Security Level: {SECURITY_LEVEL}
  Service: RUNNING
"""
    client_socket.send(response.encode())
    return True

def handle_help(client_socket, args, addr):
    # Basic commands available at all security levels
    commands = [
        "help - Show this help message",
        "status - Show service status",
        "exit - Close connection"
    ]
    
    # Security level 4 or lower
    if SECURITY_LEVEL <= 4:
        commands.append("list - List available services")
        commands.append("explore <service> [options] - Explore service details")
    
    # Security level 3 or lower
    if SECURITY_LEVEL <= 3:
        commands.append("data <options> - Access system data")
    
    # Security level 2 or lower
    if SECURITY_LEVEL <= 2:
        commands.append("login <username> <password> - Authenticate to system")
        commands.append("run <command> - Run system command (authenticated users only)")
    
    # Security level 1 - final stage
    if SECURITY_LEVEL == 1:
        commands.append("debug <options> - Access advanced debugging features")
    
    response = "Available commands:\n  " + "\n  ".join(commands)
    client_socket.send(response.encode())
    return True

def handle_scan(client_socket, args, addr):
    # Hidden special function for port 8888
    # Generates a token for accessing port 4444
    token = generate_security_token()
    response = f"""
Full Port Scan Results:
  22: SSH     [OPEN]
  80: HTTP    [CLOSED]
  8888: UNKNOWN [OPEN] *NEW*
  4444: CUSTOM  [FILTERED]
  
Security Token Service (Port 8888) Response:
  STATUS: OK
  TOKEN: {token}
  
Note: Use token to access port 4444 service
Example: nc {os.environ.get('HOSTNAME', 'defense-service')} 4444 TOKEN={token}
"""
    client_socket.send(response.encode())
    return True

def handle_list(client_socket, args, addr):
    if SECURITY_LEVEL > 4:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
        
    response = """Available services:
  - registry.service
  - database.service
  - messaging.service 
  - controller.service
  - network.controller
  - backup.service
"""
    client_socket.send(response.encode())
    return True

def handle_explore(client_socket, args, addr):
    if SECURITY_LEVEL > 4:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
        
    if len(args) < 1:
        client_socket.send("Usage: explore <service> [options]\n".encode())
        return True
        
    service = args[0].lower()
    
    # Get options if provided
    options = {}
    for arg in args[1:]:
        if arg.startswith('--'):
            parts = arg[2:].split('=', 1)
            key = parts[0]
            value = parts[1] if len(parts) > 1 else 'true'
            options[key] = value
    
    if service == "registry.service":
        response = """Registry Service Information:
Type: Discovery
Status: Active
Description: Service registry and discovery system
Available Services:
  - registry.service: Service discovery
  - database.service: Data storage
  - messaging.service: Message queue
  - controller.service: System control
  - network.controller: Network operations
  - backup.service: Backup utilities

Use 'explore <service_name>' to get more information about a specific service.
Some services may accept additional parameters, such as --depth or --mode.
"""
        client_socket.send(response.encode())
        
    elif service == "network.controller":
        depth = options.get('depth', 'basic')
        
        if depth == 'basic':
            response = """Network Controller:
Type: Network Management
Status: Active
Description: Controls network operations and security

Note: Use --depth=full for more detailed information.
"""
        elif depth == 'full':
            # Successful exploration that triggers security level decrease
            if SECURITY_LEVEL > 3:
                update_security_level(3, addr)
                response = """Network Controller (FULL DETAILS):
Type: Network Management
Status: Active
Description: Controls network operations and security
API Access: Enabled
Security Level: DECREASED TO 3
Vulnerability: Detected in data access layer

SECURITY ALERT: Unauthorized access to network controller detected.
Data access layer is now exposed. Use 'data' command to explore.
"""
            else:
                response = """Network Controller (FULL DETAILS):
Type: Network Management
Status: Active
Description: Controls network operations and security
API Access: Enabled
Security Level: ALREADY COMPROMISED
"""
        else:
            response = f"Invalid depth parameter: {depth}\nUse --depth=basic or --depth=full"
            
        client_socket.send(response.encode())
        
    else:
        # Other services don't provide useful information
        if service == "controller.service":
            response = "Controller Service: Basic system control functions\nNo vulnerabilities detected."
        elif service == "database.service":
            response = "Database Service: Data storage and retrieval\nAccess denied: Authentication required."
        elif service == "messaging.service":
            response = "Messaging Service: Internal message queue\nNo public endpoints available."
        elif service == "backup.service":
            response = "Backup Service: Automated backup utilities\nScheduled backup running. No user access points detected."
        else:
            response = f"Service '{service}' not found or cannot be explored."
            
        client_socket.send(response.encode())
        
    return True

def handle_data(client_socket, args, addr):
    if SECURITY_LEVEL > 3:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
        
    if len(args) < 1:
        client_socket.send("Usage: data <option>\nTry 'data --help' for more information.\n".encode())
        return True
    
    option = args[0].lower()
    
    if option == "--help":
        response = """Data command options:
  --help            Show this help message
  --list            List available data types
  --show-users      Show information about system users
  --show-config     Show system configuration
  --validate-key    Validate access key for authentication
"""
        client_socket.send(response.encode())
    elif option == "--list":
        response = """Available data types:
  users        User information
  config       System configuration
  keys         Authentication keys
  logs         System logs (requires elevated privileges)
"""
        client_socket.send(response.encode())
    elif option == "--show-users":
        response = """User information:
# Network Service Users
- user (regular)
- admin (administrator)

Note: For security reasons, passwords are not displayed.
Check configuration files for access information.
"""
        client_socket.send(response.encode())
    elif option == "--show-config":
        # This shows encoded passwords that students need to decode
        admin_pass_b64 = base64.b64encode("SecurePass2023!".encode()).decode()
        admin_pass_rot13 = rot13(admin_pass_b64)
        
        response = f"""System Configuration:
# Authentication Configuration
auth.method=basic
auth.users.user.type=regular
auth.users.admin.type=administrator

# Encoded Credentials (Format: base64 -> rot13)
auth.users.user.key=cnNjeWFxYnpSRUZVam5seXdiZ25seQ==
auth.users.admin.key={admin_pass_rot13}

# Access Control
access.method=key-validation
access.required=true

Use 'data --validate-key <key>' with the decoded admin key to unlock authentication.
"""
        client_socket.send(response.encode())
    elif option == "--validate-key":
        if len(args) < 2:
            client_socket.send("Error: Key required. Usage: data --validate-key <access_key>\n".encode())
            return True
            
        access_key = args[1]
        
        # Check if this is the correct admin password
        if access_key == "SecurePass2023!":
            validated_keys.add(access_key)
            
            # Lower security level to 2 if currently higher
            if SECURITY_LEVEL > 2:
                update_security_level(2, addr)
                response = """
KEY VALIDATION SUCCESSFUL!
Access granted to authentication system.
Security level decreased to 2.

You can now use the 'login' command with the validated credentials.
"""
            else:
                response = """
KEY VALIDATION SUCCESSFUL!
Access granted to authentication system.
Security level already at or below 2.
"""
            client_socket.send(response.encode())
        else:
            response = "KEY VALIDATION FAILED. Invalid key provided.\n"
            client_socket.send(response.encode())
    else:
        client_socket.send(f"Unknown option: {option}\nTry 'data --help' for more information.\n".encode())
        
    return True

def handle_login(client_socket, args, addr):
    if SECURITY_LEVEL > 2:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
        
    if len(args) < 2:
        client_socket.send("Usage: login <username> <password>\n".encode())
        return True
        
    username = args[0]
    password = args[1]
    
    # Check if the password has been validated with the key validation
    if password == "SecurePass2023!" and password in validated_keys:
        if username == "admin":
            authenticated_users[addr] = "admin"
            response = "Authentication successful. Welcome, admin!"
            client_socket.send(response.encode())
            log_activity(f"Admin login successful from {addr}")
        elif username == "user":
            authenticated_users[addr] = "user"
            response = "Authentication successful. Welcome, user! Note: Limited privileges available."
            client_socket.send(response.encode())
            log_activity(f"User login successful from {addr}")
        else:
            response = "Authentication failed. Invalid username."
            client_socket.send(response.encode())
    else:
        if password == "SecurePass2023!" and password not in validated_keys:
            response = "Authentication failed. Password correct but key not validated.\nUse 'data --validate-key <key>' first."
        else:
            response = "Authentication failed. Invalid username or password."
        client_socket.send(response.encode())
        log_activity(f"Failed login attempt from {addr}: {username}")
        
    return True

def handle_run(client_socket, args, addr):
    if SECURITY_LEVEL > 2:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
        
    if addr not in authenticated_users:
        client_socket.send("Error: Authentication required for this command.\n".encode())
        return True
        
    if len(args) < 1:
        client_socket.send("Usage: run <command>\n".encode())
        return True
        
    command = args[0]
    command_string = " ".join(args)
    
    # Enhanced command injection protection - filter common injection characters
    if ';' in command_string or '|' in command_string or '&&' in command_string:
        client_socket.send("Error: Invalid characters detected. Command injection attempt blocked.\n".encode())
        return True
    
    # Check for advanced bypass techniques
    has_bypass = False
    privilege_escalation = False
    
    # Check for command substitution - allowed but detected
    if '`' in command_string or '$(' in command_string or '${' in command_string:
        has_bypass = True
        log_activity(f"Command injection bypass detected from {addr}: {command_string}")
    
    # Check for privilege escalation attempt
    if ('id' in command_string.lower() or 'sudo' in command_string.lower() or 
        'root' in command_string.lower() or 'admin' in command_string.lower()):
        privilege_escalation = True
        log_activity(f"Privilege escalation attempt detected from {addr}: {command_string}")
    
    # If admin and both bypass and privilege escalation are detected, decrease security level
    if authenticated_users[addr] == "admin" and has_bypass and privilege_escalation:
        if SECURITY_LEVEL > 1:
            update_security_level(1, addr)
            client_socket.send("Advanced exploitation detected! Security level reduced to minimum.\n".encode())
    
    # Pretend to execute command
    client_socket.send(f"Running command: {command_string}\n".encode())
    
    # Use a dictionary to simulate command output
    command_outputs = {
        "backup.sh": "Backup process started. Archiving system files...\nBackup completed successfully.",
        "status": "All services running normally.\nSystem load: 0.75, 0.65, 0.42",
        "restart": "Service restart initiated...\nService restarted successfully.",
        "update": "Checking for updates...\nNo updates available."
    }
    
    # Add fake output for basic commands
    if command in command_outputs:
        client_socket.send(f"{command_outputs[command]}\n".encode())
    else:
        client_socket.send("Command not recognized by the service.\n".encode())
    
    # If command bypass is detected, simulate the injected command
    if has_bypass:
        # Extract what would be executed in the bypass
        if '`' in command_string:
            match = re.search(r'`(.*?)`', command_string)
            if match:
                injected_cmd = match.group(1)
        elif '$(' in command_string:
            match = re.search(r'\$\((.*?)\)', command_string)
            if match:
                injected_cmd = match.group(1)
        else:
            injected_cmd = "unknown"
        
        # Very basic simulation of command output
        if "id" in injected_cmd:
            if authenticated_users[addr] == "admin":
                client_socket.send("uid=0(root) gid=0(root) groups=0(root)\n".encode())
            else:
                client_socket.send("uid=1001(user) gid=1001(user) groups=1001(user)\n".encode())
        elif "ls" in injected_cmd:
            if "/flags" in injected_cmd or "/opt/flags" in injected_cmd:
                client_socket.send("flag_part1.txt\nflag_part2.txt\nflag_part3.txt\ndecoy1.txt\n".encode())
            else:
                client_socket.send("bin\nboot\ndev\netc\nflags\nhome\nlib\nmedia\nmnt\nopt\nproc\nroot\nrun\nsbin\nsrv\nsys\ntmp\nusr\nvar\n".encode())
        elif "whoami" in injected_cmd:
            if authenticated_users[addr] == "admin":
                client_socket.send("root\n".encode())
            else:
                client_socket.send("user\n".encode())
        elif "pwd" in injected_cmd:
            client_socket.send("/opt/service\n".encode())
        elif "find" in injected_cmd and "flag" in injected_cmd:
            client_socket.send("/opt/flags/flag_part1.txt\n/opt/flags/flag_part2.txt\n/opt/flags/flag_part3.txt\n/home/user/flag_part4.txt\n/opt/flags/decoy1.txt\n".encode())
        elif "cat" in injected_cmd:
            if "flag_part1.txt" in injected_cmd:
                client_socket.send(f"{flag_pieces['part1']}\n".encode())
            elif "flag_part2.txt" in injected_cmd:
                client_socket.send(f"{flag_pieces['part2']}\n".encode())
            elif "flag_part3.txt" in injected_cmd:
                client_socket.send(f"{flag_pieces['part3']}\n".encode())
            elif "flag_part4.txt" in injected_cmd:
                client_socket.send(f"{flag_pieces['part4']}\n".encode())
            elif "decoy" in injected_cmd:
                client_socket.send("flag{th1s_1s_n0t_th3_r34l_fl4g}\n".encode())
    
    client_socket.send("Command executed successfully\n".encode())
    return True

def handle_debug(client_socket, args, addr):
    if SECURITY_LEVEL > 1:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True
    
    if len(args) < 1:
        response = """
Debug Mode - Usage:
  debug --help         : Show this help message
  debug --memory       : Show memory information
  debug --assemble     : Assemble flag pieces (requires specific parameters)
"""
        client_socket.send(response.encode())
        return True
    
    option = args[0].lower()
    
    if option == "--help":
        response = """
Debug Command Options:
  --help                                : Show this help message
  --memory                              : Show memory information
  --assemble --p1=X --p2=X --p3=X --p4=X : Assemble flag pieces
"""
        client_socket.send(response.encode())
    elif option == "--memory":
        response = f"""
Memory Analysis:
  Active connections: {len(active_connections)}
  Authenticated users: {len(authenticated_users)}
  Flag pieces stored: {len(flag_pieces)}
  
Hint: Flag pieces can be found in different locations:
  - Parts 1-3: File system under /opt/flags/
  - Part 4: User home directory
  
Use 'debug --assemble' with all pieces to construct the full flag.
"""
        client_socket.send(response.encode())
    elif option == "--assemble":
        # Check for all required parts
        all_pieces = True
        provided_pieces = {}
        
        for i in range(1, 5):
            piece_param = f"--p{i}"
            found = False
            
            for arg in args:
                if arg.startswith(piece_param + "="):
                    value = arg.split("=")[1]
                    provided_pieces[f'part{i}'] = value
                    found = True
                    break
            
            if not found:
                all_pieces = False
        
        if all_pieces:
            # Check if the pieces match the expected flag pieces
            correct_pieces = True
            for key, expected in flag_pieces.items():
                if key not in provided_pieces or provided_pieces[key] != expected:
                    correct_pieces = False
                    break
            
            if correct_pieces:
                flag = "".join(flag_pieces.values())
                response = f"""
CONGRATULATIONS!
You've successfully assembled all flag pieces and completed the challenge!

FINAL FLAG: {flag}

Challenge Complete!
"""
                client_socket.send(response.encode())
                log_activity(f"Client {addr} completed the challenge and found the flag!")
            else:
                response = "Error: Incorrect flag pieces provided. Double-check each piece."
                client_socket.send(response.encode())
        else:
            response = """
Error: Missing flag pieces.
Usage: debug --assemble --p1=PIECE1 --p2=PIECE2 --p3=PIECE3 --p4=PIECE4

Hint: Retrieve all flag pieces from the system first.
"""
            client_socket.send(response.encode())
    else:
        response = f"Unknown debug option: {option}\nTry 'debug --help' for information."
        client_socket.send(response.encode())
    
    return True

# Special handler for token validation at connection time
def validate_token(token):
    return token in security_tokens

# Command processor
def process_command(client_socket, command, addr):
    parts = command.strip().split()
    if not parts:
        return True
        
    cmd = parts[0].lower()
    args = parts[1:] if len(parts) > 1 else []
    
    handlers = {
        "status": handle_status,
        "help": handle_help,
        "list": handle_list,
        "explore": handle_explore,
        "data": handle_data,
        "login": handle_login,
        "run": handle_run,
        "debug": handle_debug,
        "scan": handle_scan  # Hidden command for port 8888
    }
    
    if cmd in handlers:
        return handlers[cmd](client_socket, args, addr)
    elif cmd == "exit":
        return False
    else:
        client_socket.send("Command not recognized. Type 'help' for available commands.\n".encode())
        return True

# Client handler function
def handle_client(client_socket, addr, is_token_validated=False, is_port_8888=False):
    log_activity(f"Client connected: {addr}")
    
    # Add to active connections for broadcasting
    active_connections.append(client_socket)
    
    # Special handling for port 8888 (token service)
    if is_port_8888:
        handle_scan(client_socket, [], addr)
        active_connections.remove(client_socket)
        client_socket.close()
        return
    
    # Check if token validation is required for port 4444
    if SECURITY_LEVEL == 5 and not is_token_validated:
        client_socket.send("Connection refused. Token required for access.\nHint: Find the security token service on another port.\n".encode())
        active_connections.remove(client_socket)
        client_socket.close()
        return
    
    # Send welcome message
    welcome_message = f"""
==== Network Defenders Vulnerable Service ====
Security Level: {SECURITY_LEVEL}
The lower the security level, the more vulnerable the system becomes.

Type 'help' for available commands.
"""
    client_socket.send(welcome_message.encode())
    
    # Main client interaction loop
    try:
        continue_session = True
        while continue_session:
            client_socket.send("\n> ".encode())
            data = client_socket.recv(1024).decode().strip()
            
            if not data:
                break
                
            log_activity(f"Command from {addr}: {data}")
            continue_session = process_command(client_socket, data, addr)
            
    except Exception as e:
        log_activity(f"Error handling client {addr}: {str(e)}")
    finally:
        # Clean up when client disconnects
        if client_socket in active_connections:
            active_connections.remove(client_socket)
            
        client_socket.close()
        log_activity(f"Client disconnected: {addr}")
        
        if addr in authenticated_users:
            del authenticated_users[addr]

# Port 8888 service - token generation service
def start_token_service():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    token_port = 8888
    
    try:
        server_socket.bind(('0.0.0.0', token_port))
        server_socket.listen(5)
        log_activity(f"Token service started on port {token_port}")
        
        while True:
            client_socket, addr = server_socket.accept()
            client_thread = threading.Thread(
                target=handle_client,
                args=(client_socket, f"{addr[0]}:{addr[1]}", True, True)
            )
            client_thread.daemon = True
            client_thread.start()
            
    except Exception as e:
        log_activity(f"Token service error: {str(e)}")
    finally:
        server_socket.close()
        log_activity("Token service shutdown")

# Main server function for port 4444
def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_port = 4444
    
    try:
        server_socket.bind(('0.0.0.0', server_port))
        server_socket.listen(5)
        log_activity(f"Network service started on port {server_port}")
        
        # Start the token service
        token_thread = threading.Thread(target=start_token_service)
        token_thread.daemon = True
        token_thread.start()
        
        while True:
            client_socket, addr = server_socket.accept()
            
            # Check for token in the first message
            data = client_socket.recv(1024).decode().strip()
            is_token_validated = False
            
            # If the system is already at security level 4 or lower, we don't need token validation
            if SECURITY_LEVEL <= 4:
                is_token_validated = True
            else:
                # Try to extract token from the connection message
                token_match = re.search(r'TOKEN=([A-Z0-9]{8})', data)
                if token_match:
                    token = token_match.group(1)
                    if validate_token(token):
                        is_token_validated = True
                        # Initially setting security level to 4 now that port 4444 is accessible
                        if SECURITY_LEVEL > 4:
                            update_security_level(4, f"{addr[0]}:{addr[1]}")
            
            client_thread = threading.Thread(
                target=handle_client,
                args=(client_socket, f"{addr[0]}:{addr[1]}", is_token_validated, False)
            )
            client_thread.daemon = True
            client_thread.start()
            
    except Exception as e:
        log_activity(f"Server error: {str(e)}")
    finally:
        server_socket.close()
        log_activity("Server shutdown")

if __name__ == "__main__":
    log_activity("Network service starting")
    start_server() 