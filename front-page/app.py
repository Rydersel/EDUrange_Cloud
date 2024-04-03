from flask import Flask, jsonify, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

challenges = [
    {"id": 1, "name": "Web", "description": "Web stuff."},
    {"id": 2, "name": "File Carving", "description": "Carve those files."},
]

@app.route('/api/challenges', methods=['GET'])
def get_challenges():
    return jsonify(challenges)

@app.route('/api/challenge/clicked', methods=['POST'])
def challenge_clicked():
    challenge_data = request.json
    instance_manager_url = 'http://localhost:5001/api/start-challenge'
    user_id = challenge_data.get('user_id', 'default-user1')  # Will adjust when user auth is added
    response = requests.post(instance_manager_url, json={'user_id': user_id})
    if response.ok:
        challenge_info = response.json()
        return jsonify({"status": "success", "url": challenge_info['url']})
    else:
        return jsonify({"status": "error", "message": "Failed to create challenge instance"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
