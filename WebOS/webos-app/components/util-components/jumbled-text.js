import React, { useState, useEffect } from 'react';

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

export default JumbledText; 