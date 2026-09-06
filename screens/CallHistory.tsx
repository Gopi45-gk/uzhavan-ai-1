import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Phone, Play, Pause, FileText, Clock, Globe, Calendar, Loader2, Trash2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { getApiBaseUrl } from '../services/api';

interface Props {
    onBack: () => void;
    t: (key: string) => string;
}

const API_BASE_URL = getApiBaseUrl();

interface CallRecord {
    id: number;
    language: string;
    transcript: string;
    has_audio: boolean;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    created_at: string;
}

const CallHistory: React.FC<Props> = ({ onBack, t }) => {
    const [calls, setCalls] = useState<CallRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [playingId, setPlayingId] = useState<number | null>(null);
    const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

    const fetchCallHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) { setError('Not logged in'); setLoading(false); return; }

            const token = await user.getIdToken();
            const res = await fetch(`${API_BASE_URL}/api/calls/history?limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            const data = await res.json();
            setCalls(data.calls || []);
        } catch (e: any) {
            console.error('Failed to fetch call history:', e);
            setError(t('callHistoryError') || 'Failed to load call history');
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchCallHistory(); }, [fetchCallHistory]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => { if (audioRef) { audioRef.pause(); audioRef.src = ''; } };
    }, [audioRef]);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const formatDate = (dateStr: string): string => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return '-'; }
    };

    const formatTime = (dateStr: string): string => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch { return '-'; }
    };

    const langNames: Record<string, string> = {
        tamil: 'தமிழ்', english: 'English', hindi: 'हिंदी',
        telugu: 'తెలుగు', kannada: 'கன்னட', malayalam: 'മലയാളം',
    };

    const playAudio = async (callId: number) => {
        // Stop current playback
        if (audioRef) { audioRef.pause(); audioRef.src = ''; setAudioRef(null); }

        if (playingId === callId) { setPlayingId(null); return; }

        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) return;
            const token = await user.getIdToken();

            const audio = new Audio();
            // Set auth header via fetch and blob URL
            const res = await fetch(`${API_BASE_URL}/api/calls/audio/${callId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Audio not found');
            const blob = await res.blob();
            audio.src = URL.createObjectURL(blob);

            audio.onended = () => { setPlayingId(null); setAudioRef(null); };
            audio.onerror = () => { setPlayingId(null); setAudioRef(null); };

            await audio.play();
            setPlayingId(callId);
            setAudioRef(audio);
        } catch (e) {
            console.error('Audio playback error:', e);
            setPlayingId(null);
        }
    };

    const deleteCall = async (callId: number) => {
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) return;
            const token = await user.getIdToken();

            const res = await fetch(`${API_BASE_URL}/api/calls/${callId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (res.ok) {
                setCalls(prev => prev.filter(c => c.id !== callId));
            }
        } catch (e) {
            console.error('Delete error:', e);
        }
    };

    // Loading
    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button onClick={onBack} style={styles.backBtn}><ArrowLeft size={22} /></button>
                    <h1 style={styles.title}><Phone size={20} /> {t('callHistory') || 'Call History'}</h1>
                </div>
                <div style={styles.center}>
                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="#16a34a" />
                    <p style={{ color: '#6b7280', marginTop: 12 }}>{t('loading') || 'Loading...'}</p>
                </div>
            </div>
        );
    }

    // Error
    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button onClick={onBack} style={styles.backBtn}><ArrowLeft size={22} /></button>
                    <h1 style={styles.title}><Phone size={20} /> {t('callHistory') || 'Call History'}</h1>
                </div>
                <div style={styles.center}>
                    <p style={{ color: '#ef4444', marginBottom: 12 }}>{error}</p>
                    <button onClick={fetchCallHistory} style={styles.retryBtn}>{t('retry') || 'Retry'}</button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={onBack} style={styles.backBtn}><ArrowLeft size={22} /></button>
                <h1 style={styles.title}><Phone size={20} /> {t('callHistory') || 'Call History'}</h1>
                <span style={styles.badge}>{calls.length}</span>
            </div>

            {/* Empty State */}
            {calls.length === 0 ? (
                <div style={styles.center}>
                    <Phone size={48} color="#d1d5db" />
                    <p style={{ color: '#9ca3af', marginTop: 16, fontSize: 16 }}>
                        {t('noCallHistory') || 'No call history yet'}
                    </p>
                    <p style={{ color: '#d1d5db', fontSize: 13 }}>
                        {t('noCallHistoryHint') || 'Your calls will appear here after you make them'}
                    </p>
                </div>
            ) : (
                <div style={styles.list}>
                    {calls.map((call, idx) => (
                        <div key={call.id} style={styles.card}>
                            {/* Card Header */}
                            <div style={styles.cardHeader}>
                                <div style={styles.cardIcon}>
                                    <Phone size={18} color="#fff" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={styles.cardTitle}>
                                        {t('call') || 'Call'} #{calls.length - idx}
                                    </div>
                                    <div style={styles.cardDate}>
                                        <Calendar size={12} /> {formatDate(call.start_time)} · {formatTime(call.start_time)}
                                    </div>
                                </div>
                                <button onClick={() => deleteCall(call.id)} style={styles.deleteBtn}>
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {/* Card Meta */}
                            <div style={styles.meta}>
                                <span style={styles.metaItem}>
                                    <Clock size={14} /> {formatDuration(call.duration_seconds)}
                                </span>
                                <span style={styles.metaItem}>
                                    <Globe size={14} /> {langNames[call.language] || call.language}
                                </span>
                            </div>

                            {/* Audio Player */}
                            {call.has_audio && (
                                <button
                                    onClick={() => playAudio(call.id)}
                                    style={{
                                        ...styles.audioBtn,
                                        background: playingId === call.id ? '#dc2626' : '#16a34a',
                                    }}
                                >
                                    {playingId === call.id ? <Pause size={16} /> : <Play size={16} />}
                                    {playingId === call.id
                                        ? (t('stopPlaying') || 'Stop')
                                        : (t('playRecording') || 'Play Recording')}
                                </button>
                            )}

                            {/* Transcript Toggle */}
                            {call.transcript && (
                                <>
                                    <button
                                        onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                                        style={styles.transcriptBtn}
                                    >
                                        <FileText size={14} />
                                        {expandedId === call.id
                                            ? (t('hideTranscript') || 'Hide Transcript')
                                            : (t('viewTranscript') || 'View Transcript')}
                                    </button>

                                    {expandedId === call.id && (
                                        <div style={styles.transcript}>
                                            {call.transcript.split('\n').filter(l => l.trim()).map((line, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        padding: '4px 0',
                                                        color: line.startsWith('Farmer:') ? '#1d4ed8' :
                                                            line.startsWith('UZHAVAN:') ? '#16a34a' : '#374151',
                                                        fontWeight: (line.startsWith('Farmer:') || line.startsWith('UZHAVAN:')) ? 600 : 400,
                                                    }}
                                                >
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
        fontFamily: "'Noto Sans Tamil', 'Noto Sans Tamil UI', 'Tamil Sangam MN', 'Tamil MN', 'Nirmala UI', 'Latha', 'Lohit Tamil', 'Inter', 'Segoe UI', Arial, sans-serif",
    },
    header: {
        background: '#fff',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky' as const,
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    },
    backBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        borderRadius: 8,
        color: '#374151',
    },
    title: {
        fontSize: 18,
        fontWeight: 700,
        color: '#111827',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        margin: 0,
    },
    badge: {
        background: '#16a34a',
        color: '#fff',
        borderRadius: 12,
        padding: '2px 10px',
        fontSize: 13,
        fontWeight: 600,
    },
    center: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center' as const,
        padding: 24,
    },
    list: {
        padding: 16,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    card: {
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        border: '1px solid #f3f4f6',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    cardIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'linear-gradient(135deg, #16a34a, #15803d)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    cardTitle: {
        fontWeight: 700,
        fontSize: 15,
        color: '#111827',
    },
    cardDate: {
        fontSize: 12,
        color: '#9ca3af',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    deleteBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        color: '#d1d5db',
        borderRadius: 6,
    },
    meta: {
        display: 'flex',
        gap: 16,
        marginBottom: 12,
        paddingLeft: 48,
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 13,
        color: '#6b7280',
    },
    audioBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        marginBottom: 8,
        marginLeft: 48,
    },
    transcriptBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        color: '#6b7280',
        fontSize: 13,
        cursor: 'pointer',
        marginLeft: 48,
    },
    transcript: {
        background: '#f9fafb',
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
        marginLeft: 48,
        fontSize: 13,
        lineHeight: 1.6,
        maxHeight: 300,
        overflowY: 'auto' as const,
        border: '1px solid #e5e7eb',
        fontFamily: "'Noto Sans Tamil', 'Noto Sans Tamil UI', 'Tamil Sangam MN', 'Tamil MN', 'Nirmala UI', 'Latha', 'Lohit Tamil', 'Inter', 'Segoe UI', Arial, sans-serif",
    },
    retryBtn: {
        background: '#16a34a',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 24px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
};

export default CallHistory;
