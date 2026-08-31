import React from 'react';

const SplashScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#f1f8f3] overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center w-full px-10">
        {/* Main Illustration */}
        <div className="w-full max-w-[280px] aspect-square mb-6">
          <img 
            src="https://www.image2url.com/r2/default/images/1786963828613-524f73c2-1cb6-4ad6-8be0-271aace71026.png" 
            alt="Uzhavan AI Logo" 
            className="w-full h-full object-contain drop-shadow-md"
          />
        </div>
        
        {/* Premium Branding */}
        <div className="text-center">
          <h1 className="text-[56px] font-black text-[#0b3d2e] tracking-tight leading-none italic uppercase">
            UZHAVAN
          </h1>
          <div className="flex items-center justify-center gap-4 mt-1">
            <div className="h-[2px] w-12 bg-[#2da95c]"></div>
            <h2 className="text-2xl font-black text-[#2da95c] tracking-[0.5em] uppercase pl-[0.5em]">
              AI
            </h2>
            <div className="h-[2px] w-12 bg-[#2da95c]"></div>
          </div>
        </div>
      </div>
      
      {/* Minimalist Progress Bar */}
      <div className="w-full max-w-[140px] h-1.5 bg-emerald-100/50 rounded-full overflow-hidden mb-24">
        <div className="h-full bg-gradient-to-r from-[#2da95c] to-[#0b3d2e] animate-[loading_2s_infinite_ease-in-out]"></div>
      </div>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); width: 30%; }
          50% { transform: translateX(50%); width: 60%; }
          100% { transform: translateX(200%); width: 30%; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
