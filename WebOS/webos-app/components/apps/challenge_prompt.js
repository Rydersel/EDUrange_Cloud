import React, { useState, useEffect } from 'react';

export default function ChallengePrompt({ description, pages }) {
  const [answers, setAnswers] = useState({});
  const [answeredCorrectly, setAnsweredCorrectly] = useState({});
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    console.log('Challenge data received in ChallengePrompt:', pages);
  }, [pages]);

  if (!pages) {
    console.error('Challenge or pages not defined', { pages });
    return <div>Error: Challenge data is not available.</div>;
  }

  const handleChange = (questionId, value) => {
    setAnswers({
      ...answers,
      [questionId]: value
    });
  };

  const handleKeyPress = (questionId, e) => {
    if (e.key === 'Enter') {
      setAnsweredCorrectly({
        ...answeredCorrectly,
        [questionId]: true
      });
    }
  };

  const handleNextPage = () => {
    setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    setCurrentPage(currentPage - 1);
  };

  const renderQuestion = (question) => {
    const isAnsweredCorrectly = answeredCorrectly[question.id];
    return (
      <div key={question.id} className="flex flex-col mb-4">
        <label htmlFor={question.id} className="text-white">
          {question.content} (Points: {question.points})
        </label>
        <input
          type="text"
          id={question.id}
          value={answers[question.id] || ''}
          onChange={(e) => handleChange(question.id, e.target.value)}
          onKeyPress={(e) => handleKeyPress(question.id, e)}
          className={`bg-gray-700 text-white ${isAnsweredCorrectly ? 'bg-gray-500' : ''}`}
          disabled={isAnsweredCorrectly}
        />
        {isAnsweredCorrectly && (
          <div className="text-green-500 mt-2">Correct!</div>
        )}
      </div>
    );
  };

  const currentInstructions = pages[currentPage]?.instructions || 'No instructions available.';
  const currentQuestions = pages[currentPage]?.questions || [];

  return (
    <div className="h-full w-full bg-ub-grey flex flex-col">
      <div className="flex justify-between items-center p-4 bg-gray-800 text-white">
        <h1 className="text-xl">Challenge Prompt</h1>
      </div>
      <div className="p-4 text-white">
        <p>{description}</p>
        <p>{currentInstructions}</p>
        {currentQuestions.map(renderQuestion)}
        <div className="flex justify-between mt-4">
          {currentPage > 0 && (
            <button
              onClick={handlePrevPage}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Previous Page
            </button>
          )}
          {currentPage < pages.length - 1 && (
            <button
              onClick={handleNextPage}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              disabled={currentQuestions.some(q => !answeredCorrectly[q.id])}
            >
              Next Page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const displayChallengePrompt = (props) => {
  return <ChallengePrompt {...props} />;
};
