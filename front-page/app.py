from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

challenges = [
    {"id": 1, "name": "Web", "description": "Web stuff."},
    {"id": 2, "name": "File Carving", "description": "Carve those files."},
    # Add more challenges here
]

@app.route('/api/challenges', methods=['GET'])
def get_challenges():
    return jsonify(challenges)

@app.route('/api/challenge/clicked', methods=['POST'])
def challenge_clicked():
    challenge_data = request.json
    print(f"Challenge Clicked: {challenge_data['name']}")
    return jsonify({"status": "success", "message": "Challenge click recorded"}), 200

if __name__ == '__main__':
    app.run(debug=True)
