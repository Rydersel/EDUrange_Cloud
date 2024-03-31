from flask import Flask, request, render_template, redirect, url_for
from flag_util import verify_flag

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    # Example challenges list, replace with your actual challenges
    challenges = [
        {'id': 'web-1', 'name': 'Web 1'},
        {'id': 'web-1', 'name': 'Web 2'},
    ]
    return render_template('index.html', challenges=challenges)

@app.route('/submit', methods=['POST'])
def submit_challenge():
    user_id = request.form.get('user_id')  # Ensure you have a way to uniquely identify users
    challenge_id = request.form.get('challenge_id')
    user_flag = request.form.get('flag')

    if verify_flag(user_id, challenge_id, user_flag):
        return "Correct flag!", 200
    else:
        return "Incorrect flag.", 400

if __name__ == "__main__":
    app.run(debug=True)
