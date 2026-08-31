/**
 * Firebase Auth Service
 * Handles authentication flow with Firebase and FastAPI backend
 *
 * Features:
 * - Firestore as persistent source of truth (users/{uid})
 * - localStorage as short-term UI cache
 * - Timeout handling
 * - Tamil-friendly error messages
 */

import {
    sendOTP,
    verifyOTP,
    getIdToken,
    firebaseSignOut,
    getCurrentUser,
    onAuthChange,
    setupRecaptcha,
    User
} from './firebase';

import {
    saveProfileToFirestore,
    fetchProfileFromFirestore,
    updateProfileInFirestore,
    setCachedProfile as _setCached,
    getCachedProfile as _getCached,
    clearCachedProfile as _clearCached,
    UserProfile,
} from './firestoreProfile';

export type { UserProfile };


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============= CACHE CONFIG =============
const CACHE_KEY = 'uzhavan_user_profile';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const API_TIMEOUT_MS = 10000; // 10 seconds

// ============= Types =============

// UserProfile is imported and re-exported from firestoreProfile.ts
// (defined there to avoid circular imports)

export interface RegisterData {
    name: string;
    user_type: string;
    language: string;
    location?: string;
    crop_type?: string;      // பயிர் வகை
    district?: string;        // நிலப்பரப்பு/மாவட்டம்
    soil_type?: string;       // மண் வகை
    state?: string;
    experience?: string;
    farming_type?: string;
    phone?: string;
    land_area?: string;
    password: string;
    confirm_password: string;
}

// ============= CACHE HELPERS =============

/** Delegate cache helpers to firestoreProfile module */
const cacheProfile = _setCached;
const getCachedProfile = _getCached;
const clearCachedProfile = _clearCached;

// ============= API Helpers =============

/**
 * Fetch with timeout to prevent infinite loading
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Make authenticated API request with Firebase token
 * Features: timeout, error handling
 */
async function authFetch<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = await getIdToken();

    if (!token) {
        throw new Error('நீங்கள் உள்நுழையவில்லை. தயவுசெய்து உள்நுழையவும்');  // Please login. Authentication required
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };

    try {
        const response = await fetchWithTimeout(
            `${API_BASE_URL}${endpoint}`,
            { ...options, headers },
            API_TIMEOUT_MS
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'கோரிக்கை தோல்வியடைந்தது' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('இணைப்பு நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்');  // Connection timeout
        }
        throw error;
    }
}

// ============= Auth Service =============

export const firebaseAuthService = {
    /**
     * Step 1: Send OTP for registration
     * Call this to initiate phone verification
     */
    sendRegistrationOTP: async (phoneNumber: string, recaptchaContainerId: string): Promise<boolean> => {
        const recaptchaVerifier = setupRecaptcha(recaptchaContainerId);
        return sendOTP(phoneNumber, recaptchaVerifier);
    },

    /**
     * Step 2: Verify OTP
     * Call this after user enters the OTP code
     */
    verifyOTP: async (otpCode: string): Promise<User> => {
        return verifyOTP(otpCode);
    },

    /**
     * Step 3: Complete registration
     * Call this after OTP verification to create user profile in backend
     * Sends ALL form fields to Firestore
     */
    completeRegistration: async (data: RegisterData): Promise<UserProfile> => {
        console.log('📝 [Firestore] Saving registration data for current user');

        // Get the currently authenticated Firebase user
        const firebaseUser = getCurrentUser();
        if (!firebaseUser) {
            throw new Error('No authenticated Firebase user found. Cannot save profile.');
        }

        const uid = firebaseUser.uid;

        // Build the profile payload from registration fields
        const profilePayload: Partial<UserProfile> = {
            firebase_uid: uid,
            name: data.name,
            user_type: data.user_type as 'farmer' | 'public' | 'buyer',
            language: data.language,
            location: data.location ?? null,
            district: data.district ?? data.location ?? null,
            crop_type: data.crop_type,
            soil_type: data.soil_type,
            state: data.state ?? null,
            experience: data.experience,
            farming_type: data.farming_type,
            phone: firebaseUser.email?.replace('@uzhavan.local', '') ?? '',
            is_verified: true,
            created_at: new Date().toISOString(),
        };

        // Write to Firestore (create or merge)
        const savedProfile = await saveProfileToFirestore(uid, profilePayload);

        // Also sync to backend for CURRENT_USER_DB (weather/market personalisation)
        try {
            const token = await getIdToken();
            if (token) {
                await fetch(`${API_BASE_URL}/api/v2/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data),
                }).catch(() => { /* backend sync optional */ });
            }
        } catch { /* backend sync is optional — Firestore is the source of truth */ }

        console.log('✅ [Firestore] Profile saved successfully for UID:', uid);
        return savedProfile;
    },

    /**
     * Login: Authenticate with Firebase and get user profile
     * Caches profile after successful fetch
     */
    login: async (): Promise<UserProfile> => {
        // Get the currently authenticated Firebase user
        const firebaseUser = getCurrentUser();
        if (!firebaseUser) {
            throw new Error('Not authenticated');
        }

        const uid = firebaseUser.uid;
        console.log('🔑 [Firestore] Fetching profile for UID:', uid);

        // Fetch from Firestore — the permanent source of truth
        const profile = await fetchProfileFromFirestore(uid);
        if (!profile) {
            throw new Error('Profile not found in Firestore. Please register first.');
        }

        // Also sync to backend for CURRENT_USER_DB (weather/market personalisation)
        try {
            const token = await getIdToken();
            if (token) {
                await fetch(`${API_BASE_URL}/api/v2/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        name: profile.name,
                        user_type: profile.user_type,
                        language: profile.language,
                        location: profile.location,
                        crop_type: profile.crop_type,
                        district: profile.district,
                        soil_type: profile.soil_type,
                        password: 'sync_only',
                        confirm_password: 'sync_only',
                    }),
                }).catch(() => { /* backend sync optional */ });
            }
        } catch { /* backend sync optional */ }

        return profile;
    },

    /**
     * Get current user profile from backend
     * Uses cache first, then fetches from API
     */
    getProfile: async (): Promise<UserProfile> => {
        const firebaseUser = getCurrentUser();

        // No user logged in — try cache as last resort
        if (!firebaseUser) {
            const cached = getCachedProfile();
            if (cached) return cached;
            throw new Error('Not authenticated');
        }

        const uid = firebaseUser.uid;

        // Try Firestore (permanent source of truth)
        try {
            const profile = await fetchProfileFromFirestore(uid);
            if (profile) return profile;
        } catch (firestoreErr) {
            console.warn('[getProfile] Firestore fetch failed, trying cache:', firestoreErr);
        }

        // Fallback to cache if Firestore is unreachable
        const cached = getCachedProfile();
        if (cached) {
            console.warn('[getProfile] Using cached profile (Firestore unavailable)');
            return cached;
        }

        throw new Error('Unable to load profile. Please check your connection.');
    },

    /**
     * Get profile with cache fallback (for slow networks)
     * Returns cached data immediately, then fetches in background
     */
    getProfileWithCache: async (): Promise<UserProfile> => {
        const cached = getCachedProfile();

        // If we have cached data, return it immediately
        if (cached) {
            // Fetch fresh data in background (don't await)
            firebaseAuthService.getProfile().catch(() => { });
            return cached;
        }

        // No cache, must fetch
        return firebaseAuthService.getProfile();
    },

    /**
     * Update user profile
     */
    updateProfile: async (updates: Partial<RegisterData>): Promise<UserProfile> => {
        const firebaseUser = getCurrentUser();
        if (!firebaseUser) throw new Error('Not authenticated');

        const uid = firebaseUser.uid;

        // Write update to Firestore (permanent source of truth)
        await updateProfileInFirestore(uid, updates as Partial<UserProfile>);

        // Return refreshed profile from Firestore
        const refreshed = await fetchProfileFromFirestore(uid);
        if (!refreshed) throw new Error('Profile update failed');

        return refreshed;
    },

    /**
     * Verify token is valid
     */
    verifyToken: async (): Promise<{ valid: boolean; uid: string; phone_number: string }> => {
        return authFetch('/api/v2/auth/verify-token', {
            method: 'POST',
        });
    },

    /**
     * Logout: Sign out from Firebase and clear local state
     */
    logout: async (): Promise<void> => {
        // Clear only the localStorage cache — Firestore profile is PERMANENT
        clearCachedProfile();
        await firebaseSignOut();
        console.log('✅ [Auth] Logged out. Firestore profile preserved.');
    },

    /**
     * Get current Firebase user
     */
    getCurrentUser: () => getCurrentUser(),

    /**
     * Get current ID token
     */
    getToken: () => getIdToken(),

    /**
     * Subscribe to auth state changes
     */
    onAuthStateChange: (callback: (user: User | null) => void) => onAuthChange(callback),

    /**
     * Check if user is logged in
     */
    isLoggedIn: (): boolean => getCurrentUser() !== null,

    /**
     * Clear all cached data
     */
    clearCache: (): void => clearCachedProfile(),
};

// ============= Protected API Service =============

/**
 * Service for making authenticated API calls to protected endpoints
 */
export const protectedAPI = {
    // Weather
    getWeather: async (latitude: number, longitude: number, language: string = 'english') => {
        return authFetch('/api/weather/current', {
            method: 'POST',
            body: JSON.stringify({ latitude, longitude, language }),
        });
    },

    // Market Prices (Mandi)
    getMarketPrices: async (cropName: string, language: string = 'english', state?: string) => {
        return authFetch('/api/market/prices', {
            method: 'POST',
            body: JSON.stringify({ crop_name: cropName, language, state }),
        });
    },

    // Disease Prediction
    predictDisease: async (imageBase64: string, language: string = 'english', cropName?: string) => {
        return authFetch('/api/disease/predict', {
            method: 'POST',
            body: JSON.stringify({ image_base64: imageBase64, language, crop_name: cropName }),
        });
    },

    // Crop Recommendations
    getCropRecommendations: async (
        soilType: string,
        location: string,
        season: string,
        language: string = 'english'
    ) => {
        return authFetch('/api/crop/recommend', {
            method: 'POST',
            body: JSON.stringify({ soil_type: soilType, location, season, language }),
        });
    },

    // AI Chat
    sendChatMessage: async (message: string, language: string = 'english', imageBase64?: string) => {
        return authFetch('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({ message, language, image_base64: imageBase64 }),
        });
    },

    // Chat History
    getChatHistory: async (limit: number = 50) => {
        return authFetch(`/api/chat/history?limit=${limit}`);
    },

    // Voice Call
    sendVoiceQuery: async (query: string, language: string = 'english') => {
        return authFetch('/api/call/query', {
            method: 'POST',
            body: JSON.stringify({ query, language }),
        });
    },
};

export default firebaseAuthService;
