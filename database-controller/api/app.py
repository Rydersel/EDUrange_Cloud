from flask import Flask, request, jsonify
from prisma import Prisma
from dotenv import load_dotenv
import asyncio
from flask_cors import CORS
from datetime import datetime


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
    group_id = data.get('group_id')
    points = data.get('points')

    if not user_id or not group_id or not points:
        return jsonify({'error': 'user_id, group_id, and points are required'}), 400

    try:
        # Check if the user exists and is a member of the group
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id},
            include={
                'memberOf': {
                    'where': {'id': group_id}
                }
            }
        ))

        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if not user.memberOf:
            return jsonify({'error': 'User is not a member of this group'}), 403

        # Get current points
        group_points = loop.run_until_complete(prisma.grouppoints.find_unique(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            }
        ))

        # Calculate new points
        new_points = (group_points.points if group_points else 0) + points

        # Update or create points record
        updated_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            },
            create={
                'userId': user_id,
                'groupId': group_id,
                'points': new_points
            },
            update={
                'points': new_points
            }
        ))

        return jsonify(updated_points.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/set_points', methods=['POST'])
def set_points():
    data = request.json
    user_id = data.get('user_id')
    group_id = data.get('group_id')
    points = data.get('points')

    if not user_id or not group_id or points is None:
        return jsonify({'error': 'user_id, group_id, and points are required'}), 400

    try:
        # Check if the user exists and is a member of the group
        user = loop.run_until_complete(prisma.user.find_unique(
            where={'id': user_id},
            include={
                'memberOf': {
                    'where': {'id': group_id}
                }
            }
        ))

        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if not user.memberOf:
            return jsonify({'error': 'User is not a member of this group'}), 403

        # Update or create points record
        updated_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            },
            create={
                'userId': user_id,
                'groupId': group_id,
                'points': points
            },
            update={
                'points': points
            }
        ))

        return jsonify(updated_points.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_points', methods=['GET'])
def get_points():
    user_id = request.args.get('user_id')
    group_id = request.args.get('group_id')

    if not user_id or not group_id:
        return jsonify({'error': 'user_id and group_id are required'}), 400

    try:
        group_points = loop.run_until_complete(prisma.grouppoints.find_unique(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_id
                }
            }
        ))
        
        if group_points:
            return jsonify({'points': group_points.points})
        else:
            return jsonify({'points': 0})
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

# Competition Group Endpoints

@app.route('/competition/create', methods=['POST'])
def create_competition():
    data = request.json
    try:
        competition = loop.run_until_complete(prisma.competitiongroup.create(
            data={
                'name': data['name'],
                'description': data.get('description'),
                'startDate': datetime.fromisoformat(data['startDate']),
                'endDate': datetime.fromisoformat(data['endDate']) if data.get('endDate') else None,
                'instructors': {
                    'connect': [{'id': instructor_id} for instructor_id in data['instructorIds']]
                }
            }
        ))
        return jsonify(competition.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/join', methods=['POST'])
def join_competition():
    data = request.json
    try:
        # Verify access code
        access_code = loop.run_until_complete(prisma.competitionaccesscode.find_first(
            where={
                'code': data['code'],
                'OR': [
                    {'expiresAt': None},
                    {'expiresAt': {'gt': datetime.now()}}
                ],
                'AND': [
                    {'maxUses': None},
                    {'OR': [
                        {'maxUses': None},
                        {'usedCount': {'lt': prisma.competitionaccesscode.maxUses}}
                    ]}
                ]
            }
        ))

        if not access_code:
            return jsonify({'error': 'Invalid or expired access code'}), 400

        # Add user to competition group
        competition = loop.run_until_complete(prisma.competitiongroup.update(
            where={'id': access_code.groupId},
            data={
                'members': {
                    'connect': [{'id': data['userId']}]
                }
            },
            include={
                'challenges': True
            }
        ))

        # Increment access code usage
        loop.run_until_complete(prisma.competitionaccesscode.update(
            where={'id': access_code.id},
            data={
                'usedCount': {'increment': 1}
            }
        ))

        # Log the event
        loop.run_until_complete(prisma.activitylog.create(
            data={
                'eventType': 'GROUP_JOINED',
                'userId': data['userId'],
                'groupId': competition.id,
                'metadata': {'accessCode': data['code']}
            }
        ))

        return jsonify(competition.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/generate-code', methods=['POST'])
def generate_access_code():
    data = request.json
    try:
        access_code = loop.run_until_complete(prisma.competitionaccesscode.create(
            data={
                'code': data['code'],
                'groupId': data['groupId'],
                'createdBy': data['createdBy'],
                'expiresAt': datetime.fromisoformat(data['expiresAt']) if data.get('expiresAt') else None,
                'maxUses': data.get('maxUses')
            }
        ))

        # Log the event
        loop.run_until_complete(prisma.activitylog.create(
            data={
                'eventType': 'ACCESS_CODE_GENERATED',
                'userId': data['createdBy'],
                'groupId': data['groupId'],
                'metadata': {'code': data['code']}
            }
        ))

        return jsonify(access_code.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/add-challenge', methods=['POST'])
def add_competition_challenge():
    data = request.json
    try:
        group_challenge = loop.run_until_complete(prisma.groupchallenge.create(
            data={
                'points': data['points'],
                'challengeId': data['challengeId'],
                'groupId': data['groupId']
            }
        ))
        return jsonify(group_challenge.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/complete-challenge', methods=['POST'])
def complete_challenge():
    data = request.json
    try:
        # Create challenge completion record
        completion = loop.run_until_complete(prisma.challengecompletion.create(
            data={
                'userId': data['userId'],
                'groupChallengeId': data['groupChallengeId'],
                'pointsEarned': data['pointsEarned']
            }
        ))

        # Log the event
        loop.run_until_complete(prisma.activitylog.create(
            data={
                'eventType': 'CHALLENGE_COMPLETED',
                'userId': data['userId'],
                'challengeId': data['challengeId'],
                'groupId': data['groupId'],
                'metadata': {
                    'pointsEarned': data['pointsEarned'],
                    'completionTime': completion.completedAt.isoformat()
                }
            }
        ))

        return jsonify(completion.dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/<group_id>/leaderboard', methods=['GET'])
def get_leaderboard(group_id):
    try:
        # Get all points for the competition group
        group_points = loop.run_until_complete(prisma.grouppoints.find_many(
            where={
                'groupId': group_id
            },
            include={
                'user': True
            },
            order_by={
                'points': 'desc'
            }
        ))

        # Format the leaderboard response
        leaderboard = [{
            'userId': points.userId,
            'name': points.user.name,
            'points': points.points,
            'completions': 0  # We'll update this in the next step
        } for points in group_points]

        # Get completion counts for each user
        for entry in leaderboard:
            completions = loop.run_until_complete(prisma.challengecompletion.count(
                where={
                    'userId': entry['userId'],
                    'groupChallenge': {
                        'groupId': group_id
                    }
                }
            ))
            entry['completions'] = completions

        return jsonify(leaderboard)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/competition/<group_id>/progress/<user_id>', methods=['GET'])
def get_user_progress(group_id, user_id):
    try:
        # Get all challenges in the competition
        group_challenges = loop.run_until_complete(prisma.groupchallenge.find_many(
            where={'groupId': group_id},
            include={
                'challenge': True,
                'completions': {
                    'where': {
                        'userId': user_id
                    }
                }
            }
        ))

        progress = []
        total_points = 0
        earned_points = 0

        for challenge in group_challenges:
            challenge_dict = challenge.dict()
            is_completed = len(challenge_dict['completions']) > 0
            points_earned = challenge_dict['completions'][0]['pointsEarned'] if is_completed else 0
            
            progress.append({
                'challengeId': challenge_dict['challengeId'],
                'challengeName': challenge_dict['challenge']['name'],
                'points': challenge_dict['points'],
                'completed': is_completed,
                'pointsEarned': points_earned
            })
            
            total_points += challenge_dict['points']
            earned_points += points_earned

        return jsonify({
            'progress': progress,
            'totalPoints': total_points,
            'earnedPoints': earned_points,
            'completionPercentage': (len([p for p in progress if p['completed']]) / len(progress)) * 100 if progress else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# For Dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
