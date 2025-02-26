import React, { useState, useEffect } from 'react';
import { Terminal, ArrowRight, Check, Trophy, Info, X } from 'lucide-react';
import LoadingAnimation from '../util-components/loading-animation';
import JumbledText from '../util-components/jumbled-text';

// Create ActivityLogger class
class ActivityLogger {
  static async logQuestionAttempt(userId, challengeId, groupId, metadata) {
    try {
      const response = await fetch('https://database.rydersel.cloud/activity/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'QUESTION_ATTEMPTED',
          userId,
          challengeId,
          groupId,
          metadata: JSON.stringify(metadata)
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to log question attempt: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to log question attempt:', error);
      throw error;
    }
  }

  static async logQuestionCompletion(userId, challengeId, groupId, metadata) {
    try {
      const response = await fetch('https://database.rydersel.cloud/activity/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'QUESTION_COMPLETED',
          userId,
          challengeId,
          groupId,
          metadata: JSON.stringify(metadata)
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to log question completion: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to log question completion:', error);
      throw error;
    }
  }
}

const Sidebar = ({ questions, onSelectQuestion, completedQuestions, currentQuestionId, groupChallengeId }) => (
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
            completedQuestions.some(q => q.questionId === question.id && q.groupChallengeId === groupChallengeId) ? 'line-through text-green-600' : ''
          }`}>
            {`Objective ${index + 1}`}
          </span>
        </span>
        <span className="flex items-center ml-2 flex-shrink-0">
          <span className={`px-1 text-xs rounded whitespace-nowrap ${
            completedQuestions.some(q => q.questionId === question.id && q.groupChallengeId === groupChallengeId) ? 'bg-green-600' : 'bg-green-800'
          }`}>
            {question.points} pts
          </span>
        </span>
      </button>
    ))}
  </div>
);

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getChallengeInstanceId() {
  // First try to get the ID from environment variable
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME) {
    console.log('✅ Using challenge instance ID from NEXT_PUBLIC_CHALLENGE_POD_NAME:', process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME);
    return process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME;
  }

  // Fallback to hostname parsing
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('🔍 Falling back to extracting challenge instance ID from hostname:', hostname);
    
    // Extract everything before the first .rydersel.cloud
    const match = hostname.split('.rydersel.cloud')[0];
    if (match) {
      console.log('✅ Successfully extracted challenge instance ID from hostname:', match);
      return match;
    }
    
    console.error("❌ Failed to extract challenge instance ID from hostname:", hostname);
  }
  console.error("❌ Could not determine challenge instance ID");
  return null;
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📡 Attempt ${i + 1}/${retries} - Fetching:`, url);
      const response = await fetch(url, options);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Fetch successful:', { url, data });
        return { ok: true, data };
      }
      
      const errorText = await response.text();
      console.warn(`⚠️ Attempt ${i + 1}/${retries} failed:`, {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      
      if (i < retries - 1) {
        console.log(`🔄 Retrying in ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    } catch (error) {
      console.error(`❌ Attempt ${i + 1}/${retries} error:`, error);
      if (i < retries - 1) {
        console.log(`🔄 Retrying in ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
  }
  
  return { ok: false };
}

export default function ChallengePrompt() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [challengeData, setChallengeData] = useState(null);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [completedQuestions, setCompletedQuestions] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCorrectAnimation, setShowCorrectAnimation] = useState(false);
  const [showIncorrectAnimation, setShowIncorrectAnimation] = useState(false);
  const [showInfoPage, setShowInfoPage] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const [userId, setUserId] = useState(null);
  const [groupChallengeId, setGroupChallengeId] = useState(null);
  const [groupId, setGroupId] = useState(null);

  useEffect(() => {
    const fetchChallengeData = async () => {
      setIsLoading(true);
      setLoadError(false);
      setErrorMessage("");
      console.log('🔄 Starting challenge data fetch...');
      try {
        const challengeInstanceId = getChallengeInstanceId();
        if (!challengeInstanceId) {
          setLoadError(true);
          setErrorMessage("Failed to determine challenge instance ID");
          return;
        }

        console.log('📡 Fetching challenge instance details...', { challengeInstanceId });
        
        // Try both URL formats
        const urls = [
          `https://database.rydersel.cloud/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`,
          `https://database.rydersel.cloud/api/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`
        ];

        let instanceData = null;
        let lastError = null;
        for (const url of urls) {
          const result = await fetchWithRetry(url);
          if (result.ok) {
            instanceData = result.data;
            break;
          }
          lastError = result.error;
        }

        if (!instanceData) {
          setLoadError(true);
          setErrorMessage("Failed to load challenge data after multiple attempts");
          return;
        }

        console.log('✅ Received challenge instance data:', instanceData);
        
        setUserId(instanceData.userId);
        setGroupChallengeId(instanceData.groupChallengeId);
        setGroupId(instanceData.groupId);
        console.log('📝 Updated state with instance data:', {
          userId: instanceData.userId,
          groupChallengeId: instanceData.groupChallengeId,
          groupId: instanceData.groupId
        });

        // Verify userId was set correctly
        setTimeout(() => {
          console.log('🔍 Verifying userId in state:', {
            userId,
            instanceDataUserId: instanceData.userId
          });
        }, 0);

        // Only proceed if we have both user ID and group challenge ID
        if (instanceData.userId && instanceData.groupChallengeId) {
          // Fetch completed questions with retry
          const completedResult = await fetchWithRetry(
            `https://database.rydersel.cloud/question/completed?user_id=${instanceData.userId}&group_challenge_id=${instanceData.groupChallengeId}`
          );
          
          if (completedResult.ok) {
            const completedQuestionData = completedResult.data.completed_questions;
            console.log('✅ Fetched completed questions:', completedQuestionData);
            setCompletedQuestions(completedQuestionData);
          }

          // Fetch user points with retry
          const pointsResult = await fetchWithRetry(
            `https://database.rydersel.cloud/get_points?user_id=${instanceData.userId}&group_id=${instanceData.groupId}`
          );
          
          if (pointsResult.ok) {
            setUserPoints(pointsResult.data.points);
          }
        }

        // Get challenge config with retry
        const configResult = await fetchWithRetry('/api/config');
        if (configResult.ok) {
          const challengeApp = configResult.data.find(app => app.id === 'challenge-prompt');
          if (challengeApp && challengeApp.challenge) {
            console.log('📝 Setting challenge data and initial question');
            setChallengeData(challengeApp.challenge);
            setCurrentQuestionId(challengeApp.challenge.pages[0].questions[0].id);
            // Set the groupChallengeId from the challenge config
            if (challengeApp.challenge.groupChallengeId) {
              setGroupChallengeId(challengeApp.challenge.groupChallengeId);
              console.log('📝 Set groupChallengeId from config:', challengeApp.challenge.groupChallengeId);
            }
          } else {
            console.error('❌ Challenge app or challenge data not found in config');
          }
        }
      } catch (error) {
        console.error('❌ Failed to fetch challenge data:', {
          error: error.message,
          stack: error.stack
        });
        setLoadError(true);
        setErrorMessage(error.message || "An unexpected error occurred while loading the challenge");
      } finally {
        setIsLoading(false);
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
    console.log('🔄 Starting answer submission...', {
      questionId: currentQuestionId,
      groupChallengeId,
      groupId,
      hasAnswer: !!answers[currentQuestionId],
      userId
    });

    if (!answers[currentQuestionId] || !groupChallengeId || !userId || !groupId) {
      console.error("❌ Missing required data for submission:", {
        hasAnswer: !!answers[currentQuestionId],
        groupChallengeId,
        groupId,
        userId
      });
      setErrorMessage("Missing required data for submission. Please try refreshing the page.");
      return;
    }

    try {
      console.log('📡 Verifying answer...');
      // First verify answer is correct
      const verifyResponse = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionId: currentQuestionId,
          answer: answers[currentQuestionId].trim()
        }),
      });

      if (!verifyResponse.ok) {
        console.error('❌ Failed to verify answer:', {
          status: verifyResponse.status,
          statusText: verifyResponse.statusText,
          response: await verifyResponse.text()
        });
        throw new Error(`Failed to verify answer: ${verifyResponse.statusText}`);
      }

      const verifyData = await verifyResponse.json();
      console.log('✅ Answer verification result:', verifyData);

      // Log the question attempt
      await ActivityLogger.logQuestionAttempt(
        userId,
        challengeData.id,
        groupId,
        {
          questionId: currentQuestionId,
          answer: answers[currentQuestionId].trim(),
          isCorrect: verifyData.isCorrect,
          attemptNumber: verifyData.attemptCount,
          points: verifyData.isCorrect ? currentQuestion.points : 0,
          timestamp: new Date().toISOString()
        }
      );

      if (verifyData.isCorrect) {
        console.log('📡 Fetching question details...');
        // Get question details for points
        const questionResponse = await fetch(`https://database.rydersel.cloud/question/details?question_id=${currentQuestionId}`); // TODO: Set from env
        if (!questionResponse.ok) {
          console.error('❌ Failed to get question details:', {
            status: questionResponse.status,
            statusText: questionResponse.statusText
          });
          throw new Error(`Failed to get question details: ${questionResponse.statusText}`);
        }
        const questionData = await questionResponse.json();
        console.log('✅ Received question details:', questionData);
        
        console.log('📡 Completing question...', {
          userId,
          questionId: currentQuestionId,
          groupId,
          points: questionData.points
        });
        
        // Complete question and award points
        const completeResponse = await fetch('https://database.rydersel.cloud/question/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userId,
            question_id: currentQuestionId,
            group_challenge_id: groupChallengeId,
            points: questionData.points
          })
        });

        if (!completeResponse.ok) {
          const errorText = await completeResponse.text();
          console.error('❌ Failed to complete question:', {
            status: completeResponse.status,
            statusText: completeResponse.statusText,
            response: errorText
          });
          throw new Error(`Failed to complete question: ${completeResponse.statusText}`);
        }

        const completionData = await completeResponse.json();
        console.log('✅ Question completed successfully:', completionData);

        // Log the question completion
        await ActivityLogger.logQuestionCompletion(
          userId,
          challengeData.id,
          groupId,
          {
            questionId: currentQuestionId,
            pointsEarned: questionData.points,
            totalAttempts: verifyData.attemptCount,
            completionTime: new Date().toISOString()
          }
        );
        
        setUserPoints(completionData.points.points);
        setCompletedQuestions(prev => [...prev, { questionId: currentQuestionId, groupChallengeId }]);
        setShowCorrectAnimation(true);
        setTimeout(() => setShowCorrectAnimation(false), 2000);
        
        console.log('📝 Updated state after completion:', {
          newPoints: completionData.points.points,
          completedQuestions: [...completedQuestions, { questionId: currentQuestionId, groupChallengeId }]
        });
      } else {
        console.log('❌ Incorrect answer submitted');
        setShowIncorrectAnimation(true);
        setTimeout(() => setShowIncorrectAnimation(false), 1000);
      }
    } catch (error) {
      console.error('❌ Error submitting answer:', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  const renderQuestion = () => {
    if (!currentQuestion) return null;
    const isCompleted = completedQuestions.some(q => 
      q.questionId === currentQuestionId && q.groupChallengeId === groupChallengeId
    );
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

  const renderCompletionPage = () => {
    const allQuestionsCompleted = allQuestions.every(question =>
      completedQuestions.some(q => 
        q.questionId === question.id && q.groupChallengeId === groupChallengeId
      )
    );
    
    return (
      <div className="text-center">
        <Trophy className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-green-300 mb-4">Challenge Completed!</h2>
        <div className="mb-6">
          {allQuestions.map((question, index) => {
            const isCompleted = completedQuestions.some(q => 
              q.questionId === question.id && q.groupChallengeId === groupChallengeId
            );
            return (
              <div key={question.id} className="flex justify-between items-center mb-2">
                <span className="text-green-400">Objective {index + 1}</span>
                <div className="flex items-center">
                  <span className="text-green-200 mr-2">{question.points} pts</span>
                  {isCompleted && <Check className="w-5 h-5 text-green-400" />}
                </div>
              </div>
            );
          })}
        </div>
        {allQuestionsCompleted && (
          <button
            onClick={() => console.log("Challenge completed!")}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded transition duration-300 ease-in-out"
          >
            Complete Challenge
          </button>
        )}
      </div>
    );
  };

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

  if (isLoading || !challengeData) {
    return <LoadingAnimation error={loadError} errorMessage={errorMessage} />;
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
        groupChallengeId={groupChallengeId}
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

export const displayChallengePrompt = (props) => {
  return <ChallengePrompt {...props} />;
};
