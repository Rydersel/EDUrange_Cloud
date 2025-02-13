import React from 'react';
import { AlertOctagon } from 'lucide-react';

export const LoadingAnimation = ({ error = false, errorMessage = "Failed to load challenge data" }) => {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black p-8">
        <div className="relative w-32 h-32 mb-8">
          {/* Error icon with fade animation */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <AlertOctagon className="w-20 h-20 text-red-500 animate-[pulse_2s_ease-in-out_infinite]" />
              {/* Subtle glow effect */}
              <div className="absolute inset-0 w-20 h-20 bg-red-500 opacity-20 blur-xl rounded-full animate-[pulse_2s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
        {/* Error message with typing effect */}
        <div className="text-red-400 text-lg font-mono relative mb-4">
          <span className="inline-block">
            {errorMessage}
          </span>
          <span className="inline-block animate-[blink_1s_step-end_infinite]">_</span>
        </div>
        {/* Retry button */}
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-300 font-mono
                     border border-red-400 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50
                     animate-[fadeIn_0.5s_ease-in-out]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-black p-8">
      <div className="relative w-32 h-32 mb-8">
        {/* Rotating outer circle */}
        <div className="absolute inset-0 border-4 border-green-500/20 rounded-full animate-[spin_3s_linear_infinite]">
          <div className="absolute top-0 left-1/2 w-4 h-4 -ml-2 -mt-2 bg-green-500 rounded-full"></div>
        </div>
        {/* Inner scanning line */}
        <div className="absolute inset-4 border-2 border-green-400/40 rounded-full overflow-hidden">
          <div className="absolute w-full h-1 bg-green-400/60 top-1/2 transform -translate-y-1/2 animate-[scan_2s_ease-in-out_infinite]"></div>
        </div>
        {/* Center lock icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-green-400 rounded-lg flex items-center justify-center">
            <div className="w-6 h-4 border-2 border-green-400 rounded-t-lg"></div>
          </div>
        </div>
      </div>
      {/* Loading text with typing effect */}
      <div className="text-green-400 text-lg font-mono relative">
        <span className="inline-block animate-[pulse_1.5s_ease-in-out_infinite]">
          Initializing Challenge Module
        </span>
        <span className="inline-block animate-[blink_1s_step-end_infinite]">_</span>
      </div>
      <style jsx global>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-100%); }
          50% { transform: translateY(100%); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default LoadingAnimation; 