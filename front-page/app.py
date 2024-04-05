from flask import Flask, jsonify, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

challenges = [
    {"id": 1, "name": "Web", "description": "Web stuff."},  # Eventually will pull from db
    {"id": 2, "name": "File Carving", "description": "Carve those files."},
]


@app.route('/api/challenges', methods=['GET'])
def get_challenges():
    return jsonify(challenges)


@app.route('/api/challenge/clicked', methods=['POST'])
def challenge_clicked():
    try:
        print(request)
        challenge_data = request.json
        instance_manager_url = 'http://localhost:5001/api/start-challenge'
        user_id = challenge_data.get('user_id', 'default-user1')  # Will adjust when user auth is added
        response = requests.post(instance_manager_url, json={'user_id': user_id})
        # error handling was done by Gemini 1.5 so if it sucks not my fault.
        if response.ok:
            challenge_info = response.json()
            return jsonify({"status": "success", "url": challenge_info['url']})
        else:
            # Handle errors from instance manager
            return jsonify({"status": "error", "message": f"Failed to create challenge instance: {response.text}"}), 500
    except KeyError:
        # Handle missing key errors
        return jsonify({"status": "error", "message": "Missing required parameter: user_id"}), 400
    except Exception as e:
        # Handle other unexpected errors
        app.logger.exception(e)
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500


# Generic error handler for all exceptions
@app.errorhandler(Exception)
def handle_exception(error):
    app.logger.exception(error)
    response = jsonify({
        "message": "An internal server error occurred",
        "error_code": "INTERNAL_SERVER_ERROR"
    })
    response.status_code = 500
    return response


if __name__ == '__main__':
    app.run(debug=True, port=5000)
