import os
from kubernetes import client, config, stream
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit

# Init Kubernetes client
config.load_incluster_config()
v1 = client.CoreV1Api()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!' #prolly should change at some point
socketio = SocketIO(app, cors_allowed_origins="*")

# Get the name of the challenge container from the environment variable
challenge_container_name = os.getenv('CHALLENGE_CONTAINER_NAME')

sessions = {}

def run_command(command, cwd):
    full_command = f'cd {cwd} && {command}'
    exec_command = ['/bin/sh', '-c', full_command]

    try:
        exec_response = stream.stream(v1.connect_get_namespaced_pod_exec,
                                      name='challenge-pod',
                                      namespace='default',
                                      command=exec_command,
                                      container=challenge_container_name,
                                      stderr=True, stdin=False,
                                      stdout=True, tty=False)
        return exec_response
    except client.ApiException as e:
        return {e}

@socketio.on('connect')
def handle_connect():
    sid = request.sid
    sessions[sid] = {'cwd': '/'}
    emit('response', 'Connected to server\r\n', room=sid)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in sessions:
        del sessions[sid]

@socketio.on('command')
def handle_command(data):
    sid = request.sid
    command = data.strip()
    if command:
        if sid in sessions:
            cwd = sessions[sid]['cwd']
            if command.startswith('cd'):
                parts = command.split()
                if len(parts) == 1 or parts[1] == '~':
                    sessions[sid]['cwd'] = '/'
                else:
                    new_dir = os.path.normpath(os.path.join(cwd, parts[1]))
                    exec_result = run_command(f'cd {new_dir} && pwd', cwd)
                    if "Exception" not in exec_result:
                        sessions[sid]['cwd'] = new_dir.strip()
                        response = exec_result + '\n'
                    else:
                        response = f"cd: no such file or directory: {parts[1]}\n"
                    emit('response', response, room=sid)
                    return
            else:
                exec_result = run_command(command, cwd)
                response = exec_result + '\n'
                emit('response', response, room=sid)

@app.route('/execute', methods=['POST'])
def execute_command():
    data = request.json
    command = data.get('command')
    sid = request.remote_addr  # Use remote address as a simple session ID
    if sid not in sessions:
        sessions[sid] = {'cwd': '/'}
    cwd = sessions[sid]['cwd']
    if command:
        if command.startswith('cd'):
            parts = command.split()
            if len(parts) == 1 or parts[1] == '~':
                sessions[sid]['cwd'] = '/'
            else:
                new_dir = os.path.normpath(os.path.join(cwd, parts[1]))
                exec_result = run_command(f'cd {new_dir} && pwd', cwd)
                if "Exception" not in exec_result:
                    sessions[sid]['cwd'] = new_dir.strip()
                    response = exec_result + '\n'
                else:
                    response = f"cd: no such file or directory: {parts[1]}\n"
                return jsonify({"output": response})
        else:
            exec_instance = run_command(command, cwd)
            return jsonify({"output": exec_instance + '\n'})
    return jsonify({"error": "Command is required"}), 400

@app.route('/')
def index():
    return "WebSocket Server for Docker Commands"

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
