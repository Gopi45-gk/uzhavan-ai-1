import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface Props {
  userType: 'farmer' | 'public';
  onChoice: (choice: 'login' | 'register') => void;
  onBack: () => void;
  t: (key: string) => string;
}

const AuthChoice: React.FC<Props> = ({ userType, onChoice, onBack, t }) => {
  // Illustrations based on user type
  const illustrationUrl = "https://www.image2url.com/r2/default/images/1786974878319-c376d3fb-dd06-4ff3-b079-c1a0cc9e480a.png";

  return (
    <div className="flex flex-col h-screen bg-[#EAF7EE] font-['Inter'] relative overflow-hidden">

      {/* Back Arrow - Fixed position with equal margins */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={onBack}
          className="text-[#0b3d2e] hover:opacity-70 transition-opacity active:scale-90"
        >
          <ArrowLeft size={32} strokeWidth={2.5} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">

        {/* Illustration Section */}
        {userType === 'farmer' ? (
          /* FARMER: Full-width landscape illustration (no circle) */
          <div className="flex-1 flex items-center justify-center px-4 pt-16">
            <img
              src={illustrationUrl}
              alt="Farmer Illustration"
              className="w-full max-w-md h-auto object-contain pointer-events-none"
            />
          </div>
        ) : (
          /* PUBLIC: Circular image (existing design) */
          <div className="flex-1 flex items-center justify-center px-6 pt-16">
            <div className="w-72 h-72 rounded-full overflow-hidden flex items-center justify-center bg-[#1a3a5c]">
              <img
                src={illustrationUrl}
                alt="Public Group Illustration"
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
          </div>
        )}

        {/* Buttons Section - Centered with consistent margins */}
        <div className="w-full max-w-sm mx-auto px-6 pb-12 space-y-5">
          {/* LOGIN Button */}
          <button
            onClick={() => onChoice('login')}
            className="w-full bg-[#2da95c] text-black font-[900] text-3xl py-6 rounded-[22px] shadow-sm uppercase tracking-tighter transition-all active:translate-y-1 active:shadow-none"
          >
            {t('login')}
          </button>

          {/* REGISTER Button */}
          <button
            onClick={() => onChoice('register')}
            className="w-full bg-[#2da95c] text-black font-[900] text-3xl py-6 rounded-[22px] shadow-sm uppercase tracking-tighter transition-all active:translate-y-1 active:shadow-none"
          >
            {t('register')}
          </button>
        </div>
      </div>

      <style>{`
        body { background-color: #EAF7EE; }
      `}</style>
    </div>
  );
};

export default AuthChoice;
