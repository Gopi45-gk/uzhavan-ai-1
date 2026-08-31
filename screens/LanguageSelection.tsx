import React from 'react';
import { ArrowLeft, Globe } from 'lucide-react';

interface Props {
  onSelect: (lang: string) => void;
  onBack: () => void;
  t: (key: string) => string;
}

const LanguageSelection: React.FC<Props> = ({ onSelect, onBack, t }) => {
  const languages = [
    { label: 'தமிழ்', value: 'tamil', subtitle: 'TAMIL', color: '#27ae60' },
    { label: 'ENGLISH', value: 'english', subtitle: 'ENGLISH', color: '#27ae60' },
    { label: 'తెలుగు', value: 'telugu', subtitle: 'TELUGU', color: '#2ecc71' },
    { label: 'മലയാളം', value: 'malayalam', subtitle: 'MALAYALAM', color: '#2ecc71' },
    { label: 'ಕನ್ನಡ', value: 'kannada', subtitle: 'KANNADA', color: '#2980b9' },
    { label: 'हिंदी', value: 'hindi', subtitle: 'HINDI', color: '#f39c12' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f8f3] font-['Inter'] relative overflow-x-hidden">

      {/* Navigation Header */}
      <div className="flex justify-between items-center p-6 z-20">
        <button
          onClick={onBack}
          className="bg-white p-3 rounded-2xl shadow-sm text-[#0c3b2e] active:scale-90 transition-transform"
        >
          <ArrowLeft size={24} strokeWidth={3} />
        </button>
        <div className="bg-[#0c3b2e] text-white px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg border border-white/10">
          <Globe size={14} />
          <span className="text-[10px] font-black tracking-widest uppercase">SELECT LANGUAGE</span>
        </div>
      </div>

      {/* Hero Illustration - No Card, Centered */}
      <div className="w-full flex justify-center px-4 mt-2 mb-4">
        <img
          src="https://image2url.com/r2/default/images/1772856084467-372d8cf5-482d-4db6-9ca3-e4c3469cf090.png"
          alt="Agriculture Community"
          className="w-full max-w-[320px] h-auto object-contain pointer-events-none drop-shadow-2xl"
        />
      </div>

      {/* Bold Center Heading */}
      <div className="text-center px-6 mb-8">
        <h1 className="text-[34px] font-[900] text-[#0b3d2e] leading-tight tracking-tighter uppercase italic whitespace-pre-line">
          {t('selectLanguage').replace('YOUR ', 'YOUR\n')}
        </h1>
      </div>

      {/* Language Grid - Equal Size Vibrant Buttons */}
      <div className="flex-1 px-6 pb-12">
        <div className="grid grid-cols-2 gap-4">
          {languages.map((lang) => (
            <button
              key={lang.value}
              onClick={() => onSelect(lang.value)}
              style={{ backgroundColor: lang.color }}
              className="relative group h-28 rounded-[32px] flex flex-col items-center justify-center text-white shadow-xl border-b-[5px] border-black/10 transition-all active:scale-95 active:border-b-0 active:translate-y-1 overflow-hidden"
            >
              {/* Glossy top highlight */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/10 pointer-events-none" />

              <span className="text-[30px] font-black leading-none mb-1 drop-shadow-md tracking-tight">
                {lang.label}
              </span>
              <span className="text-[10px] font-black tracking-[0.2em] opacity-70">
                {lang.subtitle}
              </span>

              {/* Shine effect on hover/active */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-active:opacity-100 transition-opacity"></div>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        body { background-color: #f1f8f3; }
        .app-container { background-color: #f1f8f3; }
      `}</style>
    </div>
  );
};

export default LanguageSelection;
