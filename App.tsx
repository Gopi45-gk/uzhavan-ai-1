import React, { useState, useEffect } from 'react';
import { Screen, User } from './types';
import SplashScreen from './screens/SplashScreen';
import LanguageSelection from './screens/LanguageSelection';
import UserTypeSelection from './screens/UserTypeSelection';
import AuthChoice from './screens/AuthChoice';
import Login from './screens/Login';
import Register from './screens/Register';
import Dashboard from './screens/Dashboard';
import Chat from './screens/Chat';
import DiseasePrediction from './screens/DiseasePrediction';
import MarketInsight from './screens/MarketInsight';
import Weather from './screens/Weather';
import CropRecommendation from './screens/CropRecommendation';
import PhoneCall from './screens/PhoneCall';
import FarmerProfile from './screens/FarmerProfile';
import CallHistory from './screens/CallHistory';
import { translations } from './i18n';
import { DataProvider } from './context/DataContext';
import { firebaseAuthService } from './services/firebaseAuth';
import { onAuthChange } from './services/firebase';

// Language persistence helper functions
const LANGUAGE_STORAGE_KEY = 'uzhavan_app_language';

const saveLanguageToStorage = (language: string) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    // Also save to sessionStorage as backup
    sessionStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn('Failed to save language to storage:', error);
  }
};

const getLanguageFromStorage = (): string => {
  try {
    // Try localStorage first, then sessionStorage, then default
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) ||
      sessionStorage.getItem(LANGUAGE_STORAGE_KEY) ||
      'english';
  } catch (error) {
    console.warn('Failed to get language from storage:', error);
    return 'english';
  }
};

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return getLanguageFromStorage();
  });
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Language persistence - save to storage whenever it changes
  useEffect(() => {
    saveLanguageToStorage(selectedLanguage);
    console.log('🌍 Language changed to:', selectedLanguage);
  }, [selectedLanguage]);

  // ── Firebase onAuthStateChanged: auto-restore profile on load / refresh / login
  useEffect(() => {
    // Set loading immediately so the splash timer waits for auth check
    setIsLoadingProfile(true);

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Authenticated user — load their Firestore profile
          try {
            const profile = await firebaseAuthService.getProfile();

            setUser({
              name: profile.name,
              type: profile.user_type as 'farmer' | 'public',
              language: profile.language,
              phone: profile.mobile || profile.phone,
              location: profile.location || undefined,
              aadhaar: profile.aadhaar,
              upi_id: profile.upi_id,
              created_at: profile.created_at,
            });

            // Restore language from saved profile
            if (profile.language && profile.language !== selectedLanguage) {
              console.log('🌍 Restoring language from profile:', profile.language);
              setSelectedLanguage(profile.language);
              saveLanguageToStorage(profile.language);
            }

            setCurrentScreen('dashboard');
          } catch (profileErr) {
            // Firebase user exists but no Firestore profile yet — proceed to dashboard
            console.warn('⚠️ Could not load Firestore profile:', profileErr);
            setCurrentScreen('dashboard');
          }
        } else {
          // No authenticated user — let splash timer handle navigation to language screen
          console.log('🔑 No authenticated user detected.');
          setUser(null);
        }
      } finally {
        // Always unblock the splash timer
        setIsLoadingProfile(false);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Helper to get translated string with fallback
  const t = (key: string) => {
    const translation = translations[selectedLanguage]?.[key] ||
      translations['english']?.[key] ||
      key;
    return translation;
  };

  // Handle splash screen timeout
  useEffect(() => {
    if (currentScreen === 'splash' && !isLoadingProfile) {
      const timer = setTimeout(() => setCurrentScreen('language'), 2500);
      return () => clearTimeout(timer);
    }
  }, [currentScreen, isLoadingProfile]);

  const handleBack = () => {
    switch (currentScreen) {
      case 'language': setCurrentScreen('splash'); break;
      case 'user-type': setCurrentScreen('language'); break;
      case 'auth-choice': setCurrentScreen('language'); break;
      case 'login': setCurrentScreen('auth-choice'); break;
      case 'register': setCurrentScreen('auth-choice'); break;
      case 'dashboard': setCurrentScreen('auth-choice'); break;
      default: setCurrentScreen('dashboard'); break;
    }
  };

  // Handle language selection - direct user to login/register choice
  const handleLanguageSelect = (language: string) => {
    console.log('🌍 User selected language:', language);
    setSelectedLanguage(language);
    setCurrentScreen('auth-choice');
  };

  // Handle successful login - load profile and set language
  const handleLogin = async (languageFromLogin?: string) => {
    try {
      const profile = await firebaseAuthService.getProfile();
      setUser({
        name: profile.name,
        type: profile.user_type as 'farmer' | 'public',
        language: profile.language,
        phone: profile.mobile || profile.phone,
        location: profile.location || undefined,
        aadhaar: profile.aadhaar,
        upi_id: profile.upi_id,
        created_at: profile.created_at
      });

      // CRITICAL: Use profile language, fallback to login language, then current
      const newLanguage = profile.language || languageFromLogin || selectedLanguage;
      if (newLanguage !== selectedLanguage) {
        console.log('🌍 Setting language after login:', newLanguage);
        setSelectedLanguage(newLanguage);
      }

      setCurrentScreen('dashboard');
    } catch (error) {
      console.error('Failed to load profile after login:', error);
      // Still proceed to dashboard with current language
      if (languageFromLogin && languageFromLogin !== selectedLanguage) {
        setSelectedLanguage(languageFromLogin);
      }
      setCurrentScreen('dashboard');
    }
  };

  // Handle successful registration
  const handleRegister = async () => {
    try {
      const profile = await firebaseAuthService.getProfile();
      setUser({
        name: profile.name,
        type: profile.user_type as 'farmer' | 'public',
        language: profile.language,
        phone: profile.mobile || profile.phone,
        location: profile.location || undefined,
        aadhaar: profile.aadhaar,
        upi_id: profile.upi_id,
        created_at: profile.created_at
      });

      // CRITICAL: Use profile language after registration
      if (profile.language && profile.language !== selectedLanguage) {
        console.log('🌍 Setting language after registration:', profile.language);
        setSelectedLanguage(profile.language);
      }

      setCurrentScreen('dashboard');
    } catch (error) {
      console.error('Failed to load profile after registration:', error);
      setCurrentScreen('dashboard');
    }
  };

  // Handle logout - directs to login/register choice screen
  const handleLogout = () => {
    setUser(null);
    // Keep the language preference and navigate directly to login/register page
    setCurrentScreen('auth-choice');
  };

  // Handle language change from dashboard
  const handleLanguageChange = async (newLanguage: string) => {
    console.log('🌍 Language changed from dashboard:', newLanguage);
    setSelectedLanguage(newLanguage);

    // If user is logged in, update their profile language
    if (user) {
      try {
        await firebaseAuthService.updateProfile({ language: newLanguage });
        console.log('✅ Updated user profile language');
      } catch (error) {
        console.warn('Failed to update profile language:', error);
      }
    }
  };

  const renderScreen = () => {
    // Show splash screen while loading profile
    if (isLoadingProfile) {
      return <SplashScreen />;
    }

    switch (currentScreen) {
      case 'splash':
        return <SplashScreen />;

      case 'language':
        return (
          <LanguageSelection
            onSelect={handleLanguageSelect}
            onBack={handleBack}
            t={t}
          />
        );

      case 'user-type':
        return (
          <UserTypeSelection
            onSelect={(type) => {
              setUser({ name: '', type, language: selectedLanguage });
              setCurrentScreen('auth-choice');
            }}
            onBack={handleBack}
            t={t}
          />
        );

      case 'auth-choice':
        return (
          <AuthChoice
            userType={user?.type || 'farmer'}
            onChoice={(choice) => setCurrentScreen(choice)}
            onBack={handleBack}
            t={t}
          />
        );

      case 'login':
        return (
          <Login
            onLogin={handleLogin}
            onBack={handleBack}
            t={t}
          />
        );

      case 'register':
        return (
          <Register
            onRegister={handleRegister}
            onBack={handleBack}
            userType={user?.type || 'farmer'}
            t={t}
            language={selectedLanguage}
          />
        );

      case 'dashboard':
        return (
          <Dashboard
            user={user}
            onNavigate={setCurrentScreen}
            onBack={handleBack}
            t={t}
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
          />
        );

      case 'chat':
        return (
          <Chat
            onBack={handleBack}
            language={selectedLanguage}
            t={t}
          />
        );

      case 'disease-prediction':
        return (
          <DiseasePrediction
            onBack={handleBack}
            language={selectedLanguage}
            t={t}
          />
        );

      case 'market-insight':
        return (
          <MarketInsight
            onBack={handleBack}
            language={selectedLanguage}
            t={t}
            userLocation={user?.location}
          />
        );

      case 'weather':
        return (
          <Weather
            onBack={handleBack}
            language={selectedLanguage}
            t={t}
            userLocation={user?.location || 'Thanjavur'}
          />
        );

      case 'crop-recommendation':
        return (
          <CropRecommendation
            onBack={handleBack}
            language={selectedLanguage}
            t={t}
          />
        );

      case 'phone-call':
        return (
          <PhoneCall
            onBack={handleBack}
            user={user}
            t={t}
            language={selectedLanguage}
          />
        );

      case 'farmer-profile':
        return (
          <FarmerProfile
            onBack={handleBack}
            onLogout={handleLogout}
            onNavigate={setCurrentScreen}
            t={t}
          />
        );

      case 'call-history':
        return (
          <CallHistory
            onBack={() => setCurrentScreen('farmer-profile')}
            t={t}
          />
        );

      default:
        return <SplashScreen />;
    }
  };

  return (
    <DataProvider
      userCoords={{ lat: 13.0827, lon: 80.2707 }}
      userState={user?.location || 'Thanjavur'}
      language={selectedLanguage}
    >
      <div className="app-container">
        {renderScreen()}
      </div>
    </DataProvider>
  );
};

export default App;
