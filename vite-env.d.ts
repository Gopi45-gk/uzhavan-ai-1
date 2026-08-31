/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Backend API
    readonly VITE_API_URL: string;

    // Gemini API (legacy, now handled by backend)
    readonly GEMINI_API_KEY: string;

    // Firebase Configuration
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
