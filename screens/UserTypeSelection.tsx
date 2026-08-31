import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface Props {
  onSelect: (type: 'farmer' | 'public') => void;
  onBack: () => void;
  t: (key: string) => string;
}

const UserTypeSelection: React.FC<Props> = ({ onSelect, onBack, t }) => {
  return (
    <div className="flex flex-col h-screen bg-[#EAF7EE] font-['Inter'] relative overflow-hidden">
      
      {/* Top Left: Small back arrow icon */}
      <div className="p-6">
        <button 
          onClick={onBack} 
          className="text-white hover:text-white transition-colors active:scale-90"
        >
          <ArrowLeft size={32} className="stroke-white" strokeWidth={3} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-start pt-10">
        
        {/* Farmer Section (Top) */}
        <div 
          onClick={() => onSelect('farmer')}
          className="flex items-center px-4 mb-24 cursor-pointer group"
        >
          {/* Farmer standing image - NOT in a circle */}
          <div className="w-[45%] flex justify-center items-end">
            <img 
              src="https://www.image2url.com/r2/default/images/1786974878319-c376d3fb-dd06-4ff3-b079-c1a0cc9e480a.png" 
              alt="Farmer standing" 
              className="w-full max-w-[160px] h-auto object-contain transition-transform group-active:scale-95" 
            />
          </div>
          
          {/* Green rounded rectangle button */}
          <div className="flex-1 pr-6">
            <button className="w-full bg-[#2da95c] text-black font-black text-3xl py-7 rounded-[22px] uppercase tracking-tighter shadow-sm transition-all group-active:translate-y-1">
              {t('farmer')}
            </button>
          </div>
        </div>

        {/* Public Section (Bottom) */}
        <div 
          onClick={() => onSelect('public')}
          className="flex items-center px-4 cursor-pointer group"
        >
          {/* Public Group - Large Circular Illustration */}
          <div className="w-[45%] flex justify-center items-center">
            <div className="w-40 h-40 rounded-full overflow-hidden transition-transform group-active:scale-95 shadow-sm">
              <img 
                src="https://www.image2url.com/r2/default/images/1786974878319-c376d3fb-dd06-4ff3-b079-c1a0cc9e480a.png" 
                alt="Public group" 
                className="w-full h-full object-cover" 
              />
            </div>
          </div>
          
          {/* Green rounded rectangle button */}
          <div className="flex-1 pr-6">
            <button className="w-full bg-[#2da95c] text-black font-black text-3xl py-7 rounded-[22px] uppercase tracking-tighter shadow-sm transition-all group-active:translate-y-1">
              {t('public')}
            </button>
          </div>
        </div>

      </div>

      <style>{`
        body { background-color: #EAF7EE; }
        /* Replicating the white back arrow from the reference image shadow/look */
        svg.stroke-white {
          filter: drop-shadow(0px 1px 1px rgba(0,0,0,0.1));
        }
      `}</style>
    </div>
  );
};

export default UserTypeSelection;
