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
        # First get the challenge instance
        challenge_instance = loop.run_until_complete(prisma.challengeinstance.find_unique(
            where={'id': challenge_instance_id},
            include={'user': True}  # Include user information
        ))
        
        if not challenge_instance:
            return jsonify({'error': 'Challenge instance not found'}), 404

        challenge_instance_dict = challenge_instance.dict()

        # Find the group challenge for this instance
        group_challenge = loop.run_until_complete(prisma.groupchallenge.find_first(
            where={
                'challengeId': challenge_instance_dict['challengeId'],
                'groupId': challenge_instance_dict['competitionId']
            }
        ))

        # Create response with all needed data
        response_data = {
            'id': challenge_instance_dict['id'],
            'challengeId': challenge_instance_dict['challengeId'],
            'userId': challenge_instance_dict['userId'],
            'challengeImage': challenge_instance_dict['challengeImage'],
            'challengeUrl': challenge_instance_dict['challengeUrl'],
            'creationTime': challenge_instance_dict['creationTime'],
            'status': challenge_instance_dict['status'],
            'flagSecretName': challenge_instance_dict['flagSecretName'],
            'flag': challenge_instance_dict['flag'],
            'user': challenge_instance_dict['user'],
            'groupChallengeId': group_challenge.id if group_challenge else None,
            'groupId': group_challenge.groupId if group_challenge else None
        }

        return jsonify(response_data)
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
                'severity': 'INFO',
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
                'severity': 'INFO',
                'userId': data['createdBy'],
                'groupId': data['groupId'],
                'accessCodeId': access_code.id,
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
                'severity': 'INFO',
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

@app.route('/question/complete', methods=['POST'])
def complete_question():
    data = request.json
    user_id = data.get('user_id')
    question_id = data.get('question_id')
    group_challenge_id = data.get('group_challenge_id')
    points = data.get('points')

    if not all([user_id, question_id, group_challenge_id, points]):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        # Check if question is already completed
        existing_completion = loop.run_until_complete(prisma.questioncompletion.find_unique(
            where={
                'userId_questionId_groupChallengeId': {
                    'userId': user_id,
                    'questionId': question_id,
                    'groupChallengeId': group_challenge_id
                }
            }
        ))

        if existing_completion:
            return jsonify({'error': 'Question already completed'}), 400

        # Create completion record
        completion = loop.run_until_complete(prisma.questioncompletion.create(
            data={
                'userId': user_id,
                'questionId': question_id,
                'groupChallengeId': group_challenge_id,
                'pointsEarned': points
            }
        ))

        # Get group ID from group challenge
        group_challenge = loop.run_until_complete(prisma.groupchallenge.find_unique(
            where={'id': group_challenge_id},
            include={'group': True}
        ))

        if not group_challenge:
            return jsonify({'error': 'Group challenge not found'}), 404

        # Add points to user's competition total
        group_points = loop.run_until_complete(prisma.grouppoints.upsert(
            where={
                'userId_groupId': {
                    'userId': user_id,
                    'groupId': group_challenge.group.id
                }
            },
            data={
                'create': {
                    'userId': user_id,
                    'groupId': group_challenge.group.id,
                    'points': points
                },
                'update': {
                    'points': {
                        'increment': points
                    }
                }
            }
        ))

        return jsonify({
            'completion': completion.dict(),
            'points': group_points.dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/question/completed', methods=['GET'])
def get_completed_questions():
    user_id = request.args.get('user_id')
    group_challenge_id = request.args.get('group_challenge_id')

    if not user_id or not group_challenge_id:
        return jsonify({'error': 'user_id and group_challenge_id are required'}), 400

    try:
        completions = loop.run_until_complete(prisma.questioncompletion.find_many(
            where={
                'userId': user_id,
                'groupChallengeId': group_challenge_id
            }
        ))
        
        return jsonify({
            'completed_questions': [completion.dict() for completion in completions]
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/question/details', methods=['GET'])
def get_question_details():
    question_id = request.args.get('question_id')

    if not question_id:
        return jsonify({'error': 'question_id is required'}), 400

    try:
        question = loop.run_until_complete(prisma.challengequestion.find_unique(
            where={'id': question_id}
        ))
        
        if not question:
            return jsonify({'error': 'Question not found'}), 404

        return jsonify(question.dict())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/challenge/details', methods=['GET'])
def get_challenge_details():
    challenge_id = request.args.get('challenge_id')

    if not challenge_id:
        return jsonify({'error': 'challenge_id is required'}), 400

    try:
        challenge = loop.run_until_complete(prisma.challenges.find_unique(
            where={'id': challenge_id},
            include={
                'questions': {
                    'orderBy': {
                        'order': 'asc'
                    }
                },
                'challengeType': True,
                'appConfigs': True
            }
        ))
        
        if not challenge:
            return jsonify({'error': 'Challenge not found'}), 404

        challenge_dict = challenge.dict()
        return jsonify({
            'id': challenge_dict['id'],
            'name': challenge_dict['name'],
            'description': challenge_dict['description'],
            'difficulty': challenge_dict['difficulty'],
            'type': challenge_dict['challengeType']['name'],
            'questions': challenge_dict['questions'],
            'appConfigs': challenge_dict['appConfigs']
        })
    except Exception as e:
        print(f"Error in get_challenge_details: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/activity/log', methods=['POST'])
def log_activity():
    data = request.json
    try:
        # Validate required fields
        if not all(k in data for k in ['eventType', 'userId']):
            return jsonify({'error': 'eventType and userId are required'}), 400

        # Create activity log entry with new fields
        activity_log = loop.run_until_complete(prisma.activitylog.create(
            data={
                'eventType': data['eventType'],
                'severity': data.get('severity', 'INFO'),
                'userId': data['userId'],
                'challengeId': data.get('challengeId'),
                'groupId': data.get('groupId'),
                'challengeInstanceId': data.get('challengeInstanceId'),
                'accessCodeId': data.get('accessCodeId'),
                'metadata': data.get('metadata', {})
            }
        ))

        return jsonify(activity_log.dict())
    except Exception as e:
        print(f"Error in log_activity: {str(e)}")
        return jsonify({'error': str(e)}), 500

# For Dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
