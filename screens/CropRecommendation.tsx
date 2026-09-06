import React, { useState } from 'react';
import { ArrowLeft, Search, MapPin, CheckCircle2, Loader2, Sprout, Sparkles, Sun, CloudRain } from 'lucide-react';
import { recommendCrop } from '../services/geminiService';
import CropRecommendationMap, { YieldResult } from './CropRecommendationMap';

interface Props {
  onBack: () => void;
  language: string;
  t: (key: string) => string;
}

const CropRecommendation: React.FC<Props> = ({ onBack, language, t }) => {
  const [locationName, setLocationName] = useState<string>('Chennai');
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 13.0827, lon: 80.2707 });
  const [loading, setLoading] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [result, setResult] = useState<string | null>(null);
  const [yieldData, setYieldData] = useState<YieldResult | null>(null);

  // Trigger browser geolocation
  const handleUseCurrentLocation = () => {
    setLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLat = parseFloat(position.coords.latitude.toFixed(4));
          const newLon = parseFloat(position.coords.longitude.toFixed(4));
          setCoords({ lat: newLat, lon: newLon });
          setLocationName(`Current Location (${newLat}, ${newLon})`);
          setLocating(false);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocating(false);
    }
  };

  // Run crop recommendation analysis & yield prediction
  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    setYieldData(null);

    const API_BASE = import.meta.env.VITE_API_URL || '';

    try {
      const dataPayload = {
        location: locationName || 'Chennai',
        latitude: coords.lat,
        longitude: coords.lon,
        soil: 'Clay / Loam soil',
        season: 'Monsoon / Current Season',
        water: 'Adequate Irrigation'
      };

      // 1. Fetch Crop Recommendation text
      const recommendation = await recommendCrop(dataPayload, language);
      setResult(recommendation);

      // 2. Fetch Yield Prediction & SoilGrids/OpenMeteo advice from backend
      try {
        const yieldRes = await fetch(`${API_BASE}/api/predict-yield`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: coords.lat, lon: coords.lon }),
        });
        if (yieldRes.ok) {
          const yData: YieldResult = await yieldRes.json();
          setYieldData(yData);
        } else {
          throw new Error('Backend offline');
        }
      } catch (yErr) {
        console.warn('[Yield Prediction] Fetch failed, using agro-climatic zone offline baseline:', yErr);
        const isTa = language.toLowerCase().includes('ta') || language.toLowerCase().includes('tamil');
        setYieldData({
          status: 'offline_estimated',
          latitude: coords.lat,
          longitude: coords.lon,
          predicted_yield_tons_per_acre: 3.2,
          temperature: 29.5,
          rainfall_mm: 14.2,
          soil: { clay_percentage: 28, sand_percentage: 42 },
          advice_tamil: isTa
            ? 'வண்டல் மற்றும் செம்மண் பகுதி. மிதமான நீர்ப்பாசனத்துடன் நெல், மக்காச்சோளம் மற்றும் காய்கறி பயிர்கள் உகந்த மகசூல் தரும்.'
            : 'Alluvial and loam zone. Moderate irrigation with paddy, maize, and vegetable crops yields optimal harvest.'
        });
      }
    } catch (err) {
      console.error('Crop recommendation error:', err);
      setResult('Failed to load recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f0fbf4] font-['Inter'] relative overflow-y-auto no-scrollbar">

      {/* HEADER SECTION */}
      <header className="sticky top-0 z-20 flex items-center px-5 py-4 bg-white shadow-sm border-b border-emerald-100">
        <button
          onClick={onBack}
          className="text-black hover:opacity-70 active:scale-90 transition-all mr-3"
        >
          <ArrowLeft size={30} strokeWidth={2.8} />
        </button>

        <h1 className="text-2xl font-[1000] italic text-[#2da95c] uppercase tracking-tighter">
          {t('cropRec') || 'CROP RECOMMENDATION'}
        </h1>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full pb-12">

        {/* CARD 1: SEARCH FARMING AREA */}
        <div className="bg-white rounded-[28px] p-5 shadow-lg border border-emerald-100/80 space-y-4">
          <h2 className="text-xs font-[1000] italic text-[#0f381e] uppercase tracking-wider">
            SEARCH FARMING AREA
          </h2>

          {/* Search Input Box */}
          <div className="relative flex items-center">
            <Search className="absolute left-4 text-gray-400 pointer-events-none" size={20} strokeWidth={2.5} />
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Search city, district, or village..."
              className="w-full bg-[#f0fbf4] border-2 border-emerald-300 rounded-2xl py-3 pl-12 pr-4 text-gray-900 font-bold text-base focus:outline-none focus:border-[#2da95c] transition-colors"
            />
          </div>

          {/* Two Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* USE MY CURRENT LOCATION */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="w-full bg-[#f0fbf4] border-2 border-[#2da95c] text-[#2da95c] font-[900] italic text-[11px] py-3.5 px-2 rounded-2xl flex items-center justify-center gap-1.5 uppercase tracking-tighter shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              {locating ? (
                <Loader2 size={15} className="animate-spin text-[#2da95c]" />
              ) : (
                <MapPin size={15} className="text-[#2da95c]" />
              )}
              <span>{locating ? 'LOCATING...' : 'USE MY CURRENT LOCATION'}</span>
            </button>

            {/* CONFIRM SELECTED LOCATION */}
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-[#2da95c] text-white font-[900] italic text-[11px] py-3.5 px-2 rounded-2xl flex items-center justify-center gap-1.5 uppercase tracking-tighter shadow-md active:scale-95 transition-all disabled:opacity-70"
            >
              <CheckCircle2 size={15} className="text-white" />
              <span>CONFIRM SELECTED LOCATION</span>
            </button>
          </div>
        </div>

        {/* CARD 2: LIVE SATELLITE VIEW CONTAINER (INTERACTIVE LEAFLET SATELLITE MAP) */}
        <div className="relative rounded-[28px] border-4 border-[#2da95c] overflow-hidden shadow-xl h-72 bg-gray-900">
          <CropRecommendationMap
            coords={coords}
            onCoordsChange={(newC) => setCoords(newC)}
            language={language}
          />
        </div>

        {/* BOTTOM ACTION BUTTON: ANALYZING / GET RECOMMENDATION */}
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-[#f0fbf4] border-2 border-[#2da95c] text-[#2da95c] font-[1000] italic text-sm py-4 px-6 rounded-2xl flex items-center justify-center gap-2.5 uppercase tracking-tight shadow-sm active:scale-95 transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin text-[#2da95c]" />
              <span>ANALYZING LOCATION & YIELD DATA...</span>
            </>
          ) : (
            <>
              <Sprout size={20} className="text-[#2da95c]" />
              <span>CONFIRM & ANALYZE CROP RECOMMENDATION</span>
            </>
          )}
        </button>

        {/* YIELD PREDICTION & AI ADVICE CARD */}
        {yieldData && (
          <div className="bg-white p-5 rounded-[28px] shadow-xl border-l-[10px] border-[#2da95c] space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-[1000] italic text-gray-900 text-base uppercase">
                  மகசூல் & வானிலை கணிப்பு (Yield & Weather)
                </h3>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                SoilGrids AI
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                <p className="text-[10px] text-emerald-700 font-bold uppercase">மகசூல்</p>
                <p className="text-base font-black text-emerald-950 mt-0.5">
                  {yieldData.predicted_yield_tons_per_acre} <span className="text-[10px] font-medium">டன்/எக்கர்</span>
                </p>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                <div className="flex items-center justify-center gap-1 text-amber-700">
                  <Sun className="w-3 h-3" />
                  <p className="text-[10px] font-bold uppercase">வெப்பநிலை</p>
                </div>
                <p className="text-base font-black text-amber-950 mt-0.5">
                  {yieldData.temperature}°C
                </p>
              </div>
              <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                <div className="flex items-center justify-center gap-1 text-blue-700">
                  <CloudRain className="w-3 h-3" />
                  <p className="text-[10px] font-bold uppercase">களிமண்</p>
                </div>
                <p className="text-base font-black text-blue-950 mt-0.5">
                  {yieldData.soil.clay_percentage}%
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/60">
              <p className="text-xs font-semibold text-slate-800 leading-relaxed italic">
                "{yieldData.advice_tamil}"
              </p>
            </div>
          </div>
        )}

        {/* RECOMMENDATION RESULTS CARD */}
        {result && (
          <div className="bg-white p-6 rounded-[28px] shadow-2xl border-l-[10px] border-[#2da95c] animate-in fade-in duration-300 space-y-3">
            <h3 className="text-xl font-[1000] italic text-gray-900 border-b border-gray-100 pb-2 uppercase tracking-tight flex items-center gap-2">
              <Sprout size={22} className="text-[#2da95c]" />
              {t('recCrops') || 'RECOMMENDED CROPS'}
            </h3>
            <div className="text-gray-800 font-bold italic whitespace-pre-line leading-relaxed text-sm">
              {result}
            </div>
          </div>
        )}

      </main>

    </div>
  );
};

export default CropRecommendation;
