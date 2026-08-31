/**
 * Firestore Profile Service — Uzhavan AI
 * ======================================
 * Handles all persistent farmer profile read/write using Firestore.
 * Collection: users/{firebaseUid}
 *
 * This is the SINGLE SOURCE OF TRUTH for farmer data.
 * localStorage is only used as a short-term UI cache.
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── UserProfile type (canonical definition) ───
export interface UserProfile {
    id?: number;
    firebase_uid: string;
    phone?: string;
    mobile?: string;         // Firestore stores phone as 'mobile'
    name: string;
    user_type: 'farmer' | 'public' | 'buyer';
    language: string;
    location: string | null;
    crop_type?: string;
    district?: string;
    soil_type?: string;
    land_area?: string;
    state?: string;
    experience?: string;
    farming_type?: string;
    created_at: string;
    is_verified: boolean;
    aadhaar?: string;
    upi_id?: string;
}

// Firestore collection name — matches existing structure
const USERS_COLLECTION = 'users';

// ─── localStorage cache helpers (short-term UI cache only) ───
const CACHE_KEY = 'uzhavan_user_profile';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function setCachedProfile(profile: UserProfile): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ profile, timestamp: Date.now() }));
    } catch { /* ignore */ }
}

function getCachedProfile(): UserProfile | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { profile, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > CACHE_TTL_MS) return null;
        return profile;
    } catch {
        return null;
    }
}

function clearCachedProfile(): void {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// ─── Firestore document reference ───
function profileDocRef(uid: string) {
    return doc(db, USERS_COLLECTION, uid);
}

// ─── Helper: convert Firestore timestamps to ISO strings ───
function normaliseTimestamps(data: Record<string, any>): Record<string, any> {
    const out = { ...data };
    for (const key of Object.keys(out)) {
        const val = out[key];
        if (val instanceof Timestamp) {
            out[key] = val.toDate().toISOString();
        }
    }
    return out;
}

/**
 * Save (create or merge) farmer profile to Firestore.
 * Uses merge:true so existing fields are NOT overwritten with undefined.
 */
export async function saveProfileToFirestore(
    uid: string,
    profileData: Partial<UserProfile>
): Promise<UserProfile> {
    const ref = profileDocRef(uid);

    // Check if doc already exists to decide createdAt behaviour
    const existing = await getDoc(ref);

    const now = serverTimestamp();
    const payload: Record<string, any> = {
        firebase_uid: uid,
        name: profileData.name || '',
        user_type: profileData.user_type || 'farmer',
        language: profileData.language || 'english',
        location: profileData.location ?? null,
        district: profileData.district ?? profileData.location ?? null,
        crop_type: profileData.crop_type ?? null,
        soil_type: profileData.soil_type ?? null,
        land_area: profileData.land_area ?? null,
        state: profileData.state ?? null,
        experience: profileData.experience ?? null,
        farming_type: profileData.farming_type ?? null,
        is_verified: true,
        updatedAt: now,
    };

    // Phone: prefer 'mobile' key (existing Firestore convention)
    if (profileData.phone) payload['mobile'] = profileData.phone;
    if ((profileData as any).mobile) payload['mobile'] = (profileData as any).mobile;

    if (!existing.exists()) {
        // New document — set createdAt
        payload['createdAt'] = now;
        await setDoc(ref, payload);
        console.log('✅ [Firestore] New farmer profile created:', uid);
    } else {
        // Existing document — merge, preserve createdAt
        await updateDoc(ref, payload);
        console.log('✅ [Firestore] Farmer profile updated:', uid);
    }

    // Fetch back the saved doc to return the canonical profile
    return fetchProfileFromFirestore(uid) as Promise<UserProfile>;
}

/**
 * Fetch farmer profile from Firestore by Firebase UID.
 * Returns null if document does not exist.
 */
export async function fetchProfileFromFirestore(uid: string): Promise<UserProfile | null> {
    try {
        const snap = await getDoc(profileDocRef(uid));
        if (!snap.exists()) {
            console.warn('[Firestore] No profile found for UID:', uid);
            return null;
        }
        const raw = normaliseTimestamps(snap.data() as Record<string, any>);

        const profile: UserProfile = {
            firebase_uid: uid,
            name: raw.name || '',
            user_type: raw.user_type || 'farmer',
            language: raw.language || 'english',
            location: raw.location ?? null,
            district: raw.district,
            crop_type: raw.crop_type,
            soil_type: raw.soil_type,
            land_area: raw.land_area,
            state: raw.state,
            experience: raw.experience,
            farming_type: raw.farming_type,
            mobile: raw.mobile || raw.phone || '',
            phone: raw.mobile || raw.phone || '',
            is_verified: raw.is_verified ?? true,
            created_at: raw.createdAt || raw.created_at || new Date().toISOString(),
            aadhaar: raw.aadhaar,
            upi_id: raw.upi_id,
        };

        // Update localStorage cache
        setCachedProfile(profile);
        console.log('✅ [Firestore] Profile loaded for UID:', uid);
        return profile;
    } catch (err) {
        console.error('[Firestore] Error fetching profile:', err);
        return null;
    }
}

/**
 * Update specific fields in the farmer Firestore profile.
 * Preserves all other existing fields.
 */
export async function updateProfileInFirestore(
    uid: string,
    updates: Partial<UserProfile>
): Promise<void> {
    const ref = profileDocRef(uid);
    const payload: Record<string, any> = {
        updatedAt: serverTimestamp(),
    };

    // Only include defined fields
    const allowedFields: (keyof UserProfile)[] = [
        'name', 'language', 'location', 'district', 'crop_type',
        'soil_type', 'land_area', 'state', 'experience', 'farming_type',
        'user_type', 'aadhaar', 'upi_id'
    ];
    for (const key of allowedFields) {
        if (updates[key] !== undefined) {
            payload[key] = updates[key];
        }
    }
    if ((updates as any).mobile !== undefined) payload['mobile'] = (updates as any).mobile;
    if (updates.phone !== undefined) payload['mobile'] = updates.phone;

    await updateDoc(ref, payload);

    // Invalidate cache so next fetch gets fresh data
    clearCachedProfile();
    console.log('✅ [Firestore] Profile fields updated for UID:', uid);
}

export { setCachedProfile, getCachedProfile, clearCachedProfile };
