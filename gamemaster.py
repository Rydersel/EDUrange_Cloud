import os
import docker

import subprocess



def game_master():
    from openai import OpenAI
    client = OpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
    )

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "what is 5+5",
            }
        ],
        model="gpt-3.5-turbo",
    )
