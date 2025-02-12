import requests
import json
from datetime import datetime
import pytest

# Configuration
BASE_URL = "https://database.rydersel.cloud"
INSTANCE_MANAGER_URL = "https://eductf.rydersel.cloud/instance-manager"

class TestData:
    def __init__(self):
        self.user_id = None
        self.group_id = None
        self.question_id = None
        self.group_challenge_id = None
        self.points = 10

def create_test_challenge():
    """Create a test challenge with a question using the instance manager"""
    try:
        # Create a challenge using the instance manager
        challenge_data = {
            "name": f"Test Challenge {datetime.now().strftime('%Y%m%d%H%M%S')}",
            "description": "A test challenge for API testing",
            "difficulty": "EASY",
            "type": "CTF",
            "questions": [
                {
                    "content": "Test question 1",
                    "points": 10,
                    "type": "text",
                    "answer": "test_answer"
                }
            ],
            "image": "ubuntu:latest",
            "resources": {
                "cpu": "100m",
                "memory": "128Mi"
            }
        }
        
        response = requests.post(f"{INSTANCE_MANAGER_URL}/api/create-challenge", json=challenge_data)
        if response.status_code != 200:
            pytest.fail(f"Failed to create test challenge: {response.text}")
        
        challenge = response.json()
        print(f"✅ Created test challenge: {challenge['id']}")
        return challenge['id'], challenge['questions'][0]['id']
    except Exception as e:
        pytest.fail(f"Error creating test challenge: {str(e)}")

@pytest.fixture(scope="session")
def test_data():
    """Create test data once for all tests"""
    print("\n🔧 Setting up test data...")
    data = TestData()
    
    try:
        # 1. Create a test competition group
        group_response = requests.post(f"{BASE_URL}/competition/create", json={
            "name": "Test Competition",
            "description": "Test competition for API testing",
            "startDate": datetime.now().isoformat(),
            "endDate": (datetime.now().replace(year=datetime.now().year + 1)).isoformat(),
            "instructorIds": []  # We'll need to get a valid instructor ID
        })
        
        if group_response.status_code != 200:
            pytest.fail(f"Failed to create test group: {group_response.text}")
            
        group_data = group_response.json()
        data.group_id = group_data["id"]
        print(f"✅ Created test group: {data.group_id}")

        # Create a test challenge and get its ID and question ID
        challenge_id, question_id = create_test_challenge()
        data.question_id = question_id

        # 2. Create a test challenge in the group
        challenge_response = requests.post(f"{BASE_URL}/competition/add-challenge", json={
            "points": data.points,
            "challengeId": challenge_id,
            "groupId": data.group_id
        })
        
        if challenge_response.status_code != 200:
            pytest.fail(f"Failed to create test challenge: {challenge_response.text}")
            
        challenge_data = challenge_response.json()
        data.group_challenge_id = challenge_data["id"]
        print(f"✅ Added challenge to group: {data.group_challenge_id}")

        # 3. Generate an access code for the group
        code_response = requests.post(f"{BASE_URL}/competition/generate-code", json={
            "code": f"TEST{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "groupId": data.group_id,
            "createdBy": "test-creator",
            "maxUses": 1
        })
        
        if code_response.status_code != 200:
            pytest.fail(f"Failed to generate access code: {code_response.text}")
            
        access_code = code_response.json()
        print(f"✅ Generated access code: {access_code['code']}")

        # 4. Create a test user by joining the competition
        join_response = requests.post(f"{BASE_URL}/competition/join", json={
            "code": access_code["code"],
            "userId": f"test-user-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        })
        
        if join_response.status_code != 200:
            pytest.fail(f"Failed to join competition: {join_response.text}")
            
        join_data = join_response.json()
        data.user_id = join_data["members"][-1]["id"]  # Get the last joined member
        print(f"✅ Created test user: {data.user_id}")

        yield data

        # Cleanup after all tests are done
        print("\n🧹 Cleaning up test data...")
        try:
            # Delete the test group (this should cascade delete everything else)
            delete_response = requests.delete(f"{BASE_URL}/competition/{data.group_id}")
            if delete_response.status_code == 200:
                print(f"✅ Cleaned up test group: {data.group_id}")
            else:
                print(f"❌ Failed to clean up test group: {delete_response.text}")

            # Delete the test challenge from instance manager
            challenge_delete_response = requests.delete(f"{INSTANCE_MANAGER_URL}/api/delete-challenge/{challenge_id}")
            if challenge_delete_response.status_code == 200:
                print(f"✅ Cleaned up test challenge: {challenge_id}")
            else:
                print(f"❌ Failed to clean up test challenge: {challenge_delete_response.text}")
        except Exception as e:
            print(f"❌ Error cleaning up test data: {str(e)}")

    except Exception as e:
        pytest.fail(f"Error setting up test data: {str(e)}")

def test_question_complete(test_data):
    """Test the question completion endpoint"""
    print("\n🧪 Testing /question/complete endpoint...")
    
    url = f"{BASE_URL}/question/complete"
    payload = {
        "user_id": test_data.user_id,
        "question_id": test_data.question_id,
        "group_challenge_id": test_data.group_challenge_id,
        "points": test_data.points
    }
    
    # Test initial submission
    response = requests.post(url, json=payload)
    assert response.status_code in [200, 201], f"Expected status code 200 or 201, got {response.status_code}"
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Test duplicate submission (should fail)
    print("\n🧪 Testing duplicate submission...")
    response = requests.post(url, json=payload)
    assert response.status_code == 400, f"Expected status code 400, got {response.status_code}"
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_get_completed_questions(test_data):
    """Test getting completed questions endpoint"""
    print("\n🧪 Testing /question/completed endpoint...")
    
    url = f"{BASE_URL}/question/completed"
    params = {
        "user_id": test_data.user_id,
        "group_challenge_id": test_data.group_challenge_id
    }
    
    response = requests.get(url, params=params)
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_get_question_details(test_data):
    """Test getting question details endpoint"""
    print("\n🧪 Testing /question/details endpoint...")
    
    url = f"{BASE_URL}/question/details"
    params = {
        "question_id": test_data.question_id
    }
    
    response = requests.get(url, params=params)
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_get_points(test_data):
    """Test getting points endpoint"""
    print("\n🧪 Testing /get_points endpoint...")
    
    url = f"{BASE_URL}/get_points"
    params = {
        "user_id": test_data.user_id,
        "group_id": test_data.group_id
    }
    
    response = requests.get(url, params=params)
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    print(f"Response: {json.dumps(response.json(), indent=2)}")
