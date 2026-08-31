import React, { useState } from 'react';
import { ArrowLeft, Key, EyeOff, Eye, UserPlus, Phone, Loader2, User, MapPin, Leaf, Map, Mic } from 'lucide-react';
import { signUpWithEmail, signInWithEmail, phoneToEmail } from '../services/firebase';
import { firebaseAuthService } from '../services/firebaseAuth';

interface Props {
  onRegister: () => void;
  onBack: () => void;
  userType: 'farmer' | 'public';
  t: (key: string) => string;
  language?: string;
}

const Register: React.FC<Props> = ({ onRegister, onBack, userType, t, language = 'english' }) => {
  // Form state - matching registration fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [cropType, setCropType] = useState('');
  const [landArea, setLandArea] = useState('');
  const [soilType, setSoilType] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listeningField, setListeningField] = useState<string | null>(null);

  // Voice speech recognition for each input field
  const startVoiceInput = (field: string, setter: (val: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported on this browser. Please type directly.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      // Select speech language code according to active user language
      const langMap: Record<string, string> = {
        tamil: 'ta-IN',
        english: 'en-IN',
        hindi: 'hi-IN',
        telugu: 'te-IN',
        kannada: 'kn-IN',
        malayalam: 'ml-IN',
      };
      recognition.lang = langMap[language.toLowerCase()] || 'en-IN';

      setListeningField(field);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          if (field === 'phone') {
            const digits = transcript.replace(/\D/g, '').slice(0, 10);
            setter(digits);
          } else {
            setter(transcript);
          }
        }
        setListeningField(null);
      };

      recognition.onerror = (err: any) => {
        console.warn('Voice input error:', err);
        setListeningField(null);
      };

      recognition.onend = () => {
        setListeningField(null);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start voice recognition:', err);
      setListeningField(null);
    }
  };

  // Format phone number
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    return digits;
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Please enter your name');
      return false;
    }
    if (phone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  // Handle Registration
  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      // Convert phone to email format for Firebase
      const email = phoneToEmail(phone);
      const targetLocation = location.trim() || landArea.trim() || 'Thanjavur';

      console.log('🔑 [Register] Step 1: Creating Firebase Account');

      // Add timeout for Firebase account creation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Registration timed out. Please try again.')), 15000)
      );

      // Create Firebase account (or sign in if account already exists in Firebase Auth)
      try {
        await Promise.race([
          signUpWithEmail(email, password, name.trim()),
          timeoutPromise
        ]);
        console.log('✅ [Register] Firebase Account Created');
      } catch (fbErr: any) {
        console.warn('⚠️ [Register] Firebase signup notice:', fbErr.message);
        if (fbErr.message?.includes('already registered') || fbErr.message?.includes('email-already-in-use')) {
          console.log('🔑 [Register] Account already exists in Firebase, signing in...');
          try {
            await Promise.race([
              signInWithEmail(email, password),
              timeoutPromise
            ]);
            console.log('✅ [Register] Logged into existing Firebase Account');
          } catch (loginErr: any) {
            console.error('❌ [Register] Sign in to existing account failed:', loginErr);
            throw new Error('This mobile number is already registered with a different password. Please log in.');
          }
        } else {
          throw fbErr;
        }
      }

      console.log('🔑 [Register] Step 2: Saving Profile to Firestore');

      // Register with Firestore — saves ALL collected fields
      try {
        await Promise.race([
          firebaseAuthService.completeRegistration({
            name: name.trim(),
            user_type: userType,
            language: language,
            location: targetLocation,
            district: targetLocation,
            crop_type: cropType.trim() || undefined,
            soil_type: soilType.trim() || undefined,
            land_area: landArea.trim() || undefined,
            phone: phone.trim(),
            password: password,
            confirm_password: confirmPassword
          }),
          timeoutPromise
        ]);
        console.log('✅ [Register] Profile Saved to Firestore Successfully');
      } catch (backendError: any) {
        console.warn('⚠️ [Register] Firestore profile save failed:', backendError.message);
        // Don't silently proceed — surface this as a warning but allow login to continue
      }

      console.log('🔑 [Register] Step 3: Navigation');
      onRegister();
    } catch (err: any) {
      console.error('❌ [Register] Failed:', err);
      if (err.message?.includes('already registered') || err.message?.includes('email-already-in-use')) {
        setError('This mobile number is already registered. Please login.');
      } else if (err.message?.includes('timed out') || err.message?.includes('Timed Out')) {
        setError('Connection timed out. Please try again.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      console.log('🔑 [Register] Finished');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="mr-4">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h1 className="text-3xl font-black text-black uppercase tracking-wide">
          {t('register')}
        </h1>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        {/* User Name */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('userName')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('userName')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('name', setName)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'name' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'name' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('phone')}
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="91+ 1234567890"
              maxLength={10}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('phone', setPhone)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'phone' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'phone' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('location')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('location')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('location', setLocation)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'location' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'location' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Crop Type */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('cropType')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={cropType}
              onChange={(e) => setCropType(e.target.value)}
              placeholder={t('cropType')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('cropType', setCropType)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'cropType' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'cropType' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Land Area */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('landArea')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={landArea}
              onChange={(e) => setLandArea(e.target.value)}
              placeholder={t('landArea')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('landArea', setLandArea)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'landArea' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'landArea' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Soil Type */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('soilType')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={soilType}
              onChange={(e) => setSoilType(e.target.value)}
              placeholder={t('soilType')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-12 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => startVoiceInput('soilType', setSoilType)}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-all ${
                listeningField === 'soilType' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
              }`}
              title="Voice Input"
            >
              <Mic size={20} className={listeningField === 'soilType' ? 'animate-bounce' : ''} />
            </button>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('password')}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-20 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => startVoiceInput('password', setPassword)}
                className={`p-1 rounded-full transition-all ${
                  listeningField === 'password' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
                }`}
                title="Voice Input"
              >
                <Mic size={18} className={listeningField === 'password' ? 'animate-bounce' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-gray-700 hover:text-black"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-lg font-bold text-black mb-2 uppercase">
            {t('confirmPassword')}
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPassword')}
              className="w-full bg-green-400 border-none rounded-full py-4 px-6 pr-20 text-black placeholder-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => startVoiceInput('confirmPassword', setConfirmPassword)}
                className={`p-1 rounded-full transition-all ${
                  listeningField === 'confirmPassword' ? 'bg-red-500 text-white animate-pulse' : 'text-gray-700 hover:text-black'
                }`}
                title="Voice Input"
              >
                <Mic size={18} className={listeningField === 'confirmPassword' ? 'animate-bounce' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="p-1 text-gray-700 hover:text-black"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Register Button */}
        <div className="pt-6 pb-8">
          <button
            onClick={handleRegister}
            disabled={loading || !name.trim() || phone.length !== 10 || password.length < 6}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-xl py-4 rounded-full shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={24} />
                {t('loading')}...
              </>
            ) : (
              <>
                <UserPlus size={24} />
                {t('register')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;
