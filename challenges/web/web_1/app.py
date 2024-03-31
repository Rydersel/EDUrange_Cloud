from flask import Flask, render_template, request, redirect, url_for
import hashlib

app = Flask(__name__)

SECRET_SALT = "YourConstantSaltHere"

def generate_flag(user_id, challenge_id="web-1"):
    seed = f"{user_id}-{challenge_id}-{SECRET_SALT}"
    flag = hashlib.sha256(seed.encode()).hexdigest()
    return flag[:8]  # Use the first 8 characters for simplicity

@app.route('/', methods=['GET', 'POST'])
def home():
    if request.method == 'POST':
        user_id = request.form.get('user_id', 'default_user')
        flag = generate_flag(user_id)
        return render_template('index.html', flag=flag, user_id=user_id)
    return render_template('index.html', flag=None)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
