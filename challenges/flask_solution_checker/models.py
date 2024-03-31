from extentions import db


class UserChallenge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(128), unique=True, nullable=False)
    encrypted_data = db.Column(db.Text, nullable=False)
    decryption_key = db.Column(db.String(128), nullable=False)

