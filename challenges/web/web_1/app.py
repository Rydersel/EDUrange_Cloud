from flask import Flask, render_template, request
import os

app = Flask(__name__)

# Retrieve the FLAG environment variable
FLAG = os.getenv('FLAG', 'default_flag_value')

@app.route('/', methods=['GET', 'POST'])
def home():
    message = ''
    if request.method == 'POST':
        submitted_flag = request.form.get('flag', '')
        if submitted_flag == FLAG:
            message = 'Correct flag!'
        else:
            message = 'Incorrect flag.'
    # Pass the FLAG variable to the template
    return render_template('index.html', message=message, FLAG=FLAG)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
