from flask import Flask, render_template
from config import Config
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config.from_object(Config)

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize SQLAlchemy with the Flask app
db = SQLAlchemy(app)

# Example model
class ExampleModel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    # Create the tables in the database (SQLAlchemy)
    db.create_all()

    # Run the Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)  # debug=True for development only!


