import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Phone as PhoneIcon, MapPin, Map, Leaf, Star, Calendar, Shield, CreditCard, LogOut, Loader2, PhoneIncoming } from 'lucide-react';
import { firebaseAuthService } from '../services/firebaseAuth';
import { firebaseSignOut } from '../services/firebase';

interface Props {
    onBack: () => void;
    onLogout: () => void;
    onNavigate?: (screen: string) => void;
    t: (key: string) => string;
}

interface FarmerDetails {
    name: string;
    phone: string;
    location: string;
    crop_type?: string;      // பயிர் வகை
    district?: string;       // நிலப்பரப்பு/மாவட்டம்
    soil_type?: string;      // மண் வகை
    state?: string;
    experience?: string;
    farming_type?: string;
    aadhaar?: string;
    upi_id?: string;
    registered_date: string;
    user_type: string;
    language?: string;
}

const FarmerProfile: React.FC<Props> = ({ onBack, onLogout, onNavigate, t }) => {
    const [farmer, setFarmer] = useState<FarmerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        fetchFarmerDetails();
    }, []);

    const fetchFarmerDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use getProfileWithCache for fast loading on slow networks
            const profile = await firebaseAuthService.getProfile();
            setFarmer({
                name: profile.name || t('userName'),
                phone: profile.mobile || profile.phone || '',  // Firestore uses 'mobile'
                location: profile.location || '-',
                crop_type: profile.crop_type,
                district: profile.district,
                soil_type: profile.soil_type,
                state: profile.state,
                experience: profile.experience,
                farming_type: profile.farming_type,
                aadhaar: profile.aadhaar,
                upi_id: profile.upi_id,
                registered_date: profile.created_at || new Date().toISOString(),
                user_type: profile.user_type || 'farmer',
                language: profile.language
            });
        } catch (err: any) {
            console.error('Failed to fetch profile:', err);
            setError(t('profileError'));
        } finally {
            setLoading(false);
        }
    };

    // Mask Aadhaar number (show only last 4 digits)
    const maskAadhaar = (aadhaar?: string): string => {
        if (!aadhaar) return t('notProvided');
        const clean = aadhaar.replace(/\D/g, '');
        if (clean.length < 4) return 'XXXX-XXXX-XXXX';
        return `XXXX-XXXX-${clean.slice(-4)}`;
    };

    // Format date
    const formatDate = (dateStr: string): string => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return t('unknown');
        }
    };

    // Handle logout
    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await firebaseSignOut();
            onLogout();
        } catch (err) {
            console.error('Logout error:', err);
            setError(t('logoutError'));
        } finally {
            setLoggingOut(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
                    <p className="text-gray-600">{t('profileLoading')}</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
                <div className="text-center p-6">
                    <div className="text-red-500 text-lg mb-4">{error}</div>
                    <button
                        onClick={fetchFarmerDetails}
                        className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
                    >
                        {t('retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                        <h1 className="text-xl font-semibold text-gray-800">
                            {t('profileTitle')}
                        </h1>
                    </div>
                    <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="flex items-center space-x-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                        {loggingOut ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <LogOut className="w-4 h-4" />
                        )}
                        <span>{loggingOut ? t('loggingOut') : t('logout')}</span>
                    </button>
                </div>
            </div>

            {/* Profile Content */}
            <div className="p-4 space-y-4">
                {/* Profile Card */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex items-center space-x-4 mb-6">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <User className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-800">
                                {farmer?.name || t('notProvided')}
                            </h2>
                            <p className="text-gray-600">{t('farmer')}</p>
                        </div>
                    </div>

                    {/* Profile Details */}
                    <div className="space-y-4">
                        {/* Phone */}
                        <div className="flex items-center space-x-3">
                            <PhoneIcon className="w-5 h-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-500">{t('phone')}</p>
                                <p className="font-medium text-gray-800">
                                    {farmer?.phone || t('notProvided')}
                                </p>
                            </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center space-x-3">
                            <MapPin className="w-5 h-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-500">{t('location')}</p>
                                <p className="font-medium text-gray-800">
                                    {farmer?.location || t('notProvided')}
                                </p>
                            </div>
                        </div>

                        {/* Land Area (stored as district) */}
                        {farmer?.district && (
                            <div className="flex items-center space-x-3">
                                <Map className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('landArea')}</p>
                                    <p className="font-medium text-gray-800">{farmer.district}</p>
                                </div>
                            </div>
                        )}

                        {/* State */}
                        {farmer?.state && (
                            <div className="flex items-center space-x-3">
                                <Map className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('state')}</p>
                                    <p className="font-medium text-gray-800">{farmer.state}</p>
                                </div>
                            </div>
                        )}

                        {/* Crop Type */}
                        {farmer?.crop_type && (
                            <div className="flex items-center space-x-3">
                                <Leaf className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('cropType')}</p>
                                    <p className="font-medium text-gray-800">{farmer.crop_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Soil Type */}
                        {farmer?.soil_type && (
                            <div className="flex items-center space-x-3">
                                <Leaf className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('soilType')}</p>
                                    <p className="font-medium text-gray-800">{farmer.soil_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Farming Type */}
                        {farmer?.farming_type && (
                            <div className="flex items-center space-x-3">
                                <Leaf className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('farmingType')}</p>
                                    <p className="font-medium text-gray-800">{farmer.farming_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Experience */}
                        {farmer?.experience && (
                            <div className="flex items-center space-x-3">
                                <Star className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">{t('experience')}</p>
                                    <p className="font-medium text-gray-800">{farmer.experience}</p>
                                </div>
                            </div>
                        )}

                        {/* Registration Date */}
                        <div className="flex items-center space-x-3">
                            <Calendar className="w-5 h-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-500">{t('registeredDate')}</p>
                                <p className="font-medium text-gray-800">
                                    {formatDate(farmer?.registered_date || '')}
                                </p>
                            </div>
                        </div>

                        {/* Aadhaar (if available) */}
                        {farmer?.aadhaar && (
                            <div className="flex items-center space-x-3">
                                <Shield className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">Aadhaar</p>
                                    <p className="font-medium text-gray-800">
                                        {maskAadhaar(farmer.aadhaar)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* UPI ID (if available) */}
                        {farmer?.upi_id && (
                            <div className="flex items-center space-x-3">
                                <CreditCard className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-sm text-gray-500">UPI ID</p>
                                    <p className="font-medium text-gray-800">{farmer.upi_id}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Call History Button */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <button
                        onClick={() => onNavigate?.('call-history')}
                        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-green-50 transition-colors border border-green-200"
                    >
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <PhoneIncoming className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800">{t('callHistory') || 'Call History'}</p>
                                <p className="text-xs text-gray-500">{t('callHistoryDesc') || 'View your past calls & recordings'}</p>
                            </div>
                        </div>
                        <ArrowLeft className="w-5 h-5 text-gray-400" style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FarmerProfile;
