export type Screen =
  | 'splash'
  | 'language'
  | 'user-type'
  | 'auth-choice'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'chat'
  | 'disease-prediction'
  | 'market-insight'
  | 'weather'
  | 'crop-recommendation'
  | 'phone-call'
  | 'farmer-profile'
  | 'call-history';

export interface User {
  name: string;
  type: 'farmer' | 'public';
  language: string;
  phone?: string;
  location?: string;
  aadhaar?: string;
  upi_id?: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  image?: string;
  audio?: boolean;
}
