import React, { useState, useEffect } from 'react';
import { Terminal, ArrowRight, Check, Trophy, Info, X } from 'lucide-react';

const Sidebar = ({ questions, onSelectQuestion, completedQuestions, currentQuestionId }) => (
  <div className="w-full md:w-64 bg-black border-r border-green-700 p-4 overflow-y-auto font-mono text-green-400">
    <h2 className="text-xl font-bold mb-4 text-green-500">Mission Objectives</h2>
    {questions.map((question, index) => (
      <button
        key={question.id}
        onClick={() => onSelectQuestion(question.id)}
        className={`w-full text-left p-2 mb-2 rounded flex items-center justify-between ${
          currentQuestionId === question.id ? 'bg-green-900 text-green-100' : 'hover:bg-green-900 hover:bg-opacity-50'
        }`}
      >
        <span className="flex items-center flex-grow">
          <Terminal className="w-4 h-4 mr-2 flex-shrink-0" />
          <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${
            completedQuestions.includes(question.id) ? 'line-through text-green-600' : ''
          }`}>
            {`Objective ${index + 1}`}
          </span>
        </span>
        <span className="flex items-center ml-2 flex-shrink-0">
          <span className={`px-1 text-xs rounded whitespace-nowrap ${
            completedQuestions.includes(question.id) ? 'bg-green-600' : 'bg-green-800'
          }`}>
            {question.points} pts
          </span>
        </span>
      </button>
    ))}
  </div>
);

const JumbledText = ({ text, isJumbling }) => {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    if (isJumbling) {
      let iterations = 0;
      const interval = setInterval(() => {
        setDisplayText(prev =>
          prev.split('').map((char, index) => {
            if (index < iterations) {
              return text[index];
            }
            return String.fromCharCode(65 + Math.floor(Math.random() * 26));
          }).join('')
        );
        iterations += 1 / 3;
        if (iterations >= text.length) {
          clearInterval(interval);
        }
      }, 30);

      return () => clearInterval(interval);
    }
  }, [isJumbling, text]);

  return <span>{displayText}</span>;
};

export default function ChallengePrompt() {
  const [challengeData, setChallengeData] = useState(null);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [completedQuestions, setCompletedQuestions] = useState(() => {
    const saved = localStorage.getItem('completedQuestions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCorrectAnimation, setShowCorrectAnimation] = useState(false);
  const [showIncorrectAnimation, setShowIncorrectAnimation] = useState(false);
  const [showInfoPage, setShowInfoPage] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchChallengeData = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const challengeApp = data.find(app => app.id === 'challenge-prompt');
        setChallengeData(challengeApp.challenge);
        setCurrentQuestionId(challengeApp.challenge.pages[0].questions[0].id);

        // Fetch initial user points
        const challengeInstanceId = getChallengeInstanceId();
        const instanceResponse = await fetch(`https://database.rydersel.cloud/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`);
        const instanceData = await instanceResponse.json();
        const userId = instanceData.userId;
        setUserId(userId);
        console.log(userId)

        const pointsResponse = await fetch(`https://database.rydersel.cloud/get_points?user_id=${userId}`);
        const { points } = await pointsResponse.json();
        setUserPoints(points);
      } catch (error) {
        console.error('Failed to fetch challenge data:', error);
      }
    };

    fetchChallengeData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('completedQuestions', JSON.stringify(completedQuestions));
  }, [completedQuestions]);

  const allQuestions = challengeData?.pages.flatMap(page => page.questions) || [];
  const currentQuestion = allQuestions.find(q => q.id === currentQuestionId);
  const allQuestionsCompleted = completedQuestions.length === allQuestions.length;

  const handleChange = (value) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionId]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (answers[currentQuestionId]) {
      try {
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            questionId: currentQuestionId,
            answer: answers[currentQuestionId].trim()
          }),
        });

        const { isCorrect, newPoints } = await response.json();

        if (isCorrect) {
          setCompletedQuestions(prev => [...prev, currentQuestionId]);
          setShowCorrectAnimation(true);
          setTimeout(() => setShowCorrectAnimation(false), 2000);
          setUserPoints(newPoints);

          // Add points to the user
          const questionPoints = currentQuestion.points;

          try {
            console.log(`sending points: ${userId}, ${questionPoints}`);
            const addPointsResponse = await fetch('https://database.rydersel.cloud/add_points', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userId,
                points: questionPoints
              })
            });

            if (!addPointsResponse.ok) {
              throw new Error(`HTTP error! status: ${addPointsResponse.status}`);
            }

            const pointsData = await addPointsResponse.json();
            setUserPoints(pointsData.points);
          } catch (error) {
            console.error('Failed to add points:', error);
          }
        } else {
          setShowIncorrectAnimation(true);
          setTimeout(() => setShowIncorrectAnimation(false), 1000);
        }
      } catch (error) {
        console.error('Failed to verify answer:', error);
      }
    }
  };

  const renderQuestion = () => {
    if (!currentQuestion) return null;
    const isCompleted = completedQuestions.includes(currentQuestionId);
    return (
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <p className="text-green-400">{currentQuestion.content}</p>
          <span className="ml-2 px-2 py-1 bg-green-900 text-green-200 text-xs font-semibold rounded">
            {currentQuestion.points} pts
          </span>
        </div>
        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={answers[currentQuestionId] || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={`flex-grow px-3 py-2 bg-black border rounded-md focus:outline-none focus:ring-2 transition-all duration-300 ${
              showIncorrectAnimation
                ? 'border-red-500 focus:ring-red-500 shake'
                : 'border-green-700 focus:ring-green-600'
            } text-green-100`}
            placeholder="Enter your answer..."
            disabled={isCompleted}
          />
          {!isCompleted && (
            <button
              type="submit"
              className="ml-2 bg-green-800 text-green-100 px-4 py-2 rounded-md hover:bg-green-700 transition duration-300 ease-in-out"
            >
              Submit
            </button>
          )}
        </form>
        {isCompleted && (
          <div className="text-green-400 mt-2 flex items-center">
            <Check className="w-6 h-6 mr-2 text-green-300" />
            <JumbledText text="Answer accepted" isJumbling={showCorrectAnimation} />
          </div>
        )}
      </div>
    );
  };

  const renderCompletionPage = () => (
    <div className="text-center">
      <Trophy className="w-16 h-16 text-green-400 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-green-300 mb-4">Challenge Completed!</h2>
      <div className="mb-6">
        {allQuestions.map((question, index) => (
          <div key={question.id} className="flex justify-between items-center mb-2">
            <span className="text-green-400">Objective {index + 1}</span>
            <div className="flex items-center">
              <span className="text-green-200 mr-2">{question.points} pts</span>
              <Check className="w-5 h-5 text-green-400" />
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => console.log("Challenge completed!")}
        className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded transition duration-300 ease-in-out"
      >
        Complete Challenge
      </button>
    </div>
  );

  const renderInfoPage = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-green-300">Challenge Information</h2>
          <button onClick={() => setShowInfoPage(false)} className="text-green-500 hover:text-green-400">
            <X size={24} />
          </button>
        </div>
        <div className="text-green-300">
          <p>{challengeData?.description}</p>
        </div>
      </div>
    </div>
  );

  if (!challengeData) {
    return <div className="text-green-400">Loading challenge data...</div>;
  }

  const currentIndex = allQuestions.findIndex(q => q.id === currentQuestionId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allQuestions.length - 1;

  return (
    <div className="flex flex-col md:flex-row h-full bg-black text-green-400 font-mono">
      <style jsx global>{`
        @keyframes shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
          100% { transform: translateX(0); }
        }
        .shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
      <Sidebar
        questions={allQuestions}
        onSelectQuestion={setCurrentQuestionId}
        completedQuestions={completedQuestions}
        currentQuestionId={currentQuestionId}
      />
      <div className="flex-grow p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="bg-green-900 bg-opacity-20 rounded-lg shadow-lg p-4 md:p-6 mb-4 border border-green-800">
            <div className="flex justify-between items-center">
              <h2 className="text-xl md:text-2xl font-bold mb-2 text-green-300">{challengeData.title}</h2>
              <button
                onClick={() => setShowInfoPage(!showInfoPage)}
                className="bg-green-700 hover:bg-green-600 text-white p-2 rounded-full transition duration-300 ease-in-out"
              >
                <Info size={20} />
              </button>
            </div>
            <p className="text-green-400 mb-4">{challengeData.description}</p>
            <p className="text-sm text-green-600">
              {currentTime.toLocaleTimeString()}
            </p>
          </div>
          <div className="bg-green-900 bg-opacity-20 rounded-lg shadow-lg p-4 md:p-6 mb-4 border border-green-800">
            {allQuestionsCompleted ? renderCompletionPage() : renderQuestion()}
          </div>
          {!allQuestionsCompleted && (
            <div className="flex justify-between">
              <button
                onClick={() => {
                  if (hasPrevious) {
                    setCurrentQuestionId(allQuestions[currentIndex - 1].id);
                  }
                }}
                className="bg-green-800 hover:bg-green-700 text-green-100 font-semibold py-2 px-4 rounded-md transition duration-300 ease-in-out flex items-center"
                disabled={!hasPrevious}
              >
                <ArrowRight className="w-5 h-5 mr-2 transform rotate-180" />
                <span>Previous</span>
              </button>
              <button
                onClick={() => {
                  if (hasNext) {
                    setCurrentQuestionId(allQuestions[currentIndex + 1].id);
                  }
                }}
                className="bg-green-800 hover:bg-green-700 text-green-100 font-semibold py-2 px-4 rounded-md transition duration-300 ease-in-out flex items-center"
                disabled={!hasNext}
              >
                <span>Next</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}
        </div>
      </div>
      {showInfoPage && renderInfoPage()}
    </div>
  );
}

function getChallengeInstanceId() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    return parts[0];
  }
  console.log("Failed to get challenge instance id");
  return 'null';
}
export const displayChallengePrompt = (props) => {
  return <ChallengePrompt {...props} />;
};
