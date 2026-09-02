import React, { useState } from 'react';
import { ArrowLeft, CloudRain, Sun, Wind, Thermometer, AlertTriangle, Cloud, CloudSun, Moon, Calendar, Sparkles } from 'lucide-react';
import { useData } from '../context/DataContext';

interface Props {
  onBack: () => void;
  language: string;
  t: (key: string) => string;
  userLocation?: string;
}

const Weather: React.FC<Props> = ({ onBack, language, t, userLocation }) => {
  const { data, isLoading, error: globalError } = useData();
  const [forecastRange, setForecastRange] = useState<'7' | '30'>('30');

  const weather = data?.weather;
  const loading = isLoading && !weather;
  const error = globalError;

  // Time of day detection
  const currentHour = new Date().getHours();
  const isNight = currentHour >= 19 || currentHour < 5;
  const isEvening = currentHour >= 17 && currentHour < 19;
  const isAfternoon = currentHour >= 12 && currentHour < 17;

  // Weather translations for all languages
  const WEATHER_TERMS: Record<string, Record<string, string>> = {
    sunny: {
      tamil: 'தெளிவான வானம் (வெயில்)',
      english: 'Sunny & Clear',
      hindi: 'साफ़ मौसम',
      telugu: 'స్పష్టమైన ఆకాశం',
      kannada: 'ಸ್ಪಷ್ಟ ಆಕಾಶ',
      malayalam: 'വ്യക്തമായ ആകാശം',
    },
    partlyCloudy: {
      tamil: 'பகுதி மேகமூட்டம்',
      english: 'Partly Cloudy',
      hindi: 'आंशिक रूप से बादल',
      telugu: 'పాక్షికంగా మబ్బులు',
      kannada: 'ಭಾಗಶಃ ಮೋಡ ಮುಸುಕಿದ',
      malayalam: 'ഭാഗികമായി മേഘാവൃതമായ',
    },
    cloudy: {
      tamil: 'முழு மேகமூட்டம்',
      english: 'Overcast / Cloudy',
      hindi: 'घाने बादल',
      telugu: 'మబ్బులు',
      kannada: 'ಮೋಡ ಮುಸುಕಿದ',
      malayalam: 'മേഘാവൃതമായ',
    },
    rainy: {
      tamil: 'லேசான / மிதமான மழை',
      english: 'Rain Showers',
      hindi: 'हल्की बारिश',
      telugu: 'వర్షం',
      kannada: 'ಮಳೆ',
      malayalam: 'മഴ',
    },
  };

  const getTranslatedCondition = (desc: string) => {
    const d = desc.toLowerCase();
    const langKey = language.toLowerCase();
    if (d.includes('clear') || d.includes('sunny')) return WEATHER_TERMS.sunny[langKey] || 'Sunny';
    if (d.includes('partly')) return WEATHER_TERMS.partlyCloudy[langKey] || 'Partly Cloudy';
    if (d.includes('cloud')) return WEATHER_TERMS.cloudy[langKey] || 'Cloudy';
    if (d.includes('rain')) return WEATHER_TERMS.rainy[langKey] || 'Rainy';
    return desc;
  };

  const getWeatherIcon = (description: string) => {
    const desc = description.toLowerCase();
    if (isNight) return <Moon size={64} className="text-amber-200 animate-pulse drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />;
    if (desc.includes('clear') || desc.includes('sunny')) return <Sun size={64} className="text-yellow-400 animate-pulse drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />;
    if (desc.includes('partly cloudy')) return <CloudSun size={64} className="text-yellow-300 animate-pulse" />;
    if (desc.includes('cloudy')) return <Cloud size={64} className="text-slate-300 animate-pulse" />;
    if (desc.includes('rain')) return <CloudRain size={64} className="text-blue-400 animate-pulse" />;
    return <Sun size={64} className="text-yellow-400" />;
  };

  const getSmallWeatherIcon = (description: string) => {
    const desc = description.toLowerCase();
    if (desc.includes('clear') || desc.includes('sunny')) return <Sun size={22} className="text-yellow-500" />;
    if (desc.includes('partly')) return <CloudSun size={22} className="text-amber-400" />;
    if (desc.includes('cloud')) return <Cloud size={22} className="text-slate-400" />;
    if (desc.includes('rain')) return <CloudRain size={22} className="text-blue-500" />;
    return <Sun size={22} className="text-yellow-500" />;
  };

  const formatDay = (dateStr: string, index: number) => {
    if (index === 0) return t('today') || 'Today';
    const date = new Date(dateStr);
    const localeMap: Record<string, string> = {
      tamil: 'ta-IN', telugu: 'te-IN', malayalam: 'ml-IN', kannada: 'kn-IN', hindi: 'hi-IN', english: 'en-IN'
    };
    const localeToUse = localeMap[language.toLowerCase()] || 'en-IN';
    return date.toLocaleDateString(localeToUse, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // 30-day forecast list
  const forecastList = weather?.daily_forecast ? (
    forecastRange === '7' ? weather.daily_forecast.slice(0, 7) : weather.daily_forecast
  ) : [];

  return (
    <div className="flex flex-col h-screen bg-[#f0fdf4] overflow-y-auto">
      {/* Header */}
      <div className="p-4 flex items-center border-b bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <button onClick={onBack} className="mr-3 p-2 rounded-full hover:bg-gray-100 active:scale-95 transition-all">
          <ArrowLeft size={24} className="text-gray-700" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-emerald-900">{t('weather') || 'Weather Dashboard'}</h2>
          <p className="text-[11px] font-semibold text-emerald-600">
            {isNight ? '🌙 Night View' : isEvening ? '🌅 Evening View' : isAfternoon ? '☀️ Afternoon View' : '🌄 Morning View'}
          </p>
        </div>
        {weather && (
          <span className="ml-auto px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
            📍 {weather.location}
          </span>
        )}
      </div>

      <div className="flex-1 p-5 space-y-6">
        {/* Dynamic Animated Time-of-Day Main Card */}
        <div className={`rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all duration-700 border-2 ${
          isNight
            ? 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white border-indigo-500/30'
            : isEvening
            ? 'bg-gradient-to-br from-amber-600 via-orange-500 to-rose-600 text-white border-amber-300/40'
            : isAfternoon
            ? 'bg-gradient-to-br from-sky-400 via-amber-300 to-emerald-500 text-slate-900 border-amber-200'
            : 'bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800 text-white border-emerald-400/30'
        }`}>
          {/* Background Ambient Animations */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none animate-pulse" />
          {isNight && (
            <div className="absolute inset-0 pointer-events-none opacity-40">
              <Sparkles className="absolute top-4 left-10 text-yellow-200 animate-ping" size={12} />
              <Sparkles className="absolute top-12 right-20 text-yellow-100 animate-pulse" size={16} />
              <Sparkles className="absolute bottom-8 left-1/3 text-white animate-ping" size={10} />
            </div>
          )}

          <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">
                {t('today') || 'TODAY'}
              </span>
              <h3 className="text-2xl font-bold mt-2">
                {weather?.location || 'Tamil Nadu'}
              </h3>
            </div>
            <div className="relative z-10">{weather && getWeatherIcon(weather.current.weather_description)}</div>
          </div>

          {loading ? (
            <div className="my-12 text-center font-bold animate-pulse text-lg">
              {t('fetching') || 'Updating live weather...'}
            </div>
          ) : error ? (
            <div className="my-10 text-red-200 font-bold">{error}</div>
          ) : weather ? (
            <div className="relative z-10 mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-extrabold drop-shadow-md">
                  {Math.round(weather.current.temperature)}°
                </span>
                <span className="text-2xl font-bold opacity-80">C</span>
              </div>

              <p className="text-base font-bold mt-1 opacity-90">
                {getTranslatedCondition(weather.current.weather_description)}
              </p>

              {weather.daily_forecast[0] && (
                <p className="text-xs font-semibold opacity-75 mt-1">
                  {language === 'tamil' ? 'அதிகபட்சம்' : language === 'hindi' ? 'अधिकतम' : language === 'telugu' ? 'గరిష్టం' : language === 'kannada' ? 'ಗರಿಷ್ಠ' : language === 'malayalam' ? 'പരമാവധി' : 'High'}: {Math.round(weather.daily_forecast[0].temp_max)}°C · {language === 'tamil' ? 'குறைந்தபட்சம்' : language === 'hindi' ? 'न्यूनतम' : language === 'telugu' ? 'కనిష్టం' : language === 'kannada' ? 'ಕನಿಷ್ಠ' : language === 'malayalam' ? 'കുറഞ്ഞത്' : 'Low'}: {Math.round(weather.daily_forecast[0].temp_min)}°C
                </p>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/20 text-center">
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <Wind size={20} className="mx-auto mb-1 opacity-85" />
                  <span className="text-[10px] font-bold block opacity-75">
                    {language === 'tamil' ? 'காற்று' : language === 'hindi' ? 'हवा' : language === 'telugu' ? 'గాలి' : language === 'kannada' ? 'ಗಾಳಿ' : language === 'malayalam' ? 'കാറ്റ്' : 'Wind'}
                  </span>
                  <span className="text-xs font-extrabold">{Math.round(weather.current.windspeed)} KM/H</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <CloudRain size={20} className="mx-auto mb-1 opacity-85" />
                  <span className="text-[10px] font-bold block opacity-75">
                    {language === 'tamil' ? 'மழை' : language === 'hindi' ? 'बारिश' : language === 'telugu' ? 'వర్షం' : language === 'kannada' ? 'ಮಳೆ' : language === 'malayalam' ? 'മഴ' : 'Rain'}
                  </span>
                  <span className="text-xs font-extrabold">{weather.current.precipitation} MM</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <Thermometer size={20} className="mx-auto mb-1 opacity-85" />
                  <span className="text-[10px] font-bold block opacity-75">
                    {language === 'tamil' ? 'ஈரப்பதம்' : language === 'hindi' ? 'नमी' : language === 'telugu' ? 'తేమ' : language === 'kannada' ? 'ತೇವಾಂಶ' : language === 'malayalam' ? 'ഈർപ്പം' : 'Humidity'}
                  </span>
                  <span className="text-xs font-extrabold">{weather.current.humidity}%</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {!loading && weather && (
          <div className="space-y-6">
            {/* Rain Alert Warning */}
            {weather.rain_alert.has_alert && (
              <div className="p-4 rounded-2xl border-2 bg-amber-50 border-amber-300 flex items-start gap-3 shadow-md">
                <AlertTriangle size={24} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-amber-900 text-sm">
                    🌧️ {language === 'tamil' ? 'மழை எச்சரிக்கை' : language === 'hindi' ? 'बारिश की चेतावनी' : language === 'telugu' ? 'వర్ష హెచ్చరిక' : language === 'kannada' ? 'ಮಳೆ ಎಚ್ಚರಿಕೆ' : language === 'malayalam' ? 'മഴ മുന്നറിയിപ്പ്' : 'Rain Alert'} — {weather.rain_alert.alert_level.toUpperCase()}
                  </h4>
                  <p className="text-xs font-semibold text-amber-800 mt-1">{weather.rain_alert.alert_message}</p>
                </div>
              </div>
            )}

            {/* Agricultural Advisory */}
            <div className="bg-white p-5 rounded-3xl shadow-lg border-l-8 border-emerald-600">
              <h4 className="font-extrabold text-emerald-950 text-base mb-2 flex items-center gap-2">
                🌾 {t('agriInsights') || (language === 'tamil' ? 'விவசாய நுண்ணறிவு' : 'Agricultural Advisory')}
              </h4>
              <p className="text-gray-700 text-xs leading-relaxed font-medium whitespace-pre-line">
                {weather.farming_advisory}
              </p>
            </div>

            {/* 30-Day Monthly Weather Forecast */}
            <div className="bg-white p-5 rounded-3xl shadow-xl border-l-8 border-cyan-600">
              <div className="flex items-center justify-between mb-4 border-b pb-3">
                <h4 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                  <Calendar size={18} className="text-cyan-600" />
                  {language === 'tamil' ? '30 நாட்கள் வானிலை கணிப்பு' : language === 'hindi' ? '30 दिनों का मौसम पूर्वानुमान' : language === 'telugu' ? '30 రోజుల వాతావరణ అంచనా' : language === 'kannada' ? '30 ದಿನಗಳ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ' : language === 'malayalam' ? '30 ദിവസത്തെ കാലാവസ്ഥ പ്രവചനം' : '30-Day Monthly Forecast'}
                </h4>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => setForecastRange('7')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                      forecastRange === '7' ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    7 {language === 'tamil' ? 'நாட்கள்' : 'Days'}
                  </button>
                  <button
                    onClick={() => setForecastRange('30')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                      forecastRange === '30' ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    30 {language === 'tamil' ? 'நாட்கள்' : 'Days'}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {forecastList.map((day, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/80 hover:bg-cyan-50/60 border border-slate-100 transition-colors">
                    <span className="font-bold text-gray-800 text-xs w-28 flex items-center gap-1.5">
                      {formatDay(day.date, idx)}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      {getSmallWeatherIcon(day.weather_description)}
                      <span className="text-xs font-semibold text-gray-600">
                        {getTranslatedCondition(day.weather_description)}
                      </span>
                    </div>
                    <span className="font-black text-gray-900 text-xs text-right">
                      {Math.round(day.temp_min)}° / {Math.round(day.temp_max)}°
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] font-semibold text-gray-400 text-center pb-6">
              {t('last_updated') || 'Updated:'} {new Date(weather.last_updated).toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Weather;
