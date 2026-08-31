import React, { useState, useEffect } from 'react';
import { ArrowLeft, Newspaper, ExternalLink, LineChart, TrendingUp, Search } from 'lucide-react';
import { getGroundingData } from '../services/geminiService';

import DailyPricePredictions from './DailyPricePredictions';
import AgricultureNews from './AgricultureNews';

interface Props {
  onBack: () => void;
  language: string;
  t: (key: string) => string;
  userLocation?: string;
  userState?: string;
}

const MarketInsight: React.FC<Props> = ({ onBack, language, t, userLocation, userState }) => {
  const [view, setView] = useState<'main' | 'news' | 'price'>('main');
  const [news, setNews] = useState<{ text: string; links?: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  if (view === 'price') {
    return (
      <DailyPricePredictions
        onBack={() => setView('main')}
        language={language}
        userLocation={userLocation}
        t={t}
      />
    );
  }

  // Use new AgricultureNews component for card-style news with voice support
  if (view === 'news') {
    return (
      <AgricultureNews
        onBack={() => setView('main')}
        language={language}
        t={t}
        userLocation={userLocation}
        userState={userState || 'tamil_nadu'}
      />
    );
  }

  return (
    <div className="market-page">

      {/* FULL-SCREEN BACKGROUND IMAGE — fixed while scrolling */}
      <div
        className="market-bg"
        style={{
          backgroundImage: `url('https://image2url.com/r2/default/images/1772856430397-5ee101c2-c9f1-426e-be64-97e860ab5e91.png')`,
        }}
      />

      {/* DARK OVERLAY (25%) for text readability */}
      <div className="market-overlay" />

      {/* HEADER */}
      <header className="market-header">
        <button onClick={onBack} className="market-back-btn">
          <ArrowLeft size={28} strokeWidth={3} />
        </button>

        <h1 className="market-title">
          {t('market')}
        </h1>

        <div style={{ width: 28 }} />
      </header>

      {/* MAIN CONTENT — vertically centered */}
      <main className="market-content">

        {/* MANDI PRICE SECTION */}
        <div onClick={() => setView('price')} className="market-tile">
          <div className="market-circle-outer">
            <div className="market-circle-inner">
              <img
                src="https://image2url.com/r2/default/images/1772857177590-2c14f261-110d-4dfb-ba20-29219a5ec427.png"
                alt="Price Prediction"
                className="market-circle-icon"
              />
            </div>
          </div>
          <span className="market-label">
            {t('pricePred')}
          </span>
        </div>

        {/* NEWS SECTION */}
        <div onClick={() => setView('news')} className="market-tile">
          <div className="market-circle-outer">
            <div className="market-circle-inner">
              <img
                src="https://image2url.com/r2/default/images/1772857266217-935f785d-c202-4999-98f1-4c04e2767a86.png"
                alt="News"
                className="market-circle-icon"
              />
            </div>
          </div>
          <span className="market-label">
            {t('news')}
          </span>
        </div>

      </main>

      <style>{`
        .market-page {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          font-family: 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Devanagari', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Inter', system-ui, sans-serif;
        }

        .market-bg {
          position: fixed;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          z-index: 0;
        }

        .market-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          z-index: 1;
          pointer-events: none;
        }

        .market-header {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 40px 20px 16px 20px;
        }

        .market-back-btn {
          color: white;
          background: none;
          border: none;
          cursor: pointer;
          transition: transform 0.15s;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
        }
        .market-back-btn:active { transform: scale(0.9); }

        .market-title {
          font-size: 24px;
          font-weight: 900;
          color: white;
          text-align: center;
          letter-spacing: -0.5px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
          font-family: 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Devanagari', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Inter', system-ui, sans-serif;
        }

        .market-content {
          position: relative;
          z-index: 10;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 80px;
          padding-bottom: 40px;
        }

        .market-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .market-tile:active { transform: scale(0.95); }

        .market-circle-outer {
          width: 210px;
          height: 210px;
          border-radius: 50%;
          border: 4px solid #2da95c;
          padding: 5px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 2px rgba(45,169,92,0.15);
        }

        .market-circle-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 3px solid #2da95c;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .market-circle-icon {
          width: 82%;
          height: 82%;
          object-fit: contain;
          pointer-events: none;
        }

        .market-label {
          margin-top: 15px;
          font-size: 20px;
          font-weight: 900;
          color: white;
          text-align: center;
          text-shadow: 0 2px 8px rgba(0,0,0,0.6);
          letter-spacing: -0.3px;
        }
      `}</style>
    </div>
  );
};

export default MarketInsight;
