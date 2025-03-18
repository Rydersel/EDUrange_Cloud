import React from 'react';

const LogDisplay = ({ logs }) => {
  return (
    <div className="bg-gray-100 rounded-md p-4 h-64 overflow-y-auto font-mono text-sm">
      {logs.length === 0 ? (
        <p className="text-gray-500 italic">No logs to display</p>
      ) : (
        logs.map((log, index) => (
          <div key={index} className="mb-1">
            <span className="text-gray-500">[{index + 1}]</span> {log}
          </div>
        ))
      )}
    </div>
  );
};

export default LogDisplay; 