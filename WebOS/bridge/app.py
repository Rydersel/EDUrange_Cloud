import os
import docker
import eventlet
import eventlet.wsgi
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit

eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

client = docker.from_env()
container = client.containers.get('target-container')

sessions = {}

def run_command(command, cwd):
    full_command = f'cd {cwd} && {command}'
    exec_result = container.exec_run(cmd=['/bin/sh', '-c', full_command], tty=True, stdout=True, stderr=True)
    return exec_result

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
                    if exec_result.exit_code == 0:
                        sessions[sid]['cwd'] = new_dir
                        response = exec_result.output.decode() + '\n'
                    else:
                        response = f"cd: no such file or directory: {parts[1]}\n"
                    emit('response', response, room=sid)
                    return
            else:
                exec_result = run_command(command, cwd)
                response = exec_result.output.decode() + '\n'
                emit('response', response, room=sid)

@app.route('/execute', methods=['POST'])
def execute_command():
    data = request.json
    command = data.get('command')
    if command:
        exec_instance = container.exec_run(cmd=['/bin/sh', '-c', command], tty=True, stdout=True, stderr=True)
        return jsonify({"output": exec_instance.output.decode() + '\n'})
    return jsonify({"error": "Command is required"}), 400

@app.route('/')
def index():
    return "WebSocket Server for Docker Commands"

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
