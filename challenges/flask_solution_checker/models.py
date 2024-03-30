from extentions import db

class Challenge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(255), nullable=False, unique=True)
    flag = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f'<Challenge {self.user_id}>'
