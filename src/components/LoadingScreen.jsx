import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
      <div className="relative">
        {/* Animated Rings */}
        <div className="w-32 h-32 border-8 border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain animate-pulse" />
        </div>
      </div>
      
      <h1 className="mt-8 text-4xl font-extrabold text-indigo-950 tracking-tight text-center">
        Sri Krishna Dairy
      </h1>
      
      <div className="mt-4 flex items-center gap-2">
        <div className="h-1.5 w-48 bg-indigo-50 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full animate-[loading_5s_ease-in-out_infinite]"></div>
        </div>
      </div>
      
      <p className="mt-4 text-indigo-500 font-medium animate-bounce">
        Preparing your dashboard...
      </p>

      <style>{`
        @keyframes loading {
          0% { width: 0%; transform: translateX(-10%); }
          50% { width: 60%; transform: translateX(0%); }
          100% { width: 100%; transform: translateX(0%); }
        }
      `}</style>
    </div>
  );
}
