import React, { useState } from 'react';
import { ArrowLeft, Phone, Key, EyeOff, Eye, Loader2 } from 'lucide-react';
import { signInWithEmail, phoneToEmail } from '../services/firebase';
import { firebaseAuthService } from '../services/firebaseAuth';

interface Props {
  onLogin: (lang?: string) => void;
  onBack: () => void;
  t: (key: string) => string;
}

const Login: React.FC<Props> = ({ onLogin, onBack, t }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Format phone number
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    return digits;
  };

  // Login with Phone + Password (using email auth behind the scenes)
  const handleLogin = async () => {
    if (phone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    if (password.length < 6) {
      setError('Please enter your password (min 6 characters)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('🔑 [Login] Step 1: Converting Phone to Email');
      // Convert phone to email format for Firebase
      const email = phoneToEmail(phone);

      console.log('🔑 [Login] Step 2: Firebase Sign In (Client)');
      // specific timeout for login
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Login Request Timed Out (15s)')), 15000)
      );

      // Sign in with Firebase
      await Promise.race([
        signInWithEmail(email, password),
        timeoutPromise
      ]);
      console.log('✅ [Login] Firebase Auth Success');

      // Try to get user profile from backend
      try {
        const profile = await Promise.race([
          firebaseAuthService.login(),
          timeoutPromise
        ]) as any;
        console.log('✅ [Login] Backend Profile Sync Success');

        console.log('🔑 [Login] Step 4: Navigation');
        onLogin(profile?.language);
        return;
      } catch (backendError) {
        // User exists in Firebase but not in our backend - that's okay for now
        console.warn('⚠️ [Login] Backend profile not found, continuing...', backendError);
      }

      console.log('🔑 [Login] Step 4: Navigation');
      onLogin();
    } catch (err: any) {
      console.error('❌ [Login] Failed:', err);
      if (err.message?.includes('No account found')) {
        setError('Account not found. Please register first.');
      } else if (err.message?.includes('Incorrect password')) {
        setError('Incorrect password. Please try again.');
      } else if (err.message?.includes('Timed Out')) {
        setError('Connection timed out. Please check internet.');
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      console.log('🔑 [Login] Finished');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen p-8 bg-[#f1f8f3] font-['Inter'] relative overflow-hidden">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="self-start text-[#0b3d2e] mb-12 hover:opacity-70 active:scale-90 transition-all"
      >
        <ArrowLeft size={36} strokeWidth={2.5} />
      </button>

      {/* Screen Title */}
      <h2 className="text-[52px] font-[1000] italic text-center mb-16 text-[#0b3d2e] uppercase tracking-tighter">
        {t('login')}
      </h2>

      <div className="space-y-10 max-w-sm mx-auto w-full mb-10">
        {/* Phone Number Field */}
        <div>
          <label className="block text-xl font-[1000] italic mb-2 uppercase tracking-tight text-[#0b3d2e]">
            {t('phone')}
          </label>
          <div className="relative flex items-center bg-[#21a650] rounded-[32px] p-5 shadow-lg border-b-4 border-[#15803d]">
            <span className="text-black font-bold mr-2">+91</span>
            <Phone className="text-black mr-4" size={28} strokeWidth={2.5} />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="9876543210"
              maxLength={10}
              className="bg-transparent text-black placeholder-black/40 font-black text-2xl w-full focus:outline-none italic"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-xl font-[1000] italic mb-2 uppercase tracking-tight text-[#0b3d2e]">
            {t('password')}
          </label>
          <div className="relative flex items-center bg-[#21a650] rounded-[32px] p-5 shadow-lg border-b-4 border-[#15803d]">
            <Key className="text-black mr-4" size={32} strokeWidth={2.5} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-transparent text-black placeholder-black/40 font-black text-2xl w-full focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-black ml-4"
            >
              {showPassword ? <Eye size={28} strokeWidth={2.5} /> : <EyeOff size={28} strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={loading || phone.length !== 10 || password.length < 6}
          className="w-full bg-[#2da95c] text-black font-[900] text-3xl py-6 rounded-[22px] shadow-lg uppercase tracking-tighter transition-all active:translate-y-1 active:shadow-none border-b-4 border-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={28} />
              Logging in...
            </>
          ) : (
            t('login')
          )}
        </button>
      </div>

      <style>{`
        body { background-color: #f1f8f3; }
        input::placeholder { color: rgba(0,0,0,0.3); }
      `}</style>
    </div>
  );
};

export default Login;
