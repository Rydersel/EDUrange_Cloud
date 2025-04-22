import React, { useState, useEffect } from 'react';
import { Terminal, ArrowRight, Check, Trophy, Info, X } from 'lucide-react';
import LoadingAnimation from '../util-components/loading-animation';
import JumbledText from '../util-components/jumbled-text';
import useWebOSConfig from '../../utils/useWebOSConfig';

// Create ActivityLogger class that uses the WebOS configuration
class ActivityLogger {
  static async logQuestionAttempt(userId, challengeId, groupId, metadata, databaseApiUrl) {
    try {
      // Use the proxy URL if we're in a browser environment
      const apiUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? `/api/database-proxy?path=activity/log`
        : `${databaseApiUrl}/activity/log`;

      console.log('🔄 Logging question attempt via:', apiUrl);

      // Ensure metadata is properly formatted
      const formattedMetadata = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'QUESTION_ATTEMPTED',
          userId,
          challengeId,
          groupId,
          metadata: formattedMetadata
        }),
      });

      if (!response.ok) {
        console.error('Failed to log question attempt:', await response.text());
      }
    } catch (error) {
      console.error('Error logging question attempt:', error);
    }
  }

  static async logQuestionCompletion(userId, challengeId, groupId, metadata, databaseApiUrl) {
    try {
      // Use the proxy URL if we're in a browser environment
      const apiUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? `/api/database-proxy?path=activity/log`
        : `${databaseApiUrl}/activity/log`;

      console.log('🔄 Logging question completion via:', apiUrl);

      // Ensure metadata is properly formatted
      const formattedMetadata = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'QUESTION_COMPLETED',
          userId,
          challengeId,
          groupId,
          metadata: formattedMetadata
        }),
      });

      if (!response.ok) {
        console.error('Failed to log question completion:', await response.text());
      }
    } catch (error) {
      console.error('Error logging question completion:', error);
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
  // First try to get from environment variable
  if (process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME) {
    console.log('✅ Using challenge instance ID from environment variable:', process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME);
    return process.env.NEXT_PUBLIC_CHALLENGE_POD_NAME;
  }

  // Fallback to hostname parsing
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('🔍 Falling back to extracting challenge instance ID from hostname:', hostname);

    // Get domain from environment variable or use a default
    const domain = process.env.NEXT_PUBLIC_DOMAIN_NAME || '';

    if (domain) {
      // Extract everything before the domain
      const match = hostname.split(`.${domain}`)[0];
      if (match) {
        console.log('✅ Successfully extracted challenge instance ID from hostname:', match);
        return match;
      }
    } else {
      // Fallback to splitting by the first dot if no domain is configured
      const match = hostname.split('.')[0];
      if (match) {
        console.log('✅ Successfully extracted challenge instance ID from hostname using first segment:', match);
        return match;
      }
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
  const config = useWebOSConfig();
  const databaseApiUrl = config.urls.databaseApi;
  const databaseApiProxyUrl = config.urls.databaseApiProxy;
  const instanceManagerProxyUrl = config.urls.instanceManagerProxy;

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitResetTime, setRateLimitResetTime] = useState(null);
  const [rateLimitStartTime, setRateLimitStartTime] = useState(null);
  const [initialWaitTime, setInitialWaitTime] = useState(0);

  // If the config is still loading, show a loading state
  useEffect(() => {
    if (config.isLoading) {
      setIsLoading(true);
    }
  }, [config.isLoading]);

  useEffect(() => {
    const fetchChallengeData = async () => {
      // Don't fetch if the config is still loading
      if (config.isLoading) return;

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

        // Try proxy first, then fall back to direct API calls
        let instanceData = null;
        let lastError = null;

        // Try using the proxy endpoint
        if (databaseApiProxyUrl) {
          try {
            // Ensure we have a full URL for the proxy
            const proxyUrl = `${databaseApiProxyUrl}?path=get_challenge_instance&challenge_instance_id=${challengeInstanceId}`;
            console.log('🔄 Attempting to fetch via proxy:', proxyUrl);
            const proxyResult = await fetchWithRetry(proxyUrl);
            if (proxyResult.ok) {
              instanceData = proxyResult.data;
              console.log('✅ Successfully fetched instance data via proxy');
            } else {
              lastError = proxyResult.error;
              console.warn('⚠️ Proxy fetch failed:', lastError);
            }
          } catch (error) {
            console.warn('⚠️ Error with proxy fetch:', error);
            lastError = error;
          }
        }

        // Fall back to direct API calls if proxy failed
        if (!instanceData && databaseApiUrl) {
          console.log('🔄 Falling back to direct API calls');
          // Try both URL formats
          const urls = [
            `${databaseApiUrl}/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`,
            `${databaseApiUrl}/api/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`
          ];

          for (const url of urls) {
            const result = await fetchWithRetry(url);
            if (result.ok) {
              instanceData = result.data;
              console.log('✅ Successfully fetched instance data directly:', url);
              break;
            }
            lastError = result.error;
          }
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
          // Try to fetch completed questions via proxy first
          let completedQuestionData = null;

          if (databaseApiProxyUrl) {
            try {
              const proxyUrl = `${databaseApiProxyUrl}?path=question/completed&user_id=${instanceData.userId}&group_challenge_id=${instanceData.groupChallengeId}`;
              console.log('🔄 Fetching completed questions via proxy:', proxyUrl);
              const completedProxyResult = await fetchWithRetry(proxyUrl);

              if (completedProxyResult.ok) {
                completedQuestionData = completedProxyResult.data.completed_questions;
                console.log('✅ Fetched completed questions via proxy:', completedQuestionData);
              }
            } catch (error) {
              console.warn('⚠️ Error fetching completed questions via proxy:', error);
            }
          }

          // Fall back to direct API call if proxy failed
          if (completedQuestionData === null && databaseApiUrl) {
            try {
              const directUrl = `${databaseApiUrl}/question/completed?user_id=${instanceData.userId}&group_challenge_id=${instanceData.groupChallengeId}`;
              console.log('🔄 Falling back to direct API for completed questions:', directUrl);
              const completedResult = await fetchWithRetry(directUrl);

              if (completedResult.ok) {
                completedQuestionData = completedResult.data.completed_questions;
                console.log('✅ Fetched completed questions directly:', completedQuestionData);
              }
            } catch (error) {
              console.warn('⚠️ Error fetching completed questions directly:', error);
            }
          }

          if (completedQuestionData) {
            setCompletedQuestions(completedQuestionData);
          }

          // Try to fetch user points via proxy first
          let userPointsData = null;

          if (databaseApiProxyUrl) {
            try {
              const proxyUrl = `${databaseApiProxyUrl}?path=get_points&user_id=${instanceData.userId}&group_id=${instanceData.groupId}`;
              console.log('🔄 Fetching user points via proxy:', proxyUrl);
              const pointsProxyResult = await fetchWithRetry(proxyUrl);

              if (pointsProxyResult.ok) {
                userPointsData = pointsProxyResult.data.points;
                console.log('✅ Fetched user points via proxy:', userPointsData);
              }
            } catch (error) {
              console.warn('⚠️ Error fetching user points via proxy:', error);
            }
          }

          // Fall back to direct API call if proxy failed
          if (userPointsData === null && databaseApiUrl) {
            try {
              const directUrl = `${databaseApiUrl}/get_points?user_id=${instanceData.userId}&group_id=${instanceData.groupId}`;
              console.log('🔄 Falling back to direct API for user points:', directUrl);
              const pointsResult = await fetchWithRetry(directUrl);

              if (pointsResult.ok) {
                userPointsData = pointsResult.data.points;
                console.log('✅ Fetched user points directly:', userPointsData);
              }
            } catch (error) {
              console.warn('⚠️ Error fetching user points directly:', error);
            }
          }

          if (userPointsData !== null) {
            setUserPoints(userPointsData);
          }
        }

        // Get challenge config with retry
        const configResult = await fetchWithRetry('/api/config');
        if (configResult.ok) {
          console.log('✅ Received config data:', configResult.data);

          // Handle both new format (object with apps array) and old format (direct array)
          const appsArray = Array.isArray(configResult.data)
            ? configResult.data
            : (configResult.data && Array.isArray(configResult.data.apps) ? configResult.data.apps : []);

          // Find the challenge app in the apps array
          const challengeApp = appsArray.find(app => app.id === 'challenge-prompt');
          if (challengeApp && challengeApp.challenge) {
            console.log('📝 Setting challenge data and initial question');
            setChallengeData(challengeApp.challenge);

            // Check if all questions are completed
            const allQuestions = challengeApp.challenge.pages.flatMap(page => page.questions) || [];
            const allQuestionsCompleted = allQuestions.length > 0 && completedQuestions.length >= allQuestions.length;

            // If all questions are completed, set the first question as current
            // The rendering logic will show the completion page
            setCurrentQuestionId(allQuestions[0]?.id);

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
  }, [config, databaseApiUrl, databaseApiProxyUrl]);

  // Calculate remaining time for the rate limit
  const getRemainingTime = () => {
    if (!rateLimitResetTime) return null;

    const diff = Math.max(0, rateLimitResetTime.getTime() - currentTime.getTime());
    const minutes = Math.floor(diff / (60 * 1000));
    const seconds = Math.floor((diff % (60 * 1000)) / 1000);

    return { minutes, seconds, total: diff };
  };

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Automatically clear rate limit when time has expired
  useEffect(() => {
    if (rateLimited && rateLimitResetTime && currentTime >= rateLimitResetTime) {
      console.log('🔄 Rate limit period has expired, enabling form');
      setRateLimited(false);
      setRateLimitResetTime(null);
      setSubmitError(null);
    }
  }, [currentTime, rateLimited, rateLimitResetTime]);

  // Add a new useEffect to automatically complete the challenge when all questions are completed
  useEffect(() => {
    // Skip if we don't have the necessary data yet
    if (!challengeData || !userId || !groupChallengeId || !groupId || completedQuestions.length === 0) {
      return;
    }

    const allQuestions = challengeData.pages.flatMap(page => page.questions) || [];

    // Check if all questions are completed
    const allQuestionsCompleted = allQuestions.every(question =>
      completedQuestions.some(q =>
        q.questionId === question.id && q.groupChallengeId === groupChallengeId
      )
    );

    // If all questions are completed, automatically complete the challenge
    if (allQuestionsCompleted) {
      const completeChallenge = async () => {
        try {
          console.log('📡 Auto-completing challenge...', {
            userId,
            groupChallengeId,
            challengeId: challengeData.id,
            groupId
          });

          // Calculate total points earned
          const pointsEarned = allQuestions.reduce((total, q) => {
            const completed = completedQuestions.some(cq =>
              cq.questionId === q.id && cq.groupChallengeId === groupChallengeId
            );
            return completed ? total + q.points : total;
          }, 0);

          // Call the API to complete the challenge
          const response = await fetch(`${databaseApiUrl}/competition/complete-challenge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId,
              groupChallengeId: groupChallengeId,
              challengeId: challengeData.id,
              groupId: groupId,
              pointsEarned: pointsEarned
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to auto-complete challenge:', {
              status: response.status,
              statusText: response.statusText,
              response: errorText
            });
            return;
          }

          const completionData = await response.json();
          console.log('✅ Challenge auto-completed successfully:', completionData);
        } catch (error) {
          console.error('❌ Error auto-completing challenge:', {
            error: error.message,
            stack: error.stack
          });
        }
      };

      completeChallenge();
    }
  }, [challengeData, userId, groupChallengeId, groupId, completedQuestions]);

  const allQuestions = challengeData?.pages.flatMap(page => page.questions) || [];
  const currentQuestion = allQuestions.find(q => q.id === currentQuestionId);
  const allQuestionsCompleted = completedQuestions.length === allQuestions.length;

  const handleChange = (value) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionId]: value
    }));
  };

  const submitAnswer = async (questionId, answer) => {
    if (!challengeData) return false;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      console.log('🔄 Submitting answer for question:', questionId);

      // Find the question in the challenge data
      const question = allQuestions.find(q => q.id === questionId);
      if (!question) {
        console.error('❌ Question not found:', questionId);
        throw new Error('Question not found');
      }

      let isCorrect = false;

      if (question.type === 'flag') {
        try {
          // Try to verify flag via proxy first
          let flagVerified = null;

          if (instanceManagerProxyUrl) {
            try {
              console.log('🔄 Verifying flag via proxy:', instanceManagerProxyUrl);
              const response = await fetch(`${instanceManagerProxyUrl}?path=get-secret`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  secret_name: challengeData.flagSecretName,
                  namespace: 'default'
                })
              });

              // Handle the response more thoroughly
              if (response.ok) {
                const data = await response.json();
                console.log('✅ Proxy response received:', JSON.stringify(data).substring(0, 100));

                if (data && typeof data.secret_value !== 'undefined') {
                  console.log('✅ Flag verification via proxy successful');
                  flagVerified = answer === data.secret_value;
                  console.log(`🏁 Flag verification result: ${flagVerified ? 'CORRECT' : 'INCORRECT'}`);
                } else {
                  console.warn('⚠️ Flag verification via proxy returned invalid format:', data);
                  // Don't set flagVerified, let it fall back to direct API call
                }
              } else {
                const errorText = await response.text();
                console.warn(`⚠️ Flag verification via proxy failed (${response.status}): ${errorText}`);
                // Don't throw, just let it fall back to direct API call
              }
            } catch (error) {
              console.warn('⚠️ Error verifying flag via proxy:', error);
              // Don't throw, just let it fall back to direct API call
            }
          } else {
            console.warn('⚠️ No instanceManagerProxyUrl available for flag verification');
          }

          // Fall back to direct API call if proxy failed
          if (flagVerified === null) {
            try {
              console.log('🔄 Falling back to direct API call for flag verification');
              const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  questionId,
                  answer
                })
              });

              // Handle the response thoroughly
              if (response.ok) {
                const data = await response.json();

                if (data && typeof data.isCorrect !== 'undefined') {
                  console.log('✅ Flag verification via config API successful');
                  flagVerified = data.isCorrect;
                  console.log(`🏁 Flag verification result: ${flagVerified ? 'CORRECT' : 'INCORRECT'}`);

                  // Check if there's a note field in the response (from fallback verification)
                  if (data.note) {
                    console.log('ℹ️ Verification note:', data.note);
                  }
                } else {
                  console.warn('⚠️ Flag verification via config API returned invalid format:', data);
                  throw new Error('Invalid response format from config API');
                }
              } else {
                const errorText = await response.text();
                console.warn(`⚠️ Flag verification via config API failed (${response.status}): ${errorText}`);
                throw new Error(`Failed to verify flag: ${errorText}`);
              }
            } catch (error) {
              console.error('❌ Error verifying flag via config API:', error);
              throw error;
            }
          }

          if (flagVerified === null) {
            throw new Error('Failed to verify flag after all attempts');
          }

          isCorrect = flagVerified;
        } catch (error) {
          console.error('❌ Error verifying flag:', error);
          throw error;
        }
      } else {
        // For non-flag questions, check against the hardcoded answer
        isCorrect = answer === question.answer;
      }

      // ... rest of the function ...
    } catch (error) {
      // ... error handling ...
    }
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
      // Reset rate limit state when trying a new submission
      setRateLimited(false);
      setRateLimitResetTime(null);

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

      // Handle rate limiting (HTTP 429)
      if (verifyResponse.status === 429) {
        const rateData = await verifyResponse.json();
        console.warn('⚠️ Rate limit exceeded:', rateData);

        // Extract reset time
        const resetTime = new Date(rateData.resetTime);
        const now = new Date();

        // Get wait minutes from API or calculate if not provided
        const waitMinutes = rateData.waitMinutes || Math.ceil((resetTime - now) / (60 * 1000));

        // Calculate the total wait time in milliseconds
        const totalWaitMs = resetTime.getTime() - now.getTime();

        // Set rate limit state
        setRateLimited(true);
        setRateLimitResetTime(resetTime);
        setRateLimitStartTime(now);
        setInitialWaitTime(totalWaitMs);

        // Set user-friendly error message
        setSubmitError(`Too many attempts. Please wait ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''} before trying again.`);
        return;
      }

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
        },
        databaseApiUrl
      );

      if (verifyData.isCorrect) {
        console.log('📡 Fetching question details...');
        // Get question details for points
        const questionDetailsUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? `${databaseApiProxyUrl}?path=question/details&question_id=${currentQuestionId}`
          : `${databaseApiUrl}/question/details?question_id=${currentQuestionId}`;

        console.log('🔄 Fetching question details via:', questionDetailsUrl);
        const questionResponse = await fetch(questionDetailsUrl);

        if (!questionResponse.ok) {
          console.error('❌ Failed to get question details:', {
            status: questionResponse.status,
            statusText: questionResponse.statusText,
            response: await questionResponse.text()
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
        const completeQuestionUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? `${databaseApiProxyUrl}?path=question/complete`
          : `${databaseApiUrl}/question/complete`;

        console.log('🔄 Completing question via:', completeQuestionUrl);
        const completeResponse = await fetch(completeQuestionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userId,
            question_id: currentQuestionId,
            group_challenge_id: groupChallengeId,
            is_correct: verifyData.isCorrect,
            points: verifyData.isCorrect ? questionData.points : 0
          }),
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
          },
          databaseApiUrl
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

    // Get remaining time for rate limit countdown
    const remainingTime = getRemainingTime();

    return (
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <p className="text-green-400">{currentQuestion.content}</p>
          <span className="ml-2 px-2 py-1 bg-green-900 text-green-200 text-xs font-semibold rounded">
            {currentQuestion.points} pts
          </span>
        </div>

        {rateLimited && remainingTime && (
          <div className="mb-4 p-3 rounded bg-yellow-900 text-yellow-200">
            <p className="mb-2">Too many attempts. Please wait before trying again.</p>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono bg-black bg-opacity-30 px-3 py-1 rounded">
                <span className="font-bold text-lg">
                  {String(remainingTime.minutes).padStart(2, '0')}:{String(remainingTime.seconds).padStart(2, '0')}
                </span>
              </div>
              <span className="text-sm opacity-80">Time remaining until next attempt</span>
            </div>

            {/* Progress bar - calculate percentage based on actual elapsed time */}
            {rateLimitResetTime && rateLimitStartTime && initialWaitTime > 0 && (
              <div className="w-full h-2 bg-black bg-opacity-30 rounded overflow-hidden">
                <div
                  className="h-full bg-yellow-400 transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(0, Math.min(100, 100 - ((remainingTime.total / initialWaitTime) * 100)))}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {submitError && !rateLimited && (
          <div className="mb-4 p-3 rounded bg-red-900 text-red-200">
            <p>{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={answers[currentQuestionId] || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={`flex-grow px-3 py-2 bg-black border rounded-md focus:outline-none focus:ring-2 transition-all duration-300 ${
              showIncorrectAnimation
                ? 'border-red-500 focus:ring-red-500 shake'
                : rateLimited
                  ? 'border-yellow-500 focus:ring-yellow-500'
                  : 'border-green-700 focus:ring-green-600'
            } text-green-100`}
            placeholder="Enter your answer..."
            disabled={isCompleted || rateLimited}
          />
          {!isCompleted && !rateLimited && (
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
          <div className="text-green-400 mt-4">
            <p>All objectives completed! Your progress has been saved.</p>
            <p className="mt-2">You can now close this window or continue exploring.</p>
          </div>
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
