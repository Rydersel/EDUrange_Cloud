import os
from kubernetes import client, config, stream
from flask import Flask, request, jsonify, json
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# Initialize Kubernetes client
config.load_incluster_config()
v1 = client.CoreV1Api()

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Get the name of the challenge pod and container from the environment variable
challenge_pod_name = os.getenv('CHALLENGE_POD_NAME')
challenge_container_name = "challenge-container"

sessions = {}


class PodExecutor:
    def __init__(self, pod_name, container_name, namespace='default'):
        self.pod_name = pod_name
        self.container_name = container_name
        self.namespace = namespace

    def execute(self, command, cwd):
        full_command = f'cd {cwd} && {command}'
        exec_command = ['/bin/sh', '-c', full_command]

        try:
            exec_response = stream.stream(v1.connect_get_namespaced_pod_exec,
                                          name=self.pod_name,
                                          namespace=self.namespace,
                                          command=exec_command,
                                          container=self.container_name,
                                          stderr=True, stdin=False,
                                          stdout=True, tty=False)
            return exec_response
        except client.ApiException as e:
            return f"Exception when calling CoreV1Api->connect_get_namespaced_pod_exec: {e}"


def filter_writable_directories(directories, cwd, executor):
    writable_dirs = []
    for directory in directories:
        exec_check_command = f'[ -w {directory} ] && echo "writable" || echo "not writable"'
        check_response = executor.execute(exec_check_command, cwd)
        if "writable" in check_response:
            writable_dirs.append(directory)
    return writable_dirs


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
            executor = PodExecutor(challenge_pod_name, challenge_container_name)

            if command.startswith('cd'):
                response = change_directory(command, cwd, executor)
                sessions[sid]['cwd'] = response['cwd']
            else:
                exec_result = executor.execute(command, cwd)
                response = {'output': exec_result + '\n'}

            emit('response', response['output'], room=sid)


def change_directory(command, cwd, executor):
    parts = command.split()
    if len(parts) == 1 or parts[1] == '~':
        new_cwd = '/'
    else:
        new_cwd = os.path.normpath(os.path.join(cwd, parts[1]))
        exec_result = executor.execute(f'cd {new_cwd} && pwd', cwd)
        if "Exception" in exec_result:
            return {'output': f"cd: no such file or directory: {parts[1]}\n", 'cwd': cwd}

    return {'output': f'{new_cwd}\n', 'cwd': new_cwd}


@app.route('/execute', methods=['POST'])
def execute_command():
    data = request.json
    command = data.get('command')
    show_writable_only = data.get('show_writable_only', False)
    sid = request.remote_addr  # Use remote address as a simple session ID
    if sid not in sessions:
        sessions[sid] = {'cwd': '/'}
    cwd = sessions[sid]['cwd']
    executor = PodExecutor(challenge_pod_name, challenge_container_name)

    if command:
        if command.startswith('cd'):
            response = change_directory(command, cwd, executor)
            sessions[sid]['cwd'] = response['cwd']
            return jsonify({"output": response['output']})
        else:
            exec_instance = executor.execute(command, cwd)
            # Normalize output for ls
            if command.strip() == 'ls':
                directories = exec_instance.split()
                if show_writable_only:
                    directories = filter_writable_directories(directories, cwd, executor)
                exec_instance = " ".join(directories)
            return jsonify({"output": exec_instance + '\n'})
    return jsonify({"error": "Command is required"}), 400


@app.route('/config', methods=['GET'])
def get_config():
    config = os.getenv('NEXT_PUBLIC_APPS_CONFIG', '[]')
    try:
        config_json = json.loads(config)
        return jsonify(config_json)
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse config"}), 500


@app.route('/')
def index():
    return "WebSocket Server for Docker Commands"


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
