from flask import Flask, request, jsonify
from prisma import Prisma
from dotenv import load_dotenv
import asyncio
from flask_cors import CORS


load_dotenv()  # Load environmental variables

app = Flask(__name__)
CORS(app)

prisma = Prisma()

# Create an event loop and connect to Prisma database
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
loop.run_until_complete(prisma.connect())

@app.route('/add_points', methods=['POST'])
def add_points():
    data = request.json
    user_id = data.get('user_id')
    points = data.get('points')

    if not user_id or not points:
        return jsonify({'error': 'user_id and points are required'}), 400

    try:
        # Check if the user exists
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id}
        ))

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Update the user's points
        updated_user = loop.run_until_complete(prisma.user.update(
            where={'id': user_id},
            data={'points': {'increment': points}}
        ))

        user_dict = updated_user.dict()
        return jsonify(user_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/set_points', methods=['POST'])
def set_points():
    data = request.json
    user_id = data.get('user_id')
    points = data.get('points')

    if not user_id or points is None:
        return jsonify({'error': 'user_id and points are required'}), 400

    try:
        # Check if the user exists
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id}
        ))

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Set the user's points
        updated_user = loop.run_until_complete(prisma.user.update(
            where={'id': user_id},
            data={'points': points}
        ))

        user_dict = updated_user.dict()
        return jsonify(user_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_points', methods=['GET'])
def get_points():
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    try:
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id}
        ))
        if user:
            return jsonify({'points': user.points})
        else:
            return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get_challenge_instance', methods=['GET'])
def get_challenge_instance():
    challenge_instance_id = request.args.get('challenge_instance_id')

    if not challenge_instance_id:
        return jsonify({'error': 'challenge_instance_id is required'}), 400

    try:
        challenge_instance = loop.run_until_complete(prisma.challengeinstance.find_unique(
            where={'id': challenge_instance_id},
            include={'user': True}  # Include user information
        ))
        if challenge_instance:
            challenge_instance_dict = challenge_instance.dict()
            return jsonify({
                'id': challenge_instance_dict['id'],
                'challengeId': challenge_instance_dict['challengeId'],
                'userId': challenge_instance_dict['userId'],
                'challengeImage': challenge_instance_dict['challengeImage'],
                'challengeUrl': challenge_instance_dict['challengeUrl'],
                'creationTime': challenge_instance_dict['creationTime'],
                'status': challenge_instance_dict['status'],
                'flagSecretName': challenge_instance_dict['flagSecretName'],
                'flag': challenge_instance_dict['flag'],
                'user': challenge_instance_dict['user']
            })
        else:
            return jsonify({'error': 'Challenge instance not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# For Dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
