from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json

app = Flask(__name__)
CORS(app)

# Function to execute Prisma queries
def run_prisma_query(query):
    result = subprocess.run(['node', '-e', query], capture_output=True, text=True)
    return json.loads(result.stdout)

@app.route('/users', methods=['GET'])
def get_users():
    query = """
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    async function main() {
      const users = await prisma.user.findMany();
      console.log(JSON.stringify(users));
    }

    main()
      .catch(e => {
        console.error(e);
        prisma.$disconnect();
      })
      .finally(async () => {
        await prisma.$disconnect();
      });
    """
    users = run_prisma_query(query)
    return jsonify(users)

@app.route('/users', methods=['POST'])
def create_user():
    data = request.json
    query = f"""
    const {{ PrismaClient }} = require('@prisma/client');
    const prisma = new PrismaClient();

    async function main() {{
      const user = await prisma.user.create({{
        data: {{
          name: '{data['name']}',
          email: '{data['email']}'
        }},
      }});
      console.log(JSON.stringify(user));
    }}

    main()
      .catch(e => {{
        console.error(e);
        prisma.$disconnect();
      }})
      .finally(async () => {{
        await prisma.$disconnect();
      }});
    """
    user = run_prisma_query(query)
    return jsonify(user)

@app.route('/challenges', methods=['GET'])
def get_challenges():
    query = """
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    async function main() {
      const challenges = await prisma.challenges.findMany();
      console.log(JSON.stringify(challenges));
    }

    main()
      .catch(e => {
        console.error(e);
        prisma.$disconnect();
      })
      .finally(async () => {
        await prisma.$disconnect();
      });
    """
    challenges = run_prisma_query(query)
    return jsonify(challenges)

@app.route('/challenges', methods=['POST'])
def create_challenge():
    data = request.json
    query = f"""
    const {{ PrismaClient }} = require('@prisma/client');
    const prisma = new PrismaClient();

    async function main() {{
      const challenge = await prisma.challenges.create({{
        data: {{
          name: '{data['name']}',
          challengeImage: '{data['challengeImage']}',
          AppsConfig: '{data['AppsConfig']}',
          challengeTypeId: '{data['challengeTypeId']}'
        }},
      }});
      console.log(JSON.stringify(challenge));
    }}

    main()
      .catch(e => {{
        console.error(e);
        prisma.$disconnect();
      }})
      .finally(async () => {{
        await prisma.$disconnect();
      }});
    """
    challenge = run_prisma_query(query)
    return jsonify(challenge)


# Local dev
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
