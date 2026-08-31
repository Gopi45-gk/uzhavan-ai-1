import React, { useState } from 'react';
import { Menu, User, Phone, Globe } from 'lucide-react';
import { Screen, User as UserType } from '../types';

interface Props {
  user: UserType | null;
  onNavigate: (screen: Screen) => void;
  onBack: () => void;
  t: (key: string) => string;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
}

const Dashboard: React.FC<Props> = ({ user, onNavigate, onBack, t, selectedLanguage, onLanguageChange }) => {
  const [isLangOpen, setIsLangOpen] = useState(false);

  const languages = [
    { code: 'tamil', native: 'தமிழ்' },
    { code: 'english', native: 'English' },
    { code: 'telugu', native: 'తెలుగు' },
    { code: 'kannada', native: 'ಕನ್ನಡ' },
    { code: 'malayalam', native: 'മലയാളം' },
    { code: 'hindi', native: 'हिंदी' }
  ];

  const gridItems = [
    {
      label: selectedLanguage === 'english' ? 'WEATHER' : t('home_weather'),
      screen: 'weather' as Screen,
      image: "https://www.image2url.com/r2/default/images/1780586826844-78d20c70-8bb5-4975-a8bd-4f45b6049dde.png",
      hasWhiteBorder: false,
    },
    {
      label: selectedLanguage === 'english' ? 'CROP RECOMMENDATION' : t('home_cropRec'),
      screen: 'crop-recommendation' as Screen,
      image: "https://www.image2url.com/r2/default/images/1780586547598-a8bde4bf-e64d-4269-b22e-144ea422f6bb.png",
      hasWhiteBorder: false,
    },
    {
      label: selectedLanguage === 'english' ? 'DISEASE PREDICTION' : t('home_disease'),
      screen: 'disease-prediction' as Screen,
      image: "https://www.image2url.com/r2/default/images/1780586675988-cedbec10-6e11-4e22-acf2-b7b654bae02c.png",
      hasWhiteBorder: false,
    },
    {
      label: selectedLanguage === 'english' ? 'UZHAVAN AI' : t('home_ai'),
      screen: 'chat' as Screen,
      image: "https://www.image2url.com/r2/default/images/1780565599938-ab88f7d4-fbb7-4f5f-a327-fbb0acae9262.png",
      hasWhiteBorder: true,
    },
    {
      label: selectedLanguage === 'english' ? 'MARKET INSIGHT' : t('home_market'),
      screen: 'market-insight' as Screen,
      image: "https://www.image2url.com/r2/default/images/1780586459238-fac1b2ca-f310-4120-8c0b-88000c037f0d.png",
      hasWhiteBorder: false,
    },
    {
      label: selectedLanguage === 'english' ? 'PHONE CALL' : t('home_phoneCall'),
      screen: 'phone-call' as Screen,
      isPhoneCall: true,
    },
  ];

  return (
    <div className="relative flex flex-col h-screen overflow-hidden font-['Inter']">

      {/* FULL SCREEN BACKGROUND IMAGE */}
      <div
        className="absolute inset-0 bg-cover bg-center z-0 pointer-events-none"
        style={{
          backgroundImage: `url('https://www.image2url.com/r2/default/images/1780586871426-6bcc4ce5-a990-463b-aaed-a21b2162f6ec.jpg')`,
        }}
      />
      {/* Light Overlay */}
      <div className="absolute inset-0 bg-black/5 z-0 pointer-events-none" />

      {/* HEADER LAYOUT */}
      <header className="relative z-50 flex items-center justify-between px-5 pt-7 pb-2 min-h-[60px]">
        {/* Left: Hamburger Menu Icon */}
        <div className="relative">
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="p-1 -ml-1 text-black hover:opacity-70 active:scale-95 transition-all"
            aria-label="Menu"
          >
            <Menu size={30} strokeWidth={2.5} className="text-black" />
          </button>

          {/* Language Selection Drawer / Dropdown */}
          {isLangOpen && (
            <div
              className="absolute top-[45px] left-0 w-[180px] bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 py-2 z-50"
              style={{ animation: 'fadeSlideDown 200ms ease-out forwards' }}
            >
              <div className="px-4 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 border-b border-gray-100 mb-1">
                <Globe size={12} /> Language
              </div>
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    onLanguageChange(l.code);
                    setIsLangOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors ${selectedLanguage === l.code ? 'text-[#2da95c] bg-green-50' : 'text-gray-700 hover:bg-green-50 hover:text-[#2da95c]'}`}
                >
                  {l.native}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Text Logo UZHAVAN AI */}
        <div className="flex items-center justify-center">
          <span className="text-[28px] font-[1000] italic text-[#2da95c] uppercase tracking-tighter drop-shadow-sm select-none">
            UZHAVAN AI
          </span>
        </div>

        {/* Right: Profile Icon */}
        <div
          onClick={() => onNavigate('farmer-profile' as Screen)}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center border-2 border-[#2da95c] shadow-md active:scale-95 transition-transform cursor-pointer"
        >
          <User size={24} className="text-[#2da95c]" />
        </div>
      </header>

      {/* 2-COLUMN GRID LAYOUT */}
      <main className="relative z-10 flex-1 px-4 pt-4 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 items-start justify-items-center max-w-xs sm:max-w-sm mx-auto">
          {gridItems.map((item, idx) => {
            const isPhone = item.isPhoneCall;
            const hasWhiteBorder = item.hasWhiteBorder;

            return (
              <div
                key={idx}
                onClick={() => onNavigate(item.screen)}
                className="flex flex-col items-center group cursor-pointer active:scale-[1.03] transition-transform duration-200"
              >
                {/* CIRCULAR ILLUSTRATION ICON */}
                {isPhone ? (
                  /* Phone Call Button: Green circular button #64FF45 with white phone icon */
                  <div className="w-[135px] h-[135px] rounded-full bg-[#64FF45] flex items-center justify-center shadow-lg transition-transform overflow-hidden">
                    <Phone size={70} className="text-white fill-white stroke-[2]" />
                  </div>
                ) : (
                  /* Standard Image Illustration Circle */
                  <div className={`w-[135px] h-[135px] rounded-full flex items-center justify-center overflow-hidden transition-transform ${hasWhiteBorder ? 'border-4 border-white shadow-md' : ''}`}>
                    <img
                      src={item.image}
                      alt={item.label}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                )}

                {/* FEATURE LABEL */}
                <span className="mt-2 text-[13px] font-[900] italic text-black uppercase text-center tracking-tight leading-tight whitespace-pre-line px-1 drop-shadow-sm">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom Spacing */}
        <div className="h-12" />
      </main>

      <style>{`
        body { margin: 0; padding: 0; background-color: #f1f8f3; }
        .app-container { background-color: transparent !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        h1, span { font-family: 'Noto Sans Tamil', 'Inter', 'Poppins', sans-serif; }
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
