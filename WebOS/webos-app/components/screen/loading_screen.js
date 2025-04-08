'use client';

import React from 'react';

const LoadingScreen = ({ isLoading, progress, statusMessage }) => {
  return (
    <div 
      className={`absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center z-50 transition-all duration-500 ${
        isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Modern Logo Animation */}
      <div className="mb-12 relative">
        <div className="w-24 h-24 relative">
          <div className="absolute inset-0 border-4 border-blue-500 rounded-lg animate-[spin_3s_linear_infinite]" 
               style={{ borderRadius: '30%' }} />
          <div className="absolute inset-0 border-4 border-purple-500 rounded-lg animate-[spin_3s_linear_infinite_reverse]" 
               style={{ borderRadius: '30%', animationDelay: '-1.5s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-2xl font-light">WebOS</span>
          </div>
        </div>
      </div>

      {/* Loading Bar */}
      <div className="w-80 h-1 bg-gray-800 rounded-full overflow-hidden mb-6 relative">
        <div 
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ 
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)'
          }}
        />
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)] animate-[shimmer_2s_infinite]" />
      </div>

      {/* Status Message */}
      <div className="text-gray-300 text-base font-light tracking-wider mb-8">
        {statusMessage || 'Loading WebOS...'}
      </div>

      {/* Loading Dots */}
      <div className="flex space-x-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-[bounce_1s_ease-in-out_infinite]"
            style={{
              animationDelay: `${i * 0.2}s`,
              background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
            }}
          />
        ))}
      </div>

      {/* System Info */}
      <div className="absolute bottom-6 left-6 text-gray-600 text-sm font-light tracking-wider">
        v1.0
      </div>

      {/* Performance Monitor Tip */}
      <div className="absolute bottom-6 right-6 text-gray-600 text-sm font-light tracking-wider">
        Alt+P for Performance
      </div>

      {/* Add keyframe animations to global styles */}
      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen; 