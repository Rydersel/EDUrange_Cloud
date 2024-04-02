
import React, { useEffect, useState } from 'react';
import axios from 'axios';

type Challenge = {
  id: number;
  name: string;
  description: string;
};

export const ChallengeSelector = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/challenges')
      .then(response => setChallenges(response.data))
      .catch(error => console.error("There was an error fetching the challenges:", error));
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {challenges.map((challenge) => (
        <div key={challenge.id} className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <h3 className="text-xl font-semibold mb-2">{challenge.name}</h3>
          <p className="text-gray-400">{challenge.description}</p>
        </div>
      ))}
    </div>
  );
};
