import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// 0. 环境检测
// ==========================================
const isElectron = new URLSearchParams(window.location.search).get('mode') === 'electron';

const electronAPI = isElectron ? window.electronAPI : undefined;

// ==========================================
// 1. 类型定义
// ==========================================
interface Theme {
    titleColor: string;
    textColor: string;
    subTextColor: string;
    bgColor: string;
    bgOpacity: number;
    showTitleBar: boolean;
    syncTitleBarWithBg: boolean;
    titleBarBgColor: string;
    titleBarOpacity?: number;
    compactQueue: boolean;
}

interface SongInfo {
    Id: string;
    SongName: string;
    ArtistName: string;
    OrderedByUid: string;
    OrderedByAvatar: string;
    CoverUrl?: string;
    OrderedBy: string;
    GuardLevel?: number;
}

type RequestedSongArtwork = 'bili_avatar' | 'song_cover';

interface SongArtworkImageProps {
    song: SongInfo;
    source: 'avatar' | 'cover';
    className?: string;
}

function getArtworkCandidates(
    song: SongInfo,
    source: 'avatar' | 'cover'
): string[] {
    const primaryUrl = source === 'cover'
        ? song.CoverUrl || ''
        : song.OrderedByAvatar || '';
    const avatarFallback = source === 'avatar' && song.OrderedByUid
        ? `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(song.OrderedByUid)}`
        : '';
    const candidates = [primaryUrl, avatarFallback].filter(Boolean);

    if (source === 'cover' && primaryUrl) {
        try {
            const parsed = new URL(primaryUrl);
            if (/^p\d+\.music\.126\.net$/i.test(parsed.hostname)) {
                for (const host of ['p1.music.126.net', 'p2.music.126.net', 'p3.music.126.net', 'p4.music.126.net']) {
                    const alternative = new URL(parsed.toString());
                    alternative.hostname = host;
                    if (!alternative.search) alternative.search = '?param=256y256';
                    candidates.push(alternative.toString());
                }
            }
        } catch {
            // A malformed external URL will fail once and then use the icon.
        }
    }

    return [...new Set(candidates)];
}

const SongArtworkImage: React.FC<SongArtworkImageProps> = ({ song, source, className = '' }) => {
    const candidates = getArtworkCandidates(song, source);
    const candidateKey = candidates.join('\n');
    const [candidateIndex, setCandidateIndex] = useState(0);
    const imageUrl = candidates[candidateIndex] || '';

    useEffect(() => {
        setCandidateIndex(0);
    }, [candidateKey]);

    if (!imageUrl) return <span className="w-full h-full flex items-center justify-center text-lg" aria-label="暂无歌曲封面">🎵</span>;

    return (
        <img
            src={imageUrl}
            alt={source === 'cover' ? `${song.SongName} 封面` : `${song.OrderedBy} 头像`}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover ${className}`}
            onError={() => setCandidateIndex(index => index + 1)}
        />
    );
};

interface ToastInfo {
    id: number;
    msg: string;
}

interface OverlayNotice {
    id: number;
    user: {
        name?: string;
        uname?: string;
        avatar?: string;
    };
    title?: string;
    detail?: string;
    reason?: string;
    songName?: string;
    queueAheadCount?: number;
}

interface BannerNotice extends OverlayNotice {
    kind: 'success' | 'failure';
    phase: 'visible' | 'leaving';
}

interface DragInfo {
    type: 'current' | 'queue';
    index: number;
    item: SongInfo;
    x: number;
    y: number;
    actionType?: 'none' | 'delete' | 'play' | 'push';
}

interface WidgetStyle {
    w: number;
    h: number;
    x: number;
    y: number;
}

interface SysLog {
    Time: string;
    Color: string;
    Message: string;
}

interface QrState {
    loading: boolean;
    base64: string;
    message: string;
}

type NativeConnectorId = 'netease' | 'kugou' | 'qqmusic' | 'folia';

interface ConnectorStatus {
    id: NativeConnectorId;
    name: string;
    installed: boolean;
    currentVersion: string | null;
    latestVersion: string | null;
    minimumCoreVersion: string | null;
    compatible: boolean;
    updateAvailable: boolean;
    autoUpdateAvailable: boolean;
    manualUpdateAvailable: boolean;
    updateKind: 'none' | 'install' | 'patch' | 'player' | 'major';
    supportedPlayerVersion: string | null;
    updating: boolean;
    checkedAt: string;
    error: string | null;
}

interface OverlayModRecord {
    schemaVersion: 1;
    id: string;
    name: string;
    version: string;
    entry: string;
    author: string;
    description: string;
    homepage: string;
    minAppVersion: string;
    installedAt: string;
    source: string;
    active: boolean;
    builtin: boolean;
}

interface OverlayModState {
    activeId: string;
    active: OverlayModRecord;
    overlays: OverlayModRecord[];
    officialRepository: string;
    officialDescriptorProxy: string;
}

// ==========================================
// 2. 全局样式
// ==========================================
const GlobalStyles: React.FC = () => (
    <style>{`
    @keyframes slideInUp { from { opacity: 0; transform: translateY(15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes toastSlideIn { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes bannerDropIn {
        from { opacity: 0; transform: translateY(-140%) scale(0.92); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes bannerRetract {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(-140%) scale(0.94); }
    }
    
    html, body, #root { 
        background: transparent !important; 
        margin: 0; padding: 0; 
        width: 100%; height: 100%;
        overflow: visible !important; 
    }
    
    ::-webkit-scrollbar { display: none; }
    
    .custom-scrollbar::-webkit-scrollbar { display: block; width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
    
    .glass-panel-base { 
        backdrop-filter: blur(20px); 
        -webkit-backdrop-filter: blur(20px); 
        border: 1px solid rgba(255, 255, 255, 0.12); 
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); 
    }
    .glass-card { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); }
    img { user-drag: none; -webkit-user-drag: none; }
    input[type="color"] { -webkit-appearance: none; border: none; padding: 0; }
    input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    input[type="color"]::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; }
    
    .no-drag { -webkit-app-region: no-drag; }

    .admin-widget-root {
        --admin-accent: #7c6cf2;
        --admin-accent-soft: rgba(124, 108, 242, 0.14);
        --admin-border: rgba(255, 255, 255, 0.075);
        --admin-surface: rgba(18, 22, 32, 0.86);
        color: #e8eaf2;
        background:
            radial-gradient(circle at 78% -12%, rgba(124, 108, 242, 0.17), transparent 36%),
            radial-gradient(circle at 18% 110%, rgba(38, 191, 165, 0.09), transparent 30%),
            #0b0d13;
    }
    .admin-titlebar {
        min-height: 52px;
        background: rgba(11, 13, 19, 0.78);
        border-bottom: 1px solid var(--admin-border);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
    }
    .admin-brand-mark {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border-radius: 9px;
        color: white;
        font-size: 15px;
        font-weight: 800;
        background: linear-gradient(145deg, #8b7cf6, #6253dd);
        box-shadow: 0 8px 24px rgba(98, 83, 221, 0.28), inset 0 1px rgba(255, 255, 255, 0.24);
    }
    .admin-sidebar {
        width: 190px;
        padding: 18px 12px 14px;
        border-right: 1px solid var(--admin-border);
        background: rgba(11, 13, 19, 0.54);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
    }
    .admin-nav-label {
        padding: 0 10px;
        margin: 6px 0 7px;
        color: #666c7d;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .14em;
    }
    .admin-nav-item {
        position: relative;
        display: flex;
        width: 100%;
        align-items: center;
        gap: 11px;
        padding: 10px 11px;
        border: 1px solid transparent;
        border-radius: 11px;
        color: #9298a9;
        font-size: 13px;
        text-align: left;
        transition: color 160ms ease, background 160ms ease, border-color 160ms ease, transform 160ms ease;
    }
    .admin-nav-item:hover {
        color: #e8eaf2;
        background: rgba(255, 255, 255, 0.045);
    }
    .admin-nav-item:active { transform: scale(.985); }
    .admin-nav-item.active {
        color: white;
        background: linear-gradient(115deg, rgba(124, 108, 242, 0.2), rgba(124, 108, 242, 0.08));
        border-color: rgba(139, 124, 246, 0.2);
        box-shadow: inset 0 1px rgba(255,255,255,.035);
    }
    .admin-nav-item.active::before {
        content: '';
        position: absolute;
        left: -13px;
        width: 3px;
        height: 20px;
        border-radius: 0 4px 4px 0;
        background: #8b7cf6;
        box-shadow: 0 0 14px rgba(139, 124, 246, .72);
    }
    .admin-nav-icon {
        display: grid;
        width: 25px;
        height: 25px;
        flex: 0 0 25px;
        place-items: center;
        border-radius: 8px;
        color: #858b9d;
        font-size: 14px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.045);
        transition: inherit;
    }
    .admin-nav-item.active .admin-nav-icon {
        color: #dcd8ff;
        background: rgba(139, 124, 246, .18);
    }
    .admin-content-shell { padding: 30px clamp(24px, 4vw, 52px) 44px; }
    .admin-page { width: 100%; max-width: 1040px; margin: 0 auto; }
    .admin-page-heading {
        margin: 0;
        color: #f7f7fb;
        font-size: 26px;
        font-weight: 750;
        letter-spacing: -.025em;
    }
    .admin-settings-hero {
        position: relative;
        overflow: hidden;
        margin-bottom: 20px;
        padding: 24px;
        border: 1px solid rgba(139, 124, 246, .2);
        border-radius: 18px;
        background: linear-gradient(125deg, rgba(124, 108, 242, .14), rgba(20, 24, 35, .74) 52%, rgba(38, 191, 165, .055));
        box-shadow: 0 18px 48px rgba(0, 0, 0, .18), inset 0 1px rgba(255, 255, 255, .04);
    }
    .admin-settings-hero::after {
        content: '';
        position: absolute;
        top: -70px;
        right: -60px;
        width: 190px;
        height: 190px;
        border-radius: 50%;
        background: rgba(139, 124, 246, .12);
        filter: blur(6px);
        pointer-events: none;
    }
    .admin-quick-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 20px;
    }
    .admin-quick-nav button {
        padding: 7px 11px;
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 9px;
        color: #aeb3c2;
        font-size: 11px;
        font-weight: 650;
        background: rgba(5, 7, 11, .26);
        transition: all 150ms ease;
    }
    .admin-quick-nav button:hover {
        color: white;
        border-color: rgba(139, 124, 246, .35);
        background: rgba(139, 124, 246, .12);
    }
    .admin-settings-page > .settings-card {
        scroll-margin-top: 22px;
        background: linear-gradient(145deg, rgba(21, 25, 36, .92), rgba(15, 18, 27, .9));
        border-color: rgba(255, 255, 255, .075);
        border-radius: 16px;
        box-shadow: 0 14px 38px rgba(0, 0, 0, .16), inset 0 1px rgba(255, 255, 255, .025);
    }
    .admin-settings-page input:not([type="checkbox"]):not([type="range"]):not([type="color"]),
    .admin-settings-page select,
    .admin-settings-page textarea {
        border-color: rgba(255, 255, 255, .09);
        background: rgba(4, 6, 10, .36);
        transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
    }
    .admin-settings-page input:not([type="checkbox"]):not([type="range"]):not([type="color"]):focus,
    .admin-settings-page select:focus,
    .admin-settings-page textarea:focus {
        border-color: rgba(139, 124, 246, .58) !important;
        background: rgba(8, 10, 16, .64);
        box-shadow: 0 0 0 3px rgba(124, 108, 242, .1);
    }
    .admin-range-field {
        padding: 13px 14px 11px;
        border: 1px solid rgba(255, 255, 255, .075);
        border-radius: 12px;
        background: rgba(4, 6, 10, .25);
    }
    .admin-range-value {
        min-width: 58px;
        padding: 4px 8px;
        border: 1px solid rgba(139, 124, 246, .18);
        border-radius: 7px;
        color: #dcd8ff;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        text-align: center;
        background: rgba(124, 108, 242, .09);
    }
    .admin-range-input {
        width: 100%;
        height: 4px;
        margin: 13px 0 9px;
        border-radius: 999px;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
    }
    .admin-range-input::-webkit-slider-thumb {
        width: 15px;
        height: 15px;
        border: 3px solid #8b7cf6;
        border-radius: 50%;
        appearance: none;
        -webkit-appearance: none;
        background: #f7f7fb;
        box-shadow: 0 2px 8px rgba(0, 0, 0, .35), 0 0 0 3px rgba(139, 124, 246, .12);
        transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .admin-range-input:hover::-webkit-slider-thumb,
    .admin-range-input:focus-visible::-webkit-slider-thumb {
        transform: scale(1.08);
        box-shadow: 0 2px 10px rgba(0, 0, 0, .4), 0 0 0 5px rgba(139, 124, 246, .15);
    }
    .admin-range-input:disabled { cursor: not-allowed; opacity: .42; }
    .admin-range-bounds {
        display: flex;
        justify-content: space-between;
        color: #5f6575;
        font-size: 9px;
        font-variant-numeric: tabular-nums;
    }
    .admin-widget-root button:focus-visible,
    .admin-widget-root a:focus-visible,
    .admin-widget-root input:focus-visible,
    .admin-widget-root select:focus-visible,
    .admin-widget-root textarea:focus-visible {
        outline: 2px solid rgba(167, 155, 255, .9);
        outline-offset: 2px;
    }
    @media (max-width: 720px) {
        .admin-sidebar { width: 76px; padding-inline: 9px; }
        .admin-sidebar .admin-nav-label,
        .admin-sidebar .admin-nav-text,
        .admin-sidebar .admin-sidebar-meta { display: none; }
        .admin-nav-item { justify-content: center; padding-inline: 8px; }
        .admin-nav-item.active::before { left: -10px; }
        .admin-content-shell { padding: 22px 16px 36px; }
    }
  `}</style>
);

const SuccessBannerOverlay: React.FC = () => {
    const bannerExitMs = 420;
    const [notices, setNotices] = useState<BannerNotice[]>([]);
    const bannerVisibleMsRef = useRef<number>(5000);
    const bannerWidthPxRef = useRef<number>(720);
    const bannerThemeRef = useRef<'light' | 'dark'>('dark');
    const bannerOpacityRef = useRef<number>(0.94);
    const lastSuccessIdRef = useRef<number>(0);
    const lastRejectIdRef = useRef<number>(0);
    const exitTimerRefs = useRef<Map<number, number>>(new Map());
    const clearTimerRefs = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        const clearTimers = () => {
            exitTimerRefs.current.forEach(timer => window.clearTimeout(timer));
            clearTimerRefs.current.forEach(timer => window.clearTimeout(timer));
            exitTimerRefs.current.clear();
            clearTimerRefs.current.clear();
        };

        const showNotice = (notice: OverlayNotice, kind: 'success' | 'failure') => {
            setNotices(prev => [{ ...notice, kind, phase: 'visible' }, ...prev]);

            const exitTimer = window.setTimeout(() => {
                setNotices(prev => prev.map(item => (
                    item.id === notice.id
                        ? { ...item, phase: 'leaving' }
                        : item
                )));
            }, bannerVisibleMsRef.current);

            const clearTimer = window.setTimeout(() => {
                setNotices(prev => prev.filter(item => item.id !== notice.id));
                exitTimerRefs.current.delete(notice.id);
                clearTimerRefs.current.delete(notice.id);
            }, bannerVisibleMsRef.current + bannerExitMs);

            exitTimerRefs.current.set(notice.id, exitTimer);
            clearTimerRefs.current.set(notice.id, clearTimer);
        };

        const fetchLatest = async () => {
            try {
                const res = await fetch('http://localhost:5555/data', { cache: 'no-store' });
                if (!res.ok) return;
                const json: any = await res.json();
                const nextVisibleMs = Number(json.overlayNoticeDurationMs);
                bannerVisibleMsRef.current = Number.isFinite(nextVisibleMs) && nextVisibleMs >= 1000
                    ? nextVisibleMs
                    : 5000;
                const nextWidthPx = Number(json.overlayNoticeWidthPx);
                bannerWidthPxRef.current = Number.isFinite(nextWidthPx) && nextWidthPx >= 280
                    ? nextWidthPx
                    : 720;
                bannerThemeRef.current = json.overlayNoticeTheme === 'light' ? 'light' : 'dark';
                const nextOpacity = Number(json.overlayNoticeOpacity);
                bannerOpacityRef.current = Number.isFinite(nextOpacity) && nextOpacity >= 0
                    ? Math.min(1, nextOpacity)
                    : 0.94;
                const successes: OverlayNotice[] = Array.isArray(json.successes) ? json.successes : [];
                const rejects: OverlayNotice[] = Array.isArray(json.rejects) ? json.rejects : [];
                const incoming = [
                    ...successes
                        .filter(item => typeof item.id === 'number' && item.id > lastSuccessIdRef.current)
                        .map(item => ({ ...item, kind: 'success' as const })),
                    ...rejects
                        .filter(item => typeof item.id === 'number' && item.id > lastRejectIdRef.current)
                        .map(item => ({ ...item, kind: 'failure' as const }))
                ].sort((a, b) => a.id - b.id);
                if (incoming.length === 0) return;
                const successItems = incoming.filter(item => item.kind === 'success');
                const rejectItems = incoming.filter(item => item.kind === 'failure');
                const latestSuccess = successItems.length > 0 ? successItems[successItems.length - 1] : null;
                const latestReject = rejectItems.length > 0 ? rejectItems[rejectItems.length - 1] : null;
                if (latestSuccess) lastSuccessIdRef.current = latestSuccess.id;
                if (latestReject) lastRejectIdRef.current = latestReject.id;
                incoming.forEach(item => showNotice(item, item.kind));
            } catch {
                // Keep the browser source transparent while offline.
            }
        };

        void fetchLatest();
        const timer = window.setInterval(fetchLatest, 600);
        return () => {
            window.clearInterval(timer);
            clearTimers();
        };
    }, []);

    return (
        <div className="w-screen h-screen bg-transparent overflow-hidden pointer-events-none relative">
            {notices.length > 0 && (
                <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col gap-3 pt-3 transition-transform duration-300 ease-out">
                    {notices.map(notice => {
                        const userName = notice.user?.name || notice.user?.uname || 'Guest';
                        const songName = notice.songName || notice.detail || 'Unknown Song';
                        const aheadCount = Math.max(0, Number(notice.queueAheadCount || 0));
                        const failedSongMatch = /未搜到歌曲:\s*(.+)$/.exec(notice.reason || '');
                        const failedSongName = failedSongMatch?.[1]?.trim();
                        const bannerText = notice.kind === 'success'
                            ? `${userName}\u70b9\u6b4c\u300a${songName}\u300b\u6210\u529f\uff0c\u524d\u9762\u8fd8\u6709${aheadCount}\u9996\u6b4c`
                            : failedSongName
                                ? `${userName}\u70b9\u6b4c\u300a${failedSongName}\u300b\u5931\u8d25\uff0c${notice.reason?.replace(/未搜到歌曲:\s*(.+)$/, '未搜到歌曲') || '请求未通过'}`
                                : `${userName}\u70b9\u6b4c\u5931\u8d25\uff0c${notice.reason || '请求未通过'}`;
                        const bannerAnimation = notice.phase === 'visible'
                            ? 'bannerDropIn 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                            : `bannerRetract ${bannerExitMs}ms cubic-bezier(0.4, 0, 1, 1) forwards`;
                        const isLightTheme = bannerThemeRef.current === 'light';
                        const alpha = Math.min(1, Math.max(0, bannerOpacityRef.current));
                        const isSuccess = notice.kind === 'success';
                        const containerStyle = isLightTheme
                            ? {
                                background: `rgba(255, 255, 255, ${alpha})`,
                                borderColor: isSuccess
                                    ? `rgba(16, 185, 129, ${0.34 + alpha * 0.46})`
                                    : `rgba(244, 63, 94, ${0.34 + alpha * 0.46})`,
                                boxShadow: isSuccess
                                    ? `0 14px 34px rgba(5, 150, 105, ${alpha * 0.2}), 0 3px 10px rgba(15, 23, 42, ${alpha * 0.08})`
                                    : `0 14px 34px rgba(225, 29, 72, ${alpha * 0.2}), 0 3px 10px rgba(15, 23, 42, ${alpha * 0.08})`,
                                color: '#111827'
                            }
                            : {
                                background: isSuccess
                                    ? `linear-gradient(135deg, rgba(6, 31, 25, ${alpha}), rgba(15, 23, 42, ${alpha * 0.98}))`
                                    : `linear-gradient(135deg, rgba(48, 12, 22, ${alpha}), rgba(15, 23, 42, ${alpha * 0.98}))`,
                                borderColor: isSuccess
                                    ? `rgba(52, 211, 153, ${0.34 + alpha * 0.46})`
                                    : `rgba(251, 113, 133, ${0.34 + alpha * 0.46})`,
                                boxShadow: `0 16px 38px rgba(0, 0, 0, ${alpha * 0.46})`,
                                color: '#ffffff'
                            };
                        const accentColor = isSuccess ? '#10b981' : '#f43f5e';
                        const accentSoftColor = isSuccess
                            ? (isLightTheme ? 'rgba(16, 185, 129, 0.12)' : 'rgba(52, 211, 153, 0.16)')
                            : (isLightTheme ? 'rgba(244, 63, 94, 0.12)' : 'rgba(251, 113, 133, 0.16)');
                        const accentRailStyle = {
                            background: isSuccess
                                ? 'linear-gradient(180deg, #34d399, #059669)'
                                : 'linear-gradient(180deg, #fb7185, #e11d48)',
                            opacity: 1
                        };
                        const avatarFrameStyle = {
                            borderColor: isLightTheme ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.2)',
                            backgroundColor: isLightTheme
                                ? '#ffffff'
                                : 'rgba(255, 255, 255, 0.1)',
                            boxShadow: isLightTheme ? '0 3px 10px rgba(15, 23, 42, 0.12)' : '0 3px 12px rgba(0, 0, 0, 0.3)'
                        };
                        const statusBadgeStyle = {
                            color: isSuccess
                                ? (isLightTheme ? '#047857' : '#a7f3d0')
                                : (isLightTheme ? '#be123c' : '#fecdd3'),
                            backgroundColor: accentSoftColor
                        };
                        const queueBadgeStyle = {
                            color: isLightTheme ? '#475569' : '#cbd5e1',
                            backgroundColor: isLightTheme ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.08)',
                            borderColor: isLightTheme ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.1)'
                        };
                        const bodyTextClass = isLightTheme ? 'text-slate-800' : 'text-slate-50';
                        const statusTitle = isSuccess ? '\u70b9\u6b4c\u6210\u529f' : '\u70b9\u6b4c\u5931\u8d25';
                        const queueLabel = aheadCount > 0 ? `\u524d\u65b9 ${aheadCount} \u9996` : '\u5373\u5c06\u64ad\u653e';

                        return (
                            <div
                                key={notice.id}
                                style={{
                                    animation: bannerAnimation,
                                    width: `min(${bannerWidthPxRef.current}px, calc(100vw - 24px))`,
                                    ...containerStyle
                                }}
                                className="relative min-w-[280px] overflow-hidden rounded-[22px] border transition-transform duration-300 ease-out"
                            >
                                <div style={accentRailStyle} className="absolute inset-y-0 left-0 w-[5px]"></div>
                                <div
                                    style={{ backgroundColor: accentSoftColor }}
                                    className="absolute -right-10 -top-14 h-32 w-32 rounded-full"
                                ></div>
                                <div className="relative flex items-start gap-3.5 py-3.5 pl-[18px] pr-4">
                                    <div className="relative h-12 w-12 shrink-0 self-start">
                                        <div style={avatarFrameStyle} className="h-12 w-12 overflow-hidden rounded-[15px] border-2">
                                        {notice.user.avatar ? (
                                            <img
                                                src={notice.user.avatar}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className={`h-full w-full grid place-items-center text-sm font-bold ${isLightTheme ? 'text-slate-700' : 'text-white/75'}`}>
                                                {userName.slice(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                        </div>
                                        <div
                                            style={{ backgroundColor: accentColor, borderColor: isLightTheme ? '#ffffff' : '#0f172a' }}
                                            className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 text-white"
                                        >
                                            {isSuccess ? (
                                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                                                    <path d="m3.5 8.3 2.7 2.6 6.2-6.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                                                    <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                            <span style={statusBadgeStyle} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold leading-none">
                                                <span style={{ backgroundColor: accentColor }} className="h-1.5 w-1.5 rounded-full"></span>
                                                {statusTitle}
                                            </span>
                                            {isSuccess && (
                                                <span style={queueBadgeStyle} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none">
                                                    {queueLabel}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-[15px] font-semibold leading-[1.6] break-words whitespace-normal ${bodyTextClass}`}>
                                            {bannerText}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const hexToRgba = (hex: string, alpha: number): string => {
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16) || 22;
    const g = parseInt(hex.slice(3, 5), 16) || 24;
    const b = parseInt(hex.slice(5, 7), 16) || 30;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface BoundedRangeProps {
    label: string;
    value: number;
    minimum: number;
    maximum: number;
    step: number;
    minimumLabel: string;
    maximumLabel: string;
    formatValue: (value: number) => string;
    onChange: (value: number) => void;
    onCommit: (value: number) => void;
    onEditingChange: (editing: boolean) => void;
    disabled?: boolean;
}

const BoundedRange: React.FC<BoundedRangeProps> = ({
    label,
    value,
    minimum,
    maximum,
    step,
    minimumLabel,
    maximumLabel,
    formatValue,
    onChange,
    onCommit,
    onEditingChange,
    disabled = false
}) => {
    const editingRef = useRef(false);
    const normalizedValue = Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : minimum;
    const progress = ((normalizedValue - minimum) / (maximum - minimum)) * 100;

    const beginEditing = () => {
        if (editingRef.current) return;
        editingRef.current = true;
        onEditingChange(true);
    };
    const commit = (nextValue: number) => {
        if (!editingRef.current) return;
        editingRef.current = false;
        onEditingChange(false);
        onCommit(nextValue);
    };

    return (
        <div className="admin-range-field">
            <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-gray-300">{label}</label>
                <output className="admin-range-value">{formatValue(normalizedValue)}</output>
            </div>
            <input
                type="range"
                aria-label={label}
                aria-valuetext={formatValue(normalizedValue)}
                disabled={disabled}
                min={minimum}
                max={maximum}
                step={step}
                value={normalizedValue}
                onPointerDown={beginEditing}
                onKeyDown={beginEditing}
                onChange={event => {
                    beginEditing();
                    onChange(Number(event.currentTarget.value));
                }}
                onPointerUp={event => commit(Number(event.currentTarget.value))}
                onPointerCancel={event => commit(Number(event.currentTarget.value))}
                onKeyUp={event => commit(Number(event.currentTarget.value))}
                onBlur={event => commit(Number(event.currentTarget.value))}
                className="admin-range-input"
                style={{
                    background: `linear-gradient(90deg, #8b7cf6 0%, #8b7cf6 ${progress}%, rgba(255,255,255,.09) ${progress}%, rgba(255,255,255,.09) 100%)`
                }}
            />
            <div className="admin-range-bounds" aria-hidden="true">
                <span>{minimumLabel}</span>
                <span>{maximumLabel}</span>
            </div>
        </div>
    );
};

const mapConsoleColor = (color: string): string => {
    const map: Record<string, string> = {
        'Cyan': '#22d3ee', 'Yellow': '#facc15', 'Green': '#4ade80',
        'Red': '#f87171', 'DarkGray': '#9ca3af', 'Magenta': '#c084fc'
    };
    return map[color] || '#e5e7eb';
};

const getGuardStyle = (level?: number) => {
    switch(level) {
        case 1: return { border: 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]', tag: 'bg-gradient-to-r from-red-600 to-red-400 text-white shadow-sm', label: '总督' };
        case 2: return { border: 'border-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]', tag: 'bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-sm', label: '提督' };
        case 3: return { border: 'border-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]', tag: 'bg-gradient-to-r from-blue-600 to-blue-400 text-white shadow-sm', label: '舰长' };
        default: return { border: 'border-white/10', tag: '', label: '' };
    }
};

const defaultTheme: Theme = {
    titleColor: '#ffffff', textColor: '#ffffff', subTextColor: '#a0aec0', bgColor: '#16181e', bgOpacity: 0.85,
    showTitleBar: true, syncTitleBarWithBg: false, titleBarBgColor: '#000000', titleBarOpacity: 0.2,
    compactQueue: false
};

// ==========================================
// 3. 核心组件: Overlay 悬浮窗面板
// ==========================================
interface OverlayWidgetProps {
    onToggleAdmin: () => void;
}

const OverlayWidget: React.FC<OverlayWidgetProps> = ({ onToggleAdmin }) => {
    const [data, setData] = useState<{ current: SongInfo | null; currentIsRequested: boolean; playerPausedAfterRequests: boolean; requestedSongArtwork: RequestedSongArtwork; queue: SongInfo[]; status: string }>({ current: null, currentIsRequested: false, playerPausedAfterRequests: false, requestedSongArtwork: 'bili_avatar', queue: [], status: '' });
    const [isConnected, setIsConnected] = useState<boolean>(true);
    const [isCdpConnected, setIsCdpConnected] = useState<boolean>(true);
    const [accepting, setAccepting] = useState<boolean>(true);
    const [playing, setPlaying] = useState<boolean>(true);

    const [successes, setSuccesses] = useState<OverlayNotice[]>([]);
    const [rejects, setRejects] = useState<OverlayNotice[]>([]);
    const [, setPrevQueue] = useState<SongInfo[]>([]);
    const [newItemsIds, setNewItemsIds] = useState<Set<string>>(new Set());

    const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [titleBarActionsOpen, setTitleBarActionsOpen] = useState<boolean>(false);

    // ⭐ 新增: 全局 UI 500ms 冷却锁定
    const [actionLock, setActionLock] = useState<boolean>(false);

    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const saved = localStorage.getItem('bili-widget-theme');
            return saved ? { ...defaultTheme, ...JSON.parse(saved) } : defaultTheme;
        } catch { return defaultTheme; }
    });

    const [toasts, setToasts] = useState<ToastInfo[]>([]);
    const lastToastTimeRef = useRef<number>(0);
    const lastSyncTimeRef = useRef<number>(0);

    const triggerToast = (msg: string) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, msg }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    };

    // ⭐ 触发冷却锁的方法
    const triggerActionLock = () => {
        setActionLock(true);
        setTimeout(() => setActionLock(false), 1000);
    };

    const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>(() => {
        if (isElectron) return { w: 0, h: 0, x: 0, y: 0 };
        let w = 320, h = 480, x = 50, y = 50;
        try {
            const savedSize = JSON.parse(localStorage.getItem('bili-widget-size') || '{}');
            if (savedSize && savedSize.w >= 200) { w = savedSize.w; h = savedSize.h; }
            const savedPos = JSON.parse(localStorage.getItem('bili-widget-pos') || '{}');
            if (savedPos && typeof savedPos.x === 'number') {
                let safeX = savedPos.x; let safeY = savedPos.y;
                if (safeX < -100 || safeX > window.innerWidth || safeY < -100 || safeY > window.innerHeight) { safeX = 50; safeY = 50; }
                x = safeX; y = safeY;
            }
        } catch {}
        return { w, h, x, y };
    });

    useEffect(() => {
        const isFirstTime = localStorage.getItem('bili-first-launch') === null;
        if (isFirstTime && isElectron) {
            localStorage.setItem('bili-first-launch', 'false');
            setTimeout(() => {
                triggerToast("🎉 欢迎使用！已自动为您打开控制面板。如果您关闭了它，可随时点击右上角的 ⚙️ 按钮呼出！");
                electronAPI?.openAdmin();
            }, 1000);
        }
    }, []);

    // 外观设置自动保存机制 (防抖 0.5s)
    useEffect(() => {
        localStorage.setItem('bili-widget-theme', JSON.stringify(theme));

        const syncTimer = setTimeout(() => {
            const timestamp = Date.now();
            let currentW = widgetStyle.w; let currentH = widgetStyle.h;

            if (isElectron) {
                currentW = window.innerWidth; currentH = window.innerHeight;
            }

            const widgetStyleToSave = {
                theme,
                size: { w: Math.max(240, currentW), h: Math.max(300, currentH) },
                timestamp
            };

            lastSyncTimeRef.current = timestamp;
            fetch('http://localhost:5555/api/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ widgetStyle: widgetStyleToSave })
            }).catch(()=>{});
        }, 500);

        return () => clearTimeout(syncTimer);
    }, [theme, widgetStyle]);

    useEffect(() => {
        if (isElectron) return;
        const target = document.querySelector('.react-widget-root') as HTMLElement;
        if (target) {
            target.style.width = `${widgetStyle.w}px`;
            target.style.height = `${widgetStyle.h}px`;
            target.style.left = `${widgetStyle.x}px`;
            target.style.top = `${widgetStyle.y}px`;
            target.style.margin = '0';
        }
    }, [widgetStyle]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('http://localhost:5555/data');
                if (!res.ok) throw new Error("Network response was not ok");
                const json: any = await res.json();

                if (json.uiConfig && json.uiConfig.timestamp) {
                    if (json.uiConfig.timestamp > lastSyncTimeRef.current) {
                        const { theme: bTheme, timestamp, size: bSize } = json.uiConfig;
                        if (bTheme) setTheme({ ...defaultTheme, ...bTheme });

                        if (!isElectron) {
                            setWidgetStyle(prev => {
                                const next = { ...prev };
                                let changed = false;
                                if (bSize && typeof bSize.w === 'number') {
                                    next.w = Math.max(240, bSize.w);
                                    next.h = Math.max(300, bSize.h);
                                    localStorage.setItem('bili-widget-size', JSON.stringify({ w: next.w, h: next.h }));
                                    changed = true;
                                }
                                return changed ? next : prev;
                            });
                        }
                        lastSyncTimeRef.current = timestamp;
                    }
                }

                if (json.toast && json.toast.time > lastToastTimeRef.current) {
                    lastToastTimeRef.current = json.toast.time;
                    triggerToast(json.toast.msg);
                }

                setSuccesses(json.successes || []);
                setRejects(json.rejects || []);

                const safeQueue: SongInfo[] = Array.isArray(json.queue) ? json.queue : [];
                setPrevQueue(prev => {
                    const prevIds = new Set(prev.map(s => `${s.Id}-${s.OrderedByUid}`));
                    const currentIds = safeQueue.map(s => `${s.Id}-${s.OrderedByUid}`);
                    const newIds = new Set<string>();
                    currentIds.forEach(id => { if (!prevIds.has(id)) newIds.add(id); });
                    if (newIds.size > 0) { setNewItemsIds(newIds); setTimeout(() => setNewItemsIds(new Set()), 1000); }
                    return safeQueue;
                });

                setData({ current: json.current || null, currentIsRequested: json.currentIsRequested === true, playerPausedAfterRequests: json.playerPausedAfterRequests === true, requestedSongArtwork: json.requestedSongArtwork === 'song_cover' ? 'song_cover' : 'bili_avatar', queue: safeQueue, status: json.status || '' });
                setAccepting(json.accepting ?? true);
                setPlaying(json.playing ?? true);
                setIsConnected(true);

                if (typeof json.cdpConnected === 'boolean') {
                    setIsCdpConnected(json.cdpConnected);
                }

            } catch { setIsConnected(false); }
        };
        fetchData();
        const timer = setInterval(fetchData, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleQueueAction = async (action: string, payload: any) => {
        // ⭐ 防抖保护
        if (!isElectron || actionLock) return;
        triggerActionLock();
        try {
            await fetch('http://localhost:5555/api/queue/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...payload })
            });
        } catch(err) { console.error("操作失败", err); }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, type: 'current' | 'queue', index: number, item: SongInfo) => {
        // ⭐ 防抖保护
        if (!isElectron || actionLock) return;
        e.preventDefault(); e.stopPropagation();
        setDragInfo({ type, index, item, x: e.clientX, y: e.clientY, actionType: 'none' });

        const appZoneRect = document.querySelector('.glass-panel-base')?.getBoundingClientRect();
        const queueZoneRect = document.querySelector('.queue-zone')?.getBoundingClientRect();

        let currentActionType: 'none' | 'delete' | 'play' | 'push' = 'none';

        const onPointerMove = (ev: PointerEvent) => {
            if ((window as any)._dragTimer) return;
            (window as any)._dragTimer = requestAnimationFrame(() => {
                let renderX = ev.clientX;
                let renderY = ev.clientY;
                if (isElectron) {
                    renderX = Math.max(140, Math.min(renderX, window.innerWidth - 140));
                    renderY = Math.max(35, Math.min(renderY, window.innerHeight - 35));
                }

                const ghostEl = document.getElementById('drag-ghost');
                if (ghostEl) {
                    ghostEl.style.transform = `translate3d(${renderX}px, ${renderY}px, 0) translate(-50%, -50%)`;
                }

                let newActionType: 'none' | 'delete' | 'play' | 'push' = 'none';

                if (appZoneRect) {
                    const isOutside = ev.clientX < appZoneRect.left || ev.clientX > appZoneRect.right ||
                        ev.clientY < appZoneRect.top || ev.clientY > appZoneRect.bottom;

                    if (isOutside) {
                        newActionType = 'delete';
                    } else if (queueZoneRect) {
                        const dividingY = queueZoneRect.top - 5;

                        if (type === 'queue' && ev.clientY < dividingY) {
                            newActionType = 'play';
                        } else if (type === 'current' && ev.clientY >= dividingY) {
                            newActionType = 'push';
                        }
                    }
                }

                if (newActionType !== currentActionType) {
                    currentActionType = newActionType;
                    setDragInfo(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY, actionType: newActionType } : null);
                }

                (window as any)._dragTimer = null;
            });
        };

        const onPointerUp = (ev: PointerEvent) => {
            if ((window as any)._dragTimer) {
                cancelAnimationFrame((window as any)._dragTimer);
                (window as any)._dragTimer = null;
            }
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            setDragInfo(null);

            // ⭐ 拖拽释放后，同样启动 500ms 冷却锁定
            triggerActionLock();

            if (currentActionType === 'delete') {
                if (type === 'queue') handleQueueAction('delete', { index });
                if (type === 'current') handleQueueAction('skip_current', {});
            } else if (currentActionType === 'play') {
                if (type === 'queue') handleQueueAction('play_now', { index });
            } else if (currentActionType === 'push') {
                if (type === 'current') handleQueueAction('push_current_to_queue', {});
            } else {
                if (type === 'queue') {
                    const items = Array.from(document.querySelectorAll('.queue-item'));
                    let targetIndex = items.length - 1;
                    for (let i = 0; i < items.length; i++) {
                        const rect = items[i].getBoundingClientRect();
                        if (ev.clientY < rect.top + rect.height / 2) { targetIndex = i; break; }
                    }
                    targetIndex = Math.max(0, targetIndex);
                    if (targetIndex !== index) handleQueueAction('reorder', { from: index, to: targetIndex });
                }
            }
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const toggleAccepting = async (e?: React.MouseEvent) => {
        if (!isElectron || actionLock) return;
        e?.stopPropagation?.();
        triggerActionLock();
        try {
            await fetch('http://localhost:5555/api/state/toggle', { method: 'POST' });
            setAccepting(!accepting);
        } catch(err) { console.error(err); }
    };

    const togglePlaying = async (e?: React.MouseEvent) => {
        if (!isElectron || actionLock) return;
        e?.stopPropagation?.();
        triggerActionLock();
        try {
            await fetch('http://localhost:5555/api/state/toggle_play', { method: 'POST' });
            setPlaying(!playing);
        } catch(err) { console.error(err); }
    };

    const handleWindowClose = () => {
        if (isElectron) electronAPI?.closeWindow();
        else { fetch('http://localhost:5555/api/exit', { method: 'POST' }); window.close(); }
    };

    const handleWindowMinimize = () => {
        if (isElectron) electronAPI?.minimizeWindow();
    };

    const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isElectron) return;
        const targetElement = e.target as HTMLElement;
        if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'button' || targetElement.closest('.no-drag')) return;
        const target = (e.currentTarget as HTMLElement).closest('.react-widget-root') as HTMLElement;
        if (!target) return;

        const startX = e.clientX, startY = e.clientY, initialX = widgetStyle.x, initialY = widgetStyle.y;

        const onMouseMove = (ev: MouseEvent) => {
            target.style.left = `${initialX + (ev.clientX - startX)}px`;
            target.style.top = `${initialY + (ev.clientY - startY)}px`;
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const newPos = { x: target.offsetLeft, y: target.offsetTop };
            setWidgetStyle(prev => ({ ...prev, x: newPos.x, y: newPos.y }));
            localStorage.setItem('bili-widget-pos', JSON.stringify(newPos));
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isElectron) return;
        e.stopPropagation(); e.preventDefault();
        const targetHandle = e.currentTarget;
        const target = targetHandle.closest('.react-widget-root') as HTMLElement;
        if (!target) return;

        targetHandle.setPointerCapture(e.pointerId);

        const startX = e.clientX, startY = e.clientY, initialW = widgetStyle.w, initialH = widgetStyle.h;
        let animationFrameId: number;

        const onPointerMove = (ev: PointerEvent) => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                target.style.width = `${Math.max(240, initialW + (ev.clientX - startX))}px`;
                target.style.height = `${Math.max(300, initialH + (ev.clientY - startY))}px`;
            });
        };
        const onPointerUp = (ev: PointerEvent) => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            targetHandle.releasePointerCapture(ev.pointerId);
            targetHandle.removeEventListener('pointermove', onPointerMove as any);
            targetHandle.removeEventListener('pointerup', onPointerUp as any);

            const newSize = { w: target.offsetWidth, h: target.offsetHeight };
            setWidgetStyle(prev => ({ ...prev, w: newSize.w, h: newSize.h }));
            localStorage.setItem('bili-widget-size', JSON.stringify(newSize));
        };
        targetHandle.addEventListener('pointermove', onPointerMove as any);
        targetHandle.addEventListener('pointerup', onPointerUp as any);
    };

    const handleElectronResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isElectron) return;
        e.stopPropagation(); e.preventDefault();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);

        const startX = e.screenX; const startY = e.screenY;
        const initialW = window.outerWidth; const initialH = window.outerHeight;
        let lastW = initialW; let lastH = initialH;
        let animationFrameId: number;

        const onPointerMove = (ev: PointerEvent) => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                lastW = Math.max(300, initialW + (ev.screenX - startX));
                lastH = Math.max(400, initialH + (ev.screenY - startY));
                electronAPI?.resizeOverlay(lastW, lastH);
            });
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            target.releasePointerCapture(ev.pointerId);
            target.removeEventListener('pointermove', onPointerMove as any);
            target.removeEventListener('pointerup', onPointerUp as any);
        };

        target.addEventListener('pointermove', onPointerMove as any);
        target.addEventListener('pointerup', onPointerUp as any);
    };

    let dragRenderX = 0, dragRenderY = 0;
    if (dragInfo) {
        dragRenderX = dragInfo.x;
        dragRenderY = dragInfo.y;
        if (isElectron) {
            dragRenderX = Math.max(140, Math.min(dragInfo.x, window.innerWidth - 140));
            dragRenderY = Math.max(35, Math.min(dragInfo.y, window.innerHeight - 35));
        }
    }

    const getStatusColor = (status: string | undefined) => {
        if (!status) return theme.subTextColor;
        if (status.includes('❌') || status.includes('🔴')) return '#f87171';
        if (status.includes('✅') || status.includes('🟢')) return '#4ade80';
        if (status.includes('⚠️') || status.includes('拦截')) return '#facc15';
        if (status.includes('⬆️') || status.includes('⏭️') || status.includes('🔙') || status.includes('🔄') || status.includes('▶️') || status.includes('⚡')) return '#c084fc';
        if (status.includes('test') || status.includes('测试')) return '#22d3ee';
        return theme.subTextColor;
    };

    const getStatusAnimation = (status: string | undefined) => {
        if (!status) return '';
        if (status.includes('test') || status.includes('测试') || status.includes('⚠️') || status.includes('❌') || status.includes('⚡') || status.includes('▶️')) return 'animate-pulse';
        return '';
    };

    return (
        <div className={isElectron
            ? "w-full h-screen p-5 flex flex-col font-sans select-none group box-border overflow-hidden bg-transparent pointer-events-none no-drag"
            : "react-widget-root absolute p-4 flex flex-col font-sans select-none z-[50] group cursor-grab active:cursor-grabbing"
        }>
            <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-max">
                {toasts.map(t => (
                    <div key={t.id} className="animate-toast bg-gradient-to-r from-blue-600 to-cyan-500 border border-cyan-400/50 text-white px-5 py-2.5 rounded-full shadow-[0_10px_30px_rgba(6,182,212,0.4)] text-sm font-bold flex items-center gap-2.5">
                        <span className="text-xl">🔔</span> {t.msg}
                    </div>
                ))}
            </div>

            {dragInfo && (
                <div
                    id="drag-ghost"
                    className="no-drag fixed z-[999999] rounded-xl p-2.5 flex items-center gap-3 opacity-95 scale-105 pointer-events-none transition-colors duration-200 overflow-hidden"
                    style={{
                        left: 0, top: 0,
                        transform: `translate3d(${dragRenderX}px, ${dragRenderY}px, 0) translate(-50%, -50%)`,
                        willChange: 'transform',
                        width: '260px',
                        background: dragInfo.actionType === 'delete' ? 'rgba(239, 68, 68, 0.95)' :
                            dragInfo.actionType === 'play' ? 'rgba(34, 197, 94, 0.95)' :
                                dragInfo.actionType === 'push' ? 'rgba(59, 130, 246, 0.95)' : 'rgba(20,20,20,0.7)',
                        border: dragInfo.actionType === 'delete' ? '2px solid #ef4444' :
                            dragInfo.actionType === 'play' ? '2px solid #22c55e' :
                                dragInfo.actionType === 'push' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: dragInfo.actionType === 'delete' ? '0 10px 30px rgba(239,68,68,0.6)' :
                            dragInfo.actionType === 'play' ? '0 10px 30px rgba(34,197,94,0.6)' :
                                dragInfo.actionType === 'push' ? '0 10px 30px rgba(59,130,246,0.6)' : '0 20px 50px rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(16px)'
                    }}
                >
                    {dragInfo.actionType === 'delete' ? (
                        <div className="w-full py-1 text-center font-bold text-white text-[15px] tracking-widest flex items-center justify-center gap-2">
                            <span className="text-xl animate-bounce">🗑️</span> 松开以删除该歌曲
                        </div>
                    ) : dragInfo.actionType === 'play' ? (
                        <div className="w-full py-1 text-center font-bold text-white text-[15px] tracking-widest flex items-center justify-center gap-2">
                            <span className="text-xl animate-pulse">▶️</span> 松开以立即播放
                        </div>
                    ) : dragInfo.actionType === 'push' ? (
                        <div className="w-full py-1 text-center font-bold text-white text-[15px] tracking-widest flex items-center justify-center gap-2">
                            <span className="text-xl animate-pulse">🔙</span> 松开以退回队列
                        </div>
                    ) : (
                        <>
                            <div className={`w-8 h-8 ${data.requestedSongArtwork === 'song_cover' ? 'rounded-md' : 'rounded-full'} overflow-hidden shrink-0 border border-white/20 bg-slate-800 flex items-center justify-center`}>
                                <SongArtworkImage song={dragInfo.item} source={data.requestedSongArtwork === 'song_cover' ? 'cover' : 'avatar'} />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="text-[13px] font-bold truncate text-white">{dragInfo.item.SongName}</div>
                                <div className="text-[11px] truncate text-gray-400">{dragInfo.item.ArtistName}</div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div
                onMouseDown={!isElectron ? handleDragStart : undefined}
                className={`glass-panel-base w-full ${isElectron ? 'flex-1 rounded-[20px] pointer-events-auto' : 'h-full rounded-[20px]'} flex flex-col overflow-hidden relative`}
                style={{
                    backgroundColor: hexToRgba(theme.bgColor, theme.bgOpacity),
                    ...(isElectron ? { WebkitAppRegion: 'drag' } : {})
                } as React.CSSProperties}
            >
                <div className="absolute -top-20 -left-20 w-48 h-48 bg-blue-500 rounded-full mix-blend-screen filter blur-[80px] opacity-20 pointer-events-none"></div>
                <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-purple-500 rounded-full mix-blend-screen filter blur-[80px] opacity-20 pointer-events-none"></div>

                {isElectron && (
                    <div
                        onPointerDown={handleElectronResizeStart}
                        className="no-drag absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-[60] rounded-br-[20px] opacity-80 hover:opacity-100 transition-opacity pointer-events-auto"
                        style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.4) 100%)' }}
                    />
                )}
                {!isElectron && (
                    <div
                        onPointerDown={handleResizeStart}
                        className="no-drag absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-[60] rounded-br-[20px] opacity-80 hover:opacity-100 transition-opacity pointer-events-auto"
                        style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.4) 100%)' }}
                    />
                )}

                {!theme.showTitleBar && isElectron && (
                    <div className="no-drag absolute top-3 right-3 flex gap-2 z-50 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button onMouseDown={e => e.stopPropagation()} onClick={onToggleAdmin} className="text-white/50 hover:text-white transition-colors cursor-pointer text-lg" title="控制面板">⚙️</button>
                        <button onMouseDown={e => e.stopPropagation()} onClick={() => setShowSettings(!showSettings)} className="text-white/50 hover:text-white transition-colors cursor-pointer text-lg" title="外观设置">🎨</button>

                        <button onMouseDown={e => e.stopPropagation()} onClick={handleWindowMinimize} className="flex items-center justify-center w-6 h-6 rounded-full transition-colors text-white/50 hover:text-white hover:bg-white/20 text-md font-bold" title="最小化">—</button>
                        <button onMouseDown={e => e.stopPropagation()} onClick={handleWindowClose} className="flex items-center justify-center w-6 h-6 rounded-full transition-colors text-white/50 hover:text-red-400 hover:bg-red-500/20 text-md" title="关闭点歌机">✖</button>
                    </div>
                )}

                {theme.showTitleBar && (
                    <div className={`px-5 py-3 flex justify-between items-center z-10 transition-colors ${theme.syncTitleBarWithBg ? '' : 'border-b border-white/10'}`} style={{ backgroundColor: theme.syncTitleBarWithBg ? 'transparent' : hexToRgba(theme.titleBarBgColor || '#000000', theme.titleBarOpacity !== undefined ? theme.titleBarOpacity : 0.2) }}>
                        <div className="flex items-center gap-2.5 shrink-0 pr-2">
                            <button
                                onMouseDown={e => { if(isElectron) e.stopPropagation(); }}
                                onClick={togglePlaying}
                                disabled={actionLock}
                                className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isElectron ? 'pointer-events-auto cursor-pointer no-drag' : 'pointer-events-none'} ${playing ? (isElectron ? 'bg-green-500/20 text-green-400 hover:bg-green-500/40' : 'bg-green-500/20 text-green-400') : (isElectron ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-red-500/20 text-red-400')} ${actionLock ? 'opacity-50 pointer-events-none' : ''}`}
                                title={isElectron ? (playing ? '点击暂停自动播放' : '点击开启自动播放') : undefined}
                            >
                                <span className="text-[10px] leading-none">{playing ? '🟢' : '🔴'}</span>
                            </button>
                            <h1 className="font-bold text-[15px] tracking-wide pointer-events-none whitespace-nowrap shrink-0" style={{ color: theme.titleColor }}>易点椿曲</h1>
                        </div>

                        <div className="flex items-center relative h-6 flex-1 justify-end min-w-0">
                            <div
                                className={`absolute right-0 text-xs font-medium max-w-[150px] truncate pointer-events-none transition-all duration-150 ${isElectron && titleBarActionsOpen ? '-translate-x-[118px] opacity-50' : ''} ${getStatusAnimation(data.status)}`}
                                style={{ color: !isConnected ? theme.subTextColor : getStatusColor(data.status) }}
                            >
                                {!isConnected ? '等待后端...' : (data.status || '点歌就绪')}
                            </div>

                            {isElectron && (
                                <div
                                    onMouseEnter={() => setTitleBarActionsOpen(true)}
                                    onMouseLeave={() => setTitleBarActionsOpen(false)}
                                    className={`no-drag absolute right-0 top-1/2 -translate-y-1/2 h-8 overflow-hidden z-20 transition-[width] duration-150 ease-out ${titleBarActionsOpen ? 'w-[116px]' : 'w-8'}`}
                                >
                                    <div className={`ml-auto flex h-full w-[112px] items-center justify-end gap-2 transition-all duration-150 ${titleBarActionsOpen ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0 pointer-events-none'}`}>
                                        <button onMouseDown={e => e.stopPropagation()} onClick={onToggleAdmin} className="no-drag text-white/60 hover:text-white transition-colors cursor-pointer text-sm" title="控制面板">⚙️</button>
                                        <button onMouseDown={e => e.stopPropagation()} onClick={() => setShowSettings(!showSettings)} className="no-drag text-white/60 hover:text-white transition-colors cursor-pointer text-sm" title="外观设置">🎨</button>
                                        <button onMouseDown={e => e.stopPropagation()} onClick={handleWindowMinimize} className="no-drag flex items-center justify-center w-5 h-5 rounded-full transition-colors text-white/60 hover:text-white hover:bg-white/20 text-xs font-bold" title="最小化">−</button>
                                        <button onMouseDown={e => e.stopPropagation()} onClick={handleWindowClose} className="no-drag flex items-center justify-center w-5 h-5 rounded-full transition-colors text-white/60 hover:text-red-400 hover:bg-red-500/20 text-xs" title="关闭本窗口">✖</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col p-4 overflow-hidden z-10 gap-4 custom-scrollbar relative">
                    {data.current ? (
                        <div
                            className={`${isElectron && data.currentIsRequested ? 'no-drag cursor-move' : ''} current-zone glass-card rounded-xl p-4 flex items-center gap-4 relative overflow-hidden shrink-0 transition-all duration-300 ${data.currentIsRequested ? 'ring-1 ring-green-400/30 shadow-[0_0_24px_rgba(74,222,128,0.18)]' : 'opacity-75 border-sky-300/20 bg-sky-950/20 shadow-[0_0_22px_rgba(125,211,252,0.12)]'} ${dragInfo?.type === 'current' ? 'opacity-30' : ''} ${actionLock ? 'pointer-events-none' : ''}`}
                            style={{ touchAction: 'none' }}
                            onPointerDown={isElectron && data.currentIsRequested && !actionLock ? (e) => handlePointerDown(e, 'current', -1, data.current as SongInfo) : undefined}
                        >
                            <div className={`absolute inset-0 pointer-events-none ${data.currentIsRequested ? 'bg-gradient-to-r from-green-500/10 via-transparent to-cyan-500/5' : 'bg-gradient-to-r from-sky-400/10 via-sky-950/5 to-transparent'}`}></div>
                            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-7xl select-none pointer-events-none">{data.currentIsRequested ? '✨' : '🎵'}</div>
                            {data.currentIsRequested ? (
                                <div className={`w-12 h-12 ${data.requestedSongArtwork === 'song_cover' ? 'rounded-lg' : 'rounded-full'} overflow-hidden border-[3px] ${playing ? (data.requestedSongArtwork === 'song_cover' ? 'border-green-400/60 shadow-[0_0_15px_rgba(74,222,128,0.25)]' : getGuardStyle(data.current.GuardLevel).border || 'border-green-400/60 shadow-[0_0_15px_rgba(74,222,128,0.2)]') : 'border-yellow-400/60 shadow-[0_0_15px_rgba(250,204,21,0.2)]'} bg-slate-800 flex items-center justify-center shrink-0 relative pointer-events-none`}>
                                    <SongArtworkImage song={data.current} source={data.requestedSongArtwork === 'song_cover' ? 'cover' : 'avatar'} className={!playing ? 'grayscale opacity-80' : ''} />
                                </div>
                            ) : (
                                <div className="w-12 h-12 rounded-lg overflow-hidden border-[3px] border-sky-300/35 bg-sky-950/60 shadow-[0_0_14px_rgba(125,211,252,0.16)] flex items-center justify-center text-sky-200 shrink-0 relative pointer-events-none">
                                    <SongArtworkImage song={data.current} source="cover" />
                                </div>
                            )}
                            <div className="flex flex-col min-w-0 pointer-events-none">
                                {!playing ? (
                                    <div className="text-yellow-400 text-[10px] font-bold mb-1 tracking-wider flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span> 自动播放已暂停</div>
                                ) : data.currentIsRequested ? (
                                    <div className="text-green-400 text-[10px] font-bold mb-1 tracking-wider flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.9)]"></span> 点歌播放中</div>
                                ) : data.playerPausedAfterRequests ? (
                                    <div className="text-amber-400/80 text-[10px] font-bold mb-1 tracking-wider flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-amber-400/80 rounded-full"></span> 点歌播完 · 播放器已暂停</div>
                                ) : (
                                    <div className="text-sky-300 text-[10px] font-bold mb-1 tracking-wider flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-pulse shadow-[0_0_8px_rgba(125,211,252,0.9)]"></span> 主播歌单正在播放</div>
                                )}
                                <div className="text-[15px] font-bold truncate drop-shadow-md" style={{ color: theme.textColor }}>{data.current.SongName}</div>
                                <div className="text-xs truncate mt-0.5" style={{ color: theme.subTextColor }}>{data.current.ArtistName}</div>
                                {data.currentIsRequested && (
                                    <div className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: theme.subTextColor }}>
                                        <>
                                            <span className="truncate">由 <span style={{ color: theme.titleColor, opacity: 0.9 }}>{data.current.OrderedBy}</span> 点播</span>
                                            {getGuardStyle(data.current.GuardLevel).label && <span className={`text-[9px] px-1 rounded-sm font-bold tracking-wider leading-none py-0.5 shadow-sm ${getGuardStyle(data.current.GuardLevel).tag}`}>{getGuardStyle(data.current.GuardLevel).label}</span>}
                                        </>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="current-zone glass-card rounded-xl p-4 flex flex-col items-center justify-center border-dashed border-white/20 shrink-0 min-h-[110px] relative overflow-hidden">
                            {!playing ? (
                                <>
                                    <div className="absolute inset-0 bg-yellow-500/10 animate-[pulse_3s_infinite] pointer-events-none"></div>
                                    <div className="text-4xl mb-2 opacity-90 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)] pointer-events-none z-10 animate-bounce">⏸️</div>
                                    <div className="text-sm font-bold tracking-wide pointer-events-none z-10 text-yellow-400 drop-shadow-md">自动播放已暂停</div>
                                    <div className="text-[10px] mt-1 font-medium pointer-events-none z-10 opacity-70" style={{ color: theme.subTextColor }}>队列歌曲将被保留并跳过</div>
                                </>
                            ) : !isCdpConnected ? (
                                <>
                                    <div className="absolute inset-0 bg-red-500/10 animate-[pulse_3s_infinite] pointer-events-none"></div>
                                    <div className="text-3xl mb-2 opacity-90 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)] pointer-events-none z-10 animate-bounce">🔌</div>
                                    <div className="text-sm font-bold tracking-wide pointer-events-none z-10 text-red-400 drop-shadow-md">播放器未连接</div>
                                    <div className="text-[10px] mt-1 font-medium pointer-events-none z-10 opacity-70" style={{ color: theme.subTextColor }}>请在控制面板检查注入状态</div>
                                </>
                            ) : (
                                <>
                                    <div className="text-3xl mb-2 opacity-60 drop-shadow-lg pointer-events-none">🎧</div>
                                    <div className="text-sm font-medium tracking-wide pointer-events-none" style={{ color: theme.subTextColor }}>当前没有播放任务</div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="queue-zone flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2.5 pb-4">
                        <div className="flex items-center gap-2 mb-0.5 px-1 shrink-0">
                            <button
                                onMouseDown={e => { if(isElectron) e.stopPropagation(); }}
                                onClick={toggleAccepting}
                                disabled={actionLock}
                                className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isElectron ? 'no-drag pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${accepting ? (isElectron ? 'bg-green-500/20 text-green-400 hover:bg-green-500/40' : 'bg-green-500/20 text-green-400') : (isElectron ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-red-500/20 text-red-400')} ${actionLock ? 'opacity-50 pointer-events-none' : ''}`}
                                title={isElectron ? (accepting ? '点击暂停接单' : '点击开启接单') : undefined}
                            >
                                <span className="text-[10px] leading-none">{accepting ? '🟢' : '🔴'}</span>
                            </button>
                            <div className="text-[10px] font-bold uppercase tracking-widest pointer-events-none" style={{ color: theme.subTextColor }}>
                                待播队列 ({data.queue?.length || 0})
                            </div>
                        </div>

                        {!accepting && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center justify-center gap-2 animate-fade-in mb-1 relative overflow-hidden shrink-0 mx-1">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                                <span className="text-lg relative z-10 animate-pulse">⏸️</span>
                                <span className="text-xs font-bold text-red-400 tracking-wide relative z-10">已暂停接收新点歌</span>
                            </div>
                        )}

                        {successes.map((notice) => (
                            <div key={notice.id} className="animate-slide-in glass-card rounded-lg p-2 flex items-center gap-3 border border-emerald-400/30 bg-emerald-500/10 mb-1 relative overflow-hidden shrink-0">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-emerald-400/50 shadow-[0_0_8px_rgba(52,211,153,0.35)]">
                                    <img src={notice.user.avatar} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col min-w-0 z-10">
                                    <div className="text-[12px] font-bold text-emerald-300 truncate drop-shadow-md flex items-center gap-1.5"><span>✅</span> <span>{notice.title || `${notice.user.name || notice.user.uname || '观众'} 点歌成功`}</span></div>
                                    <div className="text-[10px] text-white/85 truncate mt-0.5">{notice.detail || '已成功处理点歌请求'}</div>
                                </div>
                            </div>
                        ))}

                        {rejects.map((rej) => (
                            <div key={rej.id} className="animate-slide-in glass-card rounded-lg p-2 flex items-center gap-3 border border-red-500/30 bg-red-500/10 mb-1 relative overflow-hidden shrink-0">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.3)]">
                                    <img src={rej.user.avatar} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col min-w-0 z-10">
                                    <div className="text-[12px] font-bold text-red-400 truncate drop-shadow-md flex items-center gap-1.5"><span>⚠️</span> <span>{rej.user.name} 点歌失败</span></div>
                                    <div className="text-[10px] text-white/80 truncate mt-0.5">{rej.reason}</div>
                                </div>
                            </div>
                        ))}

                        {(!data.queue || data.queue.length === 0) && (
                            <div className="flex-1 flex flex-col items-center justify-center text-xs italic pointer-events-none" style={{ color: theme.subTextColor }}>
                                <span className="mb-2 text-xl opacity-60">👻</span>
                                发送「点歌 歌名」来点歌吧
                            </div>
                        )}

                        {data.queue?.map((song, index) => {
                            const uniqueKey = `${song.Id}-${song.OrderedByUid}-${index}`;
                            const isNew = newItemsIds.has(`${song.Id}-${song.OrderedByUid}`);
                            const itemGuardStyle = getGuardStyle(song.GuardLevel);

                            return (
                                <div
                                    key={uniqueKey}
                                    style={{ touchAction: 'none' }}
                                    onPointerDown={isElectron && !actionLock ? (e) => handlePointerDown(e, 'queue', index, song) : undefined}
                                    className={`${isElectron ? 'no-drag cursor-move' : ''} queue-item glass-card rounded-lg flex items-center gap-3 transition-all hover:bg-white/10 relative group/item ${isNew ? 'animate-slide-in' : ''} ${dragInfo?.type === 'queue' && dragInfo.index === index ? 'opacity-30' : ''} ${theme.compactQueue ? 'p-1.5' : 'p-2.5'} ${actionLock ? 'pointer-events-none' : ''}`}
                                >
                                    {theme.compactQueue ? (
                                        <div className="flex items-center w-full min-w-0 pointer-events-none pr-14">
                                            <div className="text-[10px] font-bold w-4 text-center shrink-0 mr-1" style={{ color: theme.subTextColor }}>{index + 1}</div>
                                            <div className="text-[12px] font-bold truncate text-white max-w-[55%] shrink-0 pr-1">{song.SongName}</div>
                                            <div className="text-[10px] truncate flex items-center gap-1 opacity-80 min-w-0" style={{ color: theme.subTextColor }}>
                                                <span className="truncate">- {song.OrderedBy}</span>
                                                {itemGuardStyle.label && <span className={`text-[8px] px-1 rounded-sm font-bold tracking-wider leading-none shrink-0 ${itemGuardStyle.tag}`}>{itemGuardStyle.label}</span>}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-[11px] font-bold w-4 text-center shrink-0 pointer-events-none" style={{ color: theme.subTextColor }}>{index + 1}</div>
                                            <div className={`w-8 h-8 ${data.requestedSongArtwork === 'song_cover' ? 'rounded-md' : 'rounded-full'} overflow-hidden shrink-0 bg-black/30 border-2 ${data.requestedSongArtwork === 'song_cover' ? 'border-green-400/30' : (itemGuardStyle.label ? itemGuardStyle.border : 'border-white/10')} flex items-center justify-center pointer-events-none`}>
                                                <SongArtworkImage song={song} source={data.requestedSongArtwork === 'song_cover' ? 'cover' : 'avatar'} />
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1 pointer-events-none">
                                                <div className="text-[13px] font-bold truncate drop-shadow-sm pr-16" style={{ color: theme.textColor }}>{song.SongName}</div>
                                                <div className="text-[11px] truncate flex items-center gap-1.5 mt-0.5" style={{ color: theme.subTextColor }}>
                                                    <span>{song.ArtistName}</span>
                                                    <span className="w-0.5 h-0.5 bg-white/30 rounded-full"></span>
                                                    <span className="truncate flex items-center gap-1" style={{ color: theme.titleColor, opacity: 0.8 }}>
                                                        {song.OrderedBy}
                                                        {itemGuardStyle.label && <span className={`text-[8px] px-1 py-0.5 rounded-[2px] font-bold tracking-wider leading-none shadow-sm ${itemGuardStyle.tag}`}>{itemGuardStyle.label}</span>}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {isElectron && (
                                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity bg-black/60 p-1 rounded-md backdrop-blur-md border border-white/10 z-20">
                                            <button onPointerDown={e => { e.stopPropagation(); handleQueueAction('top', { index }); }} className="p-1 hover:bg-white/20 rounded text-xs transition-colors" title="置顶/优先播放">⬆️</button>
                                            <button onPointerDown={e => { e.stopPropagation(); handleQueueAction('play_now', { index }); }} className="p-1 hover:bg-white/20 rounded text-xs transition-colors" title="无视顺序，强行立即切歌播放">▶️</button>
                                            <button onPointerDown={e => { e.stopPropagation(); handleQueueAction('delete', { index }); }} className="p-1 hover:bg-red-500/40 rounded text-xs transition-colors text-red-400" title="移出点歌队列">🗑️</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 界面设置抽屉 */}
                {isElectron && showSettings && (
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        className="no-drag absolute top-0 right-0 bottom-0 w-[220px] bg-black/85 backdrop-blur-xl z-[70] border-l border-white/10 p-4 flex flex-col gap-4 animate-slide-in-right shadow-2xl custom-scrollbar overflow-y-auto"
                        style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                    >
                        <div className="flex justify-between items-center border-b border-white/10 pb-2">
                            <h2 className="font-bold text-sm text-white">🎨 外观设置</h2>
                            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white text-lg leading-none cursor-pointer">×</button>
                        </div>

                        <div className="flex flex-col gap-3 pb-3 border-b border-white/10">
                            <div className="flex justify-between items-center">
                                <label className="text-[11px] text-white/70 font-medium">极简待播队列 (Mini模式)</label>
                                <button onClick={() => setTheme({...theme, compactQueue: !theme.compactQueue})} className={`w-7 h-4 rounded-full p-0.5 transition-colors ${theme.compactQueue ? 'bg-blue-500' : 'bg-white/20'}`}><div className={`w-3 h-3 rounded-full bg-white transition-transform ${theme.compactQueue ? 'translate-x-3' : 'translate-x-0'}`}></div></button>
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-[11px] text-white/70 font-medium">显示标题栏</label>
                                <button onClick={() => setTheme({...theme, showTitleBar: !theme.showTitleBar})} className={`w-7 h-4 rounded-full p-0.5 transition-colors ${theme.showTitleBar ? 'bg-blue-500' : 'bg-white/20'}`}><div className={`w-3 h-3 rounded-full bg-white transition-transform ${theme.showTitleBar ? 'translate-x-3' : 'translate-x-0'}`}></div></button>
                            </div>
                            {theme.showTitleBar && (
                                <>
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] text-white/70 font-medium">标题栏融入背景</label>
                                        <button onClick={() => setTheme({...theme, syncTitleBarWithBg: !theme.syncTitleBarWithBg})} className={`w-7 h-4 rounded-full p-0.5 transition-colors ${theme.syncTitleBarWithBg ? 'bg-blue-500' : 'bg-white/20'}`}><div className={`w-3 h-3 rounded-full bg-white transition-transform ${theme.syncTitleBarWithBg ? 'translate-x-3' : 'translate-x-0'}`}></div></button>
                                    </div>
                                    {!theme.syncTitleBarWithBg && (
                                        <div className="flex justify-between items-center">
                                            <label className="text-[11px] text-white/70 font-medium">背景色</label>
                                            <input type="color" value={theme.titleBarBgColor} onChange={e => setTheme({...theme, titleBarBgColor: e.target.value})} className="w-5 h-5 rounded cursor-pointer shrink-0" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5 pb-3 border-b border-white/10">
                            <div className="flex justify-between items-center"><label className="text-[11px] text-white/70 font-medium">标题/高亮字</label><input type="color" value={theme.titleColor} onChange={e => setTheme({...theme, titleColor: e.target.value})} className="w-5 h-5 rounded cursor-pointer shrink-0" /></div>
                            <div className="flex justify-between items-center"><label className="text-[11px] text-white/70 font-medium">主体文字</label><input type="color" value={theme.textColor} onChange={e => setTheme({...theme, textColor: e.target.value})} className="w-5 h-5 rounded cursor-pointer shrink-0" /></div>
                            <div className="flex justify-between items-center"><label className="text-[11px] text-white/70 font-medium">次要文字</label><input type="color" value={theme.subTextColor} onChange={e => setTheme({...theme, subTextColor: e.target.value})} className="w-5 h-5 rounded cursor-pointer shrink-0" /></div>
                        </div>

                        <div className="flex flex-col gap-2.5">
                            <div className="flex justify-between items-center"><label className="text-[11px] text-white/70 font-medium">全局背景色</label><input type="color" value={theme.bgColor} onChange={e => setTheme({...theme, bgColor: e.target.value})} className="w-5 h-5 rounded cursor-pointer shrink-0" /></div>
                            <div className="flex flex-col gap-1.5 mb-2">
                                <label className="text-[11px] text-white/70 font-medium flex justify-between"><span>不透明度</span><span className="text-white/90">{Math.round(theme.bgOpacity * 100)}%</span></label>
                                <input type="range" min="0" max="1" step="0.05" value={theme.bgOpacity} onChange={e => setTheme({...theme, bgOpacity: parseFloat(e.target.value)})} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" />
                            </div>
                        </div>

                        <div className="mt-auto flex flex-col gap-2">
                            <button className="py-2 w-full bg-white/10 hover:bg-white/20 rounded-lg text-white text-[11px] font-medium transition-colors" onClick={() => setTheme(defaultTheme)}>恢复默认外观</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// 4. 核心组件: 后台管理控制面板
// ==========================================

const AdminWidget: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<string>('settings');

    const [qrState, setQrState] = useState<QrState>({ loading: false, base64: '', message: '' });
    const [roomIdInput, setRoomIdInput] = useState<string>('');
    const [sysLogs, setSysLogs] = useState<SysLog[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // ⭐ 新增: 自动滚动日志锁定与日志容器引用
    const [autoScroll, setAutoScroll] = useState<boolean>(true);
    const logContainerRef = useRef<HTMLDivElement>(null);

    const [hasBiliLoopIssue, setHasBiliLoopIssue] = useState<boolean>(false);

    const [superUserInput, setSuperUserInput] = useState<string>('');
    const [requestWhitelistInput, setRequestWhitelistInput] = useState<string>('');
    const [debugInput, setDebugInput] = useState<string>('');

    const [adminToast, setAdminToast] = useState<string>('');
    const [connectorStatuses, setConnectorStatuses] = useState<
        Partial<Record<NativeConnectorId, ConnectorStatus>>
    >({});
    const [connectorChecking, setConnectorChecking] = useState(false);
    const [connectorUpdating, setConnectorUpdating] = useState<
        NativeConnectorId | null
    >(null);
    const [connectorStatusError, setConnectorStatusError] = useState('');
    const [overlayMods, setOverlayMods] = useState<OverlayModState | null>(null);
    const [overlayUrl, setOverlayUrl] = useState(
        'https://github.com/Enkianssus/HaruMusicBot-Overlay-Default'
    );
    const [overlayBusy, setOverlayBusy] = useState(false);
    const [overlayDropActive, setOverlayDropActive] = useState(false);
    const overlayFileInputRef = useRef<HTMLInputElement>(null);
    const overlaySettingsRef = useRef<HTMLElement>(null);

    const showAdminToast = useCallback((msg: string) => {
        setAdminToast(msg);
        setTimeout(() => setAdminToast(''), 3000);
    }, []);

    const loadOverlayMods = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:5555/api/overlays');
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '读取 Mod UI 列表失败');
            }
            setOverlayMods(result);
        } catch (error: unknown) {
            console.warn(
                error instanceof Error ? error.message : '读取 Mod UI 列表失败'
            );
        }
    }, []);

    const loadConnectorStatuses = useCallback(async (forceRefresh = false) => {
        setConnectorChecking(true);
        setConnectorStatusError('');
        try {
            const suffix = forceRefresh ? '?refresh=1' : '';
            const response = await fetch(
                `http://localhost:5555/api/connectors/status${suffix}`
            );
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '连接器更新服务不可用');
            }
            const nextStatuses: Partial<
                Record<NativeConnectorId, ConnectorStatus>
            > = {};
            for (const status of result.connectors || []) {
                nextStatuses[status.id as NativeConnectorId] = status;
            }
            setConnectorStatuses(nextStatuses);
            if (forceRefresh) {
                const statuses = (result.connectors || []) as ConnectorStatus[];
                const count = statuses.filter(
                    (status: ConnectorStatus) => status.updateAvailable
                ).length;
                const failureCount = statuses.filter(
                    status => status.error || !status.compatible
                ).length;
                showAdminToast(
                    failureCount > 0
                        ? `⚠️ ${failureCount} 个连接器无法完成版本检查或与本体不兼容`
                        : count > 0
                        ? `发现 ${count} 个可安装或可更新的连接器`
                        : '✅ 四个播放器连接器均为最新'
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : '检查连接器更新失败';
            setConnectorStatusError(message);
            if (forceRefresh) {
                showAdminToast(`❌ ${message}`);
            }
        } finally {
            setConnectorChecking(false);
        }
    }, [showAdminToast]);

    const activeTabRef = useRef<string>(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'settings') return;
        void loadConnectorStatuses(false);
        const timer = setInterval(
            () => void loadConnectorStatuses(false),
            10_000
        );
        return () => clearInterval(timer);
    }, [activeTab, loadConnectorStatuses]);

    useEffect(() => {
        if (activeTab !== 'status') return;
        void loadOverlayMods();
        const timer = setInterval(() => void loadOverlayMods(), 5000);
        return () => clearInterval(timer);
    }, [activeTab, loadOverlayMods]);

    const installOverlayFromUrl = useCallback(async () => {
        const url = overlayUrl.trim();
        if (!url) {
            showAdminToast('❌ 请输入 GitHub 仓库或发布清单网址');
            return;
        }
        setOverlayBusy(true);
        try {
            const response = await fetch(
                'http://localhost:5555/api/overlays/install-url',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '安装 Mod UI 失败');
            }
            setOverlayMods(result);
            showAdminToast(`✅ 已安装并启用 ${result.active.name} ${result.active.version}`);
        } catch (error: unknown) {
            showAdminToast(
                `❌ ${error instanceof Error ? error.message : '安装 Mod UI 失败'}`
            );
        } finally {
            setOverlayBusy(false);
        }
    }, [overlayUrl, showAdminToast]);

    const installOverlayZip = useCallback(async (file: File) => {
        if (!/\.zip$/i.test(file.name)) {
            showAdminToast('❌ 请选择 .zip 格式的 Mod UI 包');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            showAdminToast('❌ Mod UI ZIP 不能超过 20 MiB');
            return;
        }
        setOverlayBusy(true);
        try {
            const response = await fetch(
                'http://localhost:5555/api/overlays/install-zip',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/zip',
                        'X-Awoo-File-Name': encodeURIComponent(file.name)
                    },
                    body: file
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '安装 ZIP 失败');
            }
            setOverlayMods(result);
            showAdminToast(`✅ 已安装并启用 ${result.active.name} ${result.active.version}`);
        } catch (error: unknown) {
            showAdminToast(
                `❌ ${error instanceof Error ? error.message : '安装 ZIP 失败'}`
            );
        } finally {
            setOverlayBusy(false);
            if (overlayFileInputRef.current) {
                overlayFileInputRef.current.value = '';
            }
        }
    }, [showAdminToast]);

    const activateOverlay = useCallback(async (id: string) => {
        setOverlayBusy(true);
        try {
            const response = await fetch(
                'http://localhost:5555/api/overlays/activate',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '切换 Mod UI 失败');
            }
            setOverlayMods(result);
            showAdminToast(`🎨 已切换到 ${result.active.name}`);
        } catch (error: unknown) {
            showAdminToast(
                `❌ ${error instanceof Error ? error.message : '切换 Mod UI 失败'}`
            );
        } finally {
            setOverlayBusy(false);
        }
    }, [showAdminToast]);

    const removeOverlay = useCallback(async (id: string) => {
        setOverlayBusy(true);
        try {
            const response = await fetch(
                'http://localhost:5555/api/overlays/remove',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '删除 Mod UI 失败');
            }
            setOverlayMods(result);
            showAdminToast('🗑️ 已删除 Mod UI；若它正在使用，已切回内置 UI');
        } catch (error: unknown) {
            showAdminToast(
                `❌ ${error instanceof Error ? error.message : '删除 Mod UI 失败'}`
            );
        } finally {
            setOverlayBusy(false);
        }
    }, [showAdminToast]);

    const enableOverlayApi = useCallback(async () => {
        if (!config?.config) return;
        const nextSysConfig = {
            ...config.config,
            ExternalHttpEnabled: true,
            ExternalWebSocketEnabled: true
        };
        try {
            const response = await fetch('http://localhost:5555/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sysConfig: nextSysConfig })
            });
            if (!response.ok) throw new Error('启动只读接口失败');
            setConfig((previous: any) => previous ? ({
                ...previous,
                config: nextSysConfig,
                externalApi: {
                    ...(previous.externalApi || {}),
                    running: true,
                    httpEnabled: true,
                    webSocketEnabled: true
                }
            }) : previous);
            showAdminToast('✅ Mod UI 只读接口已启动');
        } catch (error: unknown) {
            showAdminToast(
                `❌ ${error instanceof Error ? error.message : '启动只读接口失败'}`
            );
        }
    }, [config, showAdminToast]);

    const isInitialConfigLoad = useRef(true);
    const lastConfigString = useRef('');
    const rangeControlEditingRef = useRef(false);

    const persistSysConfigNow = useCallback((nextSysConfig: any) => {
        lastConfigString.current = JSON.stringify(nextSysConfig);
        setConfig((previous: any) => previous ? ({
            ...previous,
            config: nextSysConfig
        }) : previous);

        fetch('http://localhost:5555/api/config', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sysConfig: nextSysConfig })
        }).then(async res => {
            if (!res.ok) throw new Error('保存配置失败');
            const json = await res.json().catch(() => null);
            if (json?.config) {
                lastConfigString.current = JSON.stringify(json.config);
                setConfig((previous: any) => previous ? ({
                    ...previous,
                    ...json,
                    config: json.config
                }) : previous);
            }
            showAdminToast("✅ 基础设置已保存！");
        }).catch(() => {
            showAdminToast("❌ 基础设置保存失败，请检查后端是否运行。");
        });
    }, [showAdminToast]);

    const handleRangeEditingChange = useCallback((editing: boolean) => {
        rangeControlEditingRef.current = editing;
    }, []);

    const updateBoundedConfigValue = useCallback((key: string, value: number) => {
        setConfig((previous: any) => previous ? ({
            ...previous,
            config: {
                ...previous.config,
                [key]: value
            }
        }) : previous);
    }, []);

    const commitBoundedConfigValue = useCallback((key: string, value: number) => {
        if (!config?.config) return;
        persistSysConfigNow({
            ...config.config,
            [key]: value
        });
    }, [config, persistSysConfigNow]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('http://localhost:5555/api/config');
                const json = await res.json();

                setConfig((prev: any) => {
                    if (!prev) return json;
                    return {
                        ...json,
                        config: activeTabRef.current === 'settings' ? prev.config : json.config
                    };
                });

                setRoomIdInput(prev => {
                    if (prev === '' && json.roomId !== 0 && json.roomId !== json.uid) return json.roomId.toString();
                    return prev;
                });

            } catch { }
        };
        fetchConfig();
        const timer = setInterval(fetchConfig, 2000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!config || !config.config) return;
        if (rangeControlEditingRef.current) return;

        const currentStr = JSON.stringify(config.config);

        if (isInitialConfigLoad.current) {
            isInitialConfigLoad.current = false;
            lastConfigString.current = currentStr;
            return;
        }

        if (currentStr === lastConfigString.current) return;

        const timer = setTimeout(() => {
            lastConfigString.current = currentStr;
            fetch('http://localhost:5555/api/config', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ sysConfig: config.config })
            }).then(res => {
                if (res.ok) showAdminToast("✅ 基础设置已自动保存！");
            }).catch(() => {});
        }, 800);

        return () => clearTimeout(timer);
    }, [config, showAdminToast]);

    useEffect(() => {
        if (activeTab !== 'login') return;
        const fetchQr = async () => {
            try {
                const res = await fetch('http://localhost:5555/api/bili/qrstatus');
                const json = await res.json();
                setQrState({ loading: false, base64: json.qrBase64, message: json.status });
                if (json.isLogin) {
                    setConfig((prev: any) => prev ? ({
                        ...prev,
                        biliLogin: true,
                        uid: json.uid,
                        currentUser: json.currentUser
                    }) : prev);
                }
            } catch {}
        };
        fetchQr();
        const timer = setInterval(fetchQr, 2000);
        return () => clearInterval(timer);
    }, [activeTab]);

    // ⭐ 改动：不管处于哪个 Tab 都会在后台静默轮询日志进行环境检测（如果是 logs tab 轮询频率调至 1秒，其他 tab 为 2.5秒）
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('http://localhost:5555/api/logs');
                const json = await res.json();
                setSysLogs(json);
            } catch {}
        };
        fetchLogs();
        const intervalTime = activeTab === 'logs' ? 1000 : 2500;
        const timer = setInterval(fetchLogs, intervalTime);
        return () => clearInterval(timer);
    }, [activeTab]);

    // 实时分析 B站弹幕连接是否出现频繁重连。
    useEffect(() => {
        if (sysLogs.length === 0) return;

        const connectEvents = sysLogs.filter(log =>
            log.Message.includes('直播间已连接') ||
            log.Message.includes('弹幕监控启动')
        );
        // 如果日志中多次出现该日志，且相互间隔排布，说明正在遭遇频繁断线重连问题
        setHasBiliLoopIssue(connectEvents.length >= 2);

    }, [sysLogs]);

    // ⭐ 新增: 处理日志自适应滚动和手动阅读判定
    const handleLogScroll = () => {
        const el = logContainerRef.current;
        if (!el) return;

        // 判定用户是否已经滚动到最下方 (误差距离 45px)
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 45;

        if (isAtBottom && !autoScroll) {
            setAutoScroll(true); // 恢复自动滚动
        } else if (!isAtBottom && autoScroll) {
            setAutoScroll(false); // 锁定滚动，支持用户自由阅读
        }
    };

    // ⭐ 改动: 仅当 autoScroll 为开启状态时执行平滑置底滚动
    useEffect(() => {
        if (activeTab === 'logs' && autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [sysLogs, activeTab, autoScroll]);

    const handleConnectRoom = async () => {
        const rid = parseInt(roomIdInput);
        if (!rid) return showAdminToast("❌ 请输入正确的房间号");
        try {
            const res = await fetch('http://localhost:5555/api/room', {
                method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ roomId: rid })
            });
            const json = await res.json();
            if(json.success) showAdminToast("✅ 连接请求成功！请查看运行日志确认。");
            else showAdminToast("❌ 连接失败，请检查房间号或网络连接。");
        } catch { showAdminToast("❌ 请求后端失败"); }
    };

    const waitForPlayerConnection = async (
        timeoutMs = 4500
    ): Promise<boolean> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 350));
            try {
                const response = await fetch(
                    'http://localhost:5555/api/config'
                );
                const latest = await response.json();
                if (latest.playerConnected === true) {
                    setConfig((previous: any) => previous ? ({
                        ...previous,
                        playerConnected: true,
                        cdpConnected: true,
                        playerConnecting: false,
                        playerSnapshot: latest.playerSnapshot
                    }) : previous);
                    return true;
                }
            } catch {
                // The normal configuration poll will keep retrying.
            }
        }
        return false;
    };

    const handleReconnectPlayer = async () => {
        setConfig((prev: any) => prev ? ({
            ...prev,
            playerConnected: false,
            cdpConnected: false,
            playerConnecting: true,
            playerSnapshot: null
        }) : prev);
        try {
            const res = await fetch('http://localhost:5555/api/sys/reconnect_player', { method: 'POST' });
            const json = await res.json();
            const connected = json.success === true
                || await waitForPlayerConnection();
            setConfig((prev: any) => prev ? ({
                ...prev,
                playerConnected: connected,
                cdpConnected: connected,
                playerConnecting: false
            }) : prev);
            if(connected) showAdminToast("✅ 播放器已自动连接！");
            else showAdminToast("⚠️ 暂未检测到所选播放器，后台会继续尝试连接。");
        } catch {
            setConfig((prev: any) => prev ? ({
                ...prev,
                playerConnected: false,
                cdpConnected: false,
                playerConnecting: false
            }) : prev);
            showAdminToast("❌ 发送指令失败");
        }
    };

    const handleConnectorUpdate = async (
        connectorId: NativeConnectorId
    ) => {
        if (connectorUpdating) return;
        const status = connectorStatuses[connectorId];
        if (!status?.updateAvailable) {
            showAdminToast('当前连接器没有可安装的更新。');
            return;
        }

        if (status.manualUpdateAvailable) {
            const confirmed = window.confirm(
                `${status.name}连接器将从 v${status.currentVersion || '未安装'} `
                + `更新到 v${status.latestVersion || '未知'}。\n\n`
                + '该版本属于不同的播放器兼容分支，不会自动安装。\n'
                + `目标连接器支持的播放器版本：${status.supportedPlayerVersion || '清单未注明'}\n\n`
                + '请确认你正在使用对应的播放器版本。是否继续手动更新？'
            );
            if (!confirmed) return;
        }

        const playerTypeByConnector: Record<NativeConnectorId, string> = {
            netease: 'NCM',
            kugou: 'Kugou',
            qqmusic: 'QQMusic',
            folia: 'Folia'
        };
        const updatesSelectedPlayer =
            config?.config?.PlayerType === playerTypeByConnector[connectorId];
        setConnectorUpdating(connectorId);
        if (updatesSelectedPlayer) {
            setConfig((previous: any) => previous ? ({
                ...previous,
                playerConnecting: true
            }) : previous);
        }

        try {
            const response = await fetch(
                'http://localhost:5555/api/connectors/update',
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ connectorId })
                }
            );
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '连接器更新失败');
            }
            if (result.status) {
                setConnectorStatuses(previous => ({
                    ...previous,
                    [connectorId]: result.status
                }));
            }

            let selectedConnected = result.reconnected === true;
            if (updatesSelectedPlayer) {
                if (!selectedConnected) {
                    selectedConnected = await waitForPlayerConnection();
                }
                setConfig((previous: any) => previous ? ({
                    ...previous,
                    playerConnected: selectedConnected,
                    cdpConnected: selectedConnected,
                    playerConnecting: false
                }) : previous);
            }
            await loadConnectorStatuses(false);
            showAdminToast(
                updatesSelectedPlayer && !selectedConnected
                    ? '⚠️ 连接器已更新，后台正在等待播放器连接。'
                    : `✅ ${result.message || '连接器更新完成'}`
            );
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : '连接器更新失败';
            showAdminToast(`❌ ${message}`);
            if (updatesSelectedPlayer) {
                setConfig((previous: any) => previous ? ({
                    ...previous,
                    playerConnecting: false
                }) : previous);
            }
        } finally {
            setConnectorUpdating(null);
        }
    };

    const handleConnectorReinstall = async (
        connectorId: NativeConnectorId
    ) => {
        if (connectorUpdating) return;
        const playerTypeByConnector: Record<NativeConnectorId, string> = {
            netease: 'NCM',
            kugou: 'Kugou',
            qqmusic: 'QQMusic',
            folia: 'Folia'
        };
        const reinstallsSelectedPlayer =
            config?.config?.PlayerType === playerTypeByConnector[connectorId];
        setConnectorUpdating(connectorId);
        if (reinstallsSelectedPlayer) {
            setConfig((previous: any) => previous ? ({
                ...previous,
                playerConnecting: true
            }) : previous);
        }

        try {
            const response = await fetch(
                'http://localhost:5555/api/connectors/reinstall',
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ connectorId })
                }
            );
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '连接器重新安装失败');
            }

            if (result.status) {
                setConnectorStatuses(previous => ({
                    ...previous,
                    [connectorId]: result.status
                }));
            }
            let selectedConnected = result.reconnected === true;
            if (reinstallsSelectedPlayer) {
                if (!selectedConnected) {
                    selectedConnected = await waitForPlayerConnection();
                }
                setConfig((previous: any) => previous ? ({
                    ...previous,
                    playerConnected: selectedConnected,
                    cdpConnected: selectedConnected,
                    playerConnecting: false
                }) : previous);
            }
            await loadConnectorStatuses(false);
            if (!reinstallsSelectedPlayer) {
                showAdminToast('✅ 连接器重新安装完成，正在切换并连接播放器...');
                await handleSetPlayerType(playerTypeByConnector[connectorId]);
            } else {
                showAdminToast(
                    selectedConnected
                        ? `✅ ${result.status?.name || '播放器'}连接器已重新安装并自动连接！`
                        : '⚠️ 连接器已重新安装，后台正在等待播放器连接。'
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : '连接器重新安装失败';
            showAdminToast(`❌ ${message}`);
            if (reinstallsSelectedPlayer) {
                setConfig((previous: any) => previous ? ({
                    ...previous,
                    playerConnecting: false
                }) : previous);
            }
        } finally {
            setConnectorUpdating(null);
        }
    };

    const startQrLogin = async () => {
        setQrState(prev => ({ ...prev, loading: true, base64: '' }));
        await fetch('http://localhost:5555/api/bili/qrstart', { method: 'POST' });
    };

    const logoutBili = async () => {
        if (!window.confirm('确定退出当前 B站账号吗？本地保存的登录凭据将被清除。')) return;
        try {
            const res = await fetch('http://localhost:5555/api/bili/logout', { method: 'POST' });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error('logout failed');
            setConfig((prev: any) => ({ ...prev, biliLogin: false, uid: 0, currentUser: null }));
            setQrState({ loading: false, base64: '', message: '已退出登录，可重新扫码绑定账号' });
            showAdminToast('✅ 已退出 B站账号并清除本地登录凭据');
        } catch {
            showAdminToast('❌ 退出登录失败，请检查后端连接');
        }
    };

    const toggleAccepting = async () => {
        try {
            await fetch('http://localhost:5555/api/state/toggle', { method: 'POST' });
            setConfig((prev: any) => ({...prev, accepting: !prev.accepting}));
        } catch(err) { console.error(err); }
    };

    const togglePlaying = async () => {
        try {
            await fetch('http://localhost:5555/api/state/toggle_play', { method: 'POST' });
            setConfig((prev: any) => ({...prev, playing: !prev.playing}));
        } catch(err) { console.error(err); }
    };

    const handleDebugInsert = async () => {
        if(!debugInput.trim()) return showAdminToast("❌ 请输入需要搜索并插入的歌曲名！");
        try {
            const res = await fetch('http://localhost:5555/api/debug/insert_next', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ keyword: debugInput })
            });
            const json = await res.json();
            if(json.success) {
                showAdminToast("✅ 搜索并插入成功！请前往播放列表查看。");
            } else {
                showAdminToast("❌ 操作失败。可能是没搜到歌曲，请查看运行日志。");
            }
        } catch(err: any) { showAdminToast("❌ 请求后端失败：" + err.message); }
    };

    // ⭐ 增加了错误状态识别 and Toast 拦截提示
    const handleDebugPlayNext = async () => {
        try {
            const res = await fetch('http://localhost:5555/api/debug/play_next', { method: 'POST' });
            const json = await res.json();
            if(json.success) showAdminToast(`✅ ${json.message || '切歌指令已成功发送！'}`);
            else showAdminToast(`❌ ${json.message || '切歌失败，播放器拒绝响应或未连接！'}`);
        } catch(err: any) { showAdminToast("❌ 请求后端失败：" + err.message); }
    };

    const updatePermission = (permKey: string, field: string, value: any) => {
        setConfig((prev: any) => ({
            ...prev,
            config: {
                ...prev.config,
                [permKey]: {
                    ...(prev.config[permKey] || { AllowManager: true, MinGuardType: (permKey === 'ForceControlPermission' ? -1 : 0), MinMedalLevel: 0 }),
                    [field]: value
                }
            }
        }));
    };

    const updateCooldown = (tier: string, value: string) => {
        const val = parseInt(value) || 0;
        setConfig((prev: any) => ({
            ...prev,
            config: {
                ...prev.config,
                Cooldowns: {
                    ...(prev.config.Cooldowns || { Normal: 0, Captain: 0, Admiral: 0, Governor: 0 }),
                    [tier]: val
                }
            }
        }));
    };

    const normalizeBiliUid = (value: string | number) => String(value).trim();
    const isBiliUid = (value: string) => /^\d+$/.test(value);

    const addSuperUser = () => {
        const userUid = normalizeBiliUid(superUserInput);
        if(!userUid || !isBiliUid(userUid)) {
            setSuperUserInput('');
            return;
        }
        const currentSu = config.config.SuperUsers || [];
        if(currentSu.some((uid: string | number) => normalizeBiliUid(uid) === userUid)) { setSuperUserInput(''); return; }
        persistSysConfigNow({ ...config.config, SuperUsers: [...currentSu, userUid] });
        setSuperUserInput('');
    };

    const removeSuperUser = (userUid: string | number) => {
        const currentSu: Array<string | number> = config.config.SuperUsers || [];
        persistSysConfigNow({
            ...config.config,
            SuperUsers: currentSu.filter(uid => normalizeBiliUid(uid) !== normalizeBiliUid(userUid))
        });
    };

    const addRequestWhitelistUser = () => {
        const userUid = normalizeBiliUid(requestWhitelistInput);
        if(!userUid || !isBiliUid(userUid)) {
            setRequestWhitelistInput('');
            return;
        }
        const currentUsers = config.config.RequestWhitelistUsers || [];
        if(currentUsers.some((uid: string | number) => normalizeBiliUid(uid) === userUid)) {
            setRequestWhitelistInput('');
            return;
        }
        persistSysConfigNow({ ...config.config, RequestWhitelistUsers: [...currentUsers, userUid] });
        setRequestWhitelistInput('');
    };

    const removeRequestWhitelistUser = (userUid: string | number) => {
        const currentUsers: Array<string | number> = config.config.RequestWhitelistUsers || [];
        persistSysConfigNow({
            ...config.config,
            RequestWhitelistUsers: currentUsers.filter(uid => normalizeBiliUid(uid) !== normalizeBiliUid(userUid))
        });
    };

    const handleSetPlayerType = async (type: string) => {
        if (!config?.config || config.config.PlayerType === type) return;
        const nextSysConfig = { ...config.config, PlayerType: type };
        lastConfigString.current = JSON.stringify(nextSysConfig);
        setConfig((prev: any) => ({
            ...prev,
            playerConnected: false,
            cdpConnected: false,
            playerConnecting: true,
            playerSnapshot: null,
            config: nextSysConfig
        }));
        showAdminToast("正在切换并自动连接播放器...");

        try {
            const res = await fetch('http://localhost:5555/api/config', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ sysConfig: nextSysConfig })
            });
            const json = await res.json();
            const connected = json.playerConnected === true
                || await waitForPlayerConnection();
            setConfig((prev: any) => prev ? ({
                ...prev,
                playerConnected: connected,
                cdpConnected: connected,
                playerConnecting: connected
                    ? false
                    : json.playerConnecting === true
            }) : prev);
            if (connected) showAdminToast("✅ 已切换并自动连接播放器！");
            else showAdminToast("⚠️ 已切换播放器，后台正在等待连接。");
        } catch {
            setConfig((prev: any) => prev ? ({
                ...prev,
                playerConnected: false,
                cdpConnected: false,
                playerConnecting: false
            }) : prev);
            showAdminToast("❌ 切换播放器失败，请查看运行日志。");
        }
    };

    const permTypes = [
        { key: 'OrderPermission', label: '点歌权限' },
        { key: 'SkipPermission', label: '切歌权限' },
        { key: 'PriorityPermission', label: '置顶权限 (放到队列第一首)' },
        { key: 'CancelPermission', label: '撤回权限 (撤回自己点的最近一首)' },
        { key: 'ToggleAcceptPermission', label: '开关接单权限 (开启/关闭)' },
        { key: 'ForceControlPermission', label: '强控队列权限 (立即/插队/撤回他人)' },
    ];

    const playerOptions: Array<{
        type: string;
        name: string;
        method: string;
        detail: string;
        connectorId: NativeConnectorId;
    }> = [
        { type: 'NCM', name: '网易云音乐', method: '原生 IPC', detail: '不重启客户端，不需要调试端口', connectorId: 'netease' },
        { type: 'Kugou', name: '酷狗音乐', method: '窗口消息 + IPC', detail: '原生控制与安全下一首守卫', connectorId: 'kugou' },
        { type: 'QQMusic', name: 'QQ 音乐', method: '单实例命令 + 静音守卫', detail: '错误下一首静音、暂停后接管', connectorId: 'qqmusic' },
        { type: 'Folia', name: 'Folia', method: '独立 Stage 连接器', detail: 'HTTP + WebSocket；支持 ID 校验与封面', connectorId: 'folia' }
    ];
    const classicObsUrl = 'http://localhost:5555/';
    const successBannerUrl = 'http://127.0.0.1:5555/?view=success-banner';
    const externalApiPort = Number(
        config?.externalApi?.port || config?.config?.ExternalApiPort || 5556
    );
    const modObsUrl = `http://127.0.0.1:${externalApiPort}/overlay/`;
    const currentStatusSong = config?.current as SongInfo | null | undefined;
    const primaryTabs = [
        { id: 'status', icon: '⌂', label: '运行状态' },
        { id: 'settings', icon: '⚙', label: '基础设置' },
        { id: 'login', icon: '◎', label: '账号授权' }
    ];
    const supportTabs = [
        { id: 'logs', icon: '≡', label: '运行日志' },
        { id: 'faq', icon: '?', label: '常见问题' },
        { id: 'debug', icon: '⌘', label: '调试工具' }
    ];
    const renderAdminTabs = (tabs: typeof primaryTabs) => tabs.map(tab => (
        <button
            key={tab.id}
            type="button"
            title={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
            className={`admin-nav-item ${activeTab === tab.id ? 'active' : ''}`}
        >
            <span className="admin-nav-icon" aria-hidden="true">{tab.icon}</span>
            <span className="admin-nav-text truncate font-medium">{tab.label}</span>
        </button>
    ));

    return (
        <div className="admin-widget-root animate-fade-in text-gray-200 flex flex-col font-sans select-none w-full h-screen overflow-hidden">

            {adminToast && (
                <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[99999] bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold animate-slide-in flex items-center gap-2">
                    {adminToast}
                </div>
            )}

            <div className="admin-titlebar px-4 flex justify-between items-center" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center gap-3">
                    <span className="admin-brand-mark" aria-hidden="true">♪</span>
                    <div className="leading-tight">
                        <div className="text-[13px] font-bold tracking-wide text-white">易点椿曲</div>
                        <div className="text-[9px] tracking-[0.18em] text-gray-500">设置中心</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.75)]" />
                    本地服务
                    {config?.version && <span className="ml-1 rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-gray-400">v{config.version}</span>}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                <nav className="admin-sidebar flex flex-col gap-1 overflow-y-auto custom-scrollbar shrink-0 z-10" aria-label="设置中心导航">
                    <div className="admin-nav-label">主要功能</div>
                    {renderAdminTabs(primaryTabs)}
                    <div className="admin-nav-label mt-5">支持与诊断</div>
                    {renderAdminTabs(supportTabs)}

                    <div className="admin-sidebar-meta mt-auto mx-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
                        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold text-gray-400">
                            <span className={`h-1.5 w-1.5 rounded-full ${config?.playerConnected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                            播放器
                        </div>
                        <div className="truncate text-[11px] text-gray-500">
                            {config?.playerConnected ? '连接正常' : '等待连接'}
                        </div>
                    </div>
                </nav>

                <main className="admin-content-shell flex-1 overflow-y-auto custom-scrollbar select-text relative">
                    {!config ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-white/50">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
                            <span className="text-xs tracking-wide">正在连接本地服务…</span>
                        </div>
                    ) : (
                        <div className="admin-page">

                            {/* ⭐ 新增: 全局联动智能异常自诊断提示栏 (在所有Tab的最上方持续警醒显示) */}
                            {hasBiliLoopIssue && (
                                <div className="mb-6 space-y-3 animate-fadeIn">
                                    {hasBiliLoopIssue && (
                                        <div className="bg-amber-500/15 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-200 shadow-lg">
                                            <span className="text-xl shrink-0 mt-0.5">🌐</span>
                                            <div className="text-xs space-y-1.5 flex-1">
                                                <div className="font-bold text-amber-400 text-sm">检测到 B站弹幕监控连接不断断线重连</div>
                                                <p className="leading-relaxed text-gray-300">
                                                    诊断发现日志中正在密集、频繁地重复刷新“<span className="text-amber-300">直播间已连接，弹幕监控启动！</span>”。这代表弹幕服务器连接在建立成功后瞬间遭遇断裂阻碍。
                                                </p>
                                                <div className="pt-1 flex flex-col gap-1 text-gray-200 bg-black/20 p-2.5 rounded-lg border border-white/5">
                                                    <div className="font-bold text-white flex items-center gap-1">🛠️ 请依序排查以下3项：</div>
                                                    <ul className="list-decimal pl-4 space-y-1 text-gray-300 mt-1">
                                                        <li>
                                                            <strong className="text-white">美国/海外 IP 应该可以使用：</strong>
                                                            v1.1.1 已加入海外网络兼容处理，正常情况下使用美国或其他海外 IP 也能连接弹幕。若仍反复断线，请先重新连接；仍无法恢复时，再尝试规则/PAC 分流、让 B站直播域名直连，或临时关闭代理、切换国内节点。
                                                        </li>
                                                        <li>
                                                            <strong className="text-white">重新建立连接：</strong>
                                                            游客模式本身可以接收弹幕，不要求扫码。请先在「运行状态」重新连接直播间；如果你原本使用了登录账号，也可以前往 <button className="text-cyan-400 font-bold underline hover:text-cyan-300 focus:outline-none" onClick={() => setActiveTab('login')}>扫码登录</button> 页刷新可选的账号凭据。
                                                        </li>
                                                        <li>
                                                            <strong className="text-white">核对房间号：</strong>
                                                            请务必输入正确的**直播间数字房间号**，而绝非主播的个人 UID。
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'status' && (
                                <div className="space-y-5 animate-slide-in-right flex flex-col h-full pb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-2">运行状态</h2>
                                        <p className="text-sm text-gray-500 mb-5">查看播放器、点歌开关和 OBS 展示页面；Mod UI 只读取公开状态，不能控制点歌机。</p>

                                        <div className="grid grid-cols-2 gap-4 mb-5">
                                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-inner">
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <span className="text-sm font-bold text-gray-200">经典页面</span>
                                                    <span className="text-[10px] px-2 py-1 rounded-full bg-gray-500/15 text-gray-400">旧场景兼容</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mb-3 leading-relaxed">原有整页界面，保留给已经配置好的 OBS 场景；它不是可换主题的 Mod 组件。</div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 min-w-0 text-sm font-mono text-cyan-400 select-all truncate">{classicObsUrl}</div>
                                                    <button onClick={() => { void navigator.clipboard.writeText(classicObsUrl); showAdminToast('✅ 已复制经典页面地址'); }} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold border border-white/10">复制</button>
                                                </div>
                                            </div>

                                            <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/25 shadow-inner">
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <span className="text-sm font-bold text-cyan-300">Mod UI 组件</span>
                                                    <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300">OBS 推荐</span>
                                                </div>
                                                <div className="text-xs text-gray-400 mb-3 leading-relaxed">透明组件页面。安装或切换 UI 后地址不变，OBS 会自动载入当前启用的主题。</div>
                                                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-cyan-400/15 bg-black/15 px-3 py-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] text-gray-500">当前使用</div>
                                                        <div className="truncate text-xs font-bold text-white">
                                                            {overlayMods?.active ? `${overlayMods.active.name} · v${overlayMods.active.version}` : '正在读取…'}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => overlaySettingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                                        className="shrink-0 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20"
                                                    >
                                                        前往 Mod 设置
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 min-w-0 text-sm font-mono text-cyan-300 select-all truncate">{modObsUrl}</div>
                                                    <button onClick={() => { void navigator.clipboard.writeText(modObsUrl); showAdminToast('✅ 已复制 Mod UI 地址'); }} className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg text-xs font-bold text-cyan-300 border border-cyan-500/25">复制</button>
                                                </div>
                                                {!config.externalApi?.httpEnabled && (
                                                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                                                        <span className="text-[11px] text-amber-300">只读 HTTP 尚未开启，OBS 暂时打不开此地址。</span>
                                                        <button onClick={enableOverlayApi} className="shrink-0 text-[11px] font-bold text-amber-200 underline">立即开启</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/25 shadow-inner mb-5">
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <span className="text-sm font-bold text-emerald-300">点歌成功通知条</span>
                                                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">透明浏览器源</span>
                                            </div>
                                            <div className="text-xs text-gray-400 mb-3 leading-relaxed">
                                                默认完全透明。只有收到新的点歌成功事件时，才会从顶部滑出一条类似手机通知的提示，适合放在手机状装饰框顶部。
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 min-w-0 text-sm font-mono text-emerald-300 select-all truncate">{successBannerUrl}</div>
                                                <button onClick={() => { void navigator.clipboard.writeText(successBannerUrl); showAdminToast('✅ 已复制点歌成功通知条地址'); }} className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-xs font-bold text-emerald-300 border border-emerald-500/25">复制</button>
                                            </div>
                                        </div>

                                        <div className={`p-4 rounded-xl border mb-5 flex items-center gap-4 ${currentStatusSong && !config.currentIsRequested ? 'bg-sky-500/10 border-sky-400/25' : 'bg-white/5 border-white/10'}`}>
                                            <div className={`w-12 h-12 shrink-0 rounded-xl overflow-hidden grid place-items-center ${currentStatusSong && !config.currentIsRequested ? 'bg-sky-400/15 text-sky-200' : 'bg-white/5 text-gray-400'}`}>
                                                {currentStatusSong?.CoverUrl ? (
                                                    <img src={currentStatusSong.CoverUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                                ) : '♫'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-[11px] font-bold mb-1 ${currentStatusSong && !config.currentIsRequested ? 'text-sky-300' : 'text-green-400'}`}>
                                                    {currentStatusSong ? (config.currentIsRequested ? '点歌播放中' : '播放器当前歌曲 · 主播歌单') : '播放器当前歌曲'}
                                                </div>
                                                <div className="font-bold text-white truncate">{currentStatusSong?.SongName || '暂未读取到歌曲'}</div>
                                                <div className="text-xs text-gray-400 truncate mt-0.5">{currentStatusSong?.ArtistName || '连接播放器后会在这里实时显示'}</div>
                                            </div>
                                            <span className={`text-xs px-2.5 py-1 rounded-full border ${config.playerConnected ? 'text-green-300 border-green-500/25 bg-green-500/10' : 'text-red-300 border-red-500/25 bg-red-500/10'}`}>
                                                {config.playerConnected ? '播放器已连接' : '播放器未连接'}
                                            </span>
                                        </div>

                                        <div className="bg-white/5 p-5 rounded-xl border border-white/10 shadow-inner mb-5">
                                            <div className="text-sm text-gray-400 mb-3 flex justify-between">
                                                <span>当前监控直播间</span>
                                                <span className="text-blue-400 text-xs">发弹幕 "test" 或 "测试" 验证连接</span>
                                            </div>
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={roomIdInput}
                                                    onChange={e => setRoomIdInput(e.target.value)}
                                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg p-3 text-md text-white focus:border-blue-500 outline-none"
                                                    placeholder="输入直播间的真实房间ID (非UID)..."
                                                />
                                                <button onClick={handleConnectRoom} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-md rounded-lg font-bold shadow-lg transition-colors">连接 / 切换</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-5">
                                            <div className="bg-white/5 p-5 rounded-xl border border-white/10 flex justify-between items-center">
                                                <div>
                                                    <div className="text-sm text-gray-400 mb-2">点歌功能状态</div>
                                                    <div className="text-2xl font-bold flex items-center gap-3 mt-1">
                                                        {config.accepting ? <><span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span> <span className="text-green-400">接收中</span></> : <><span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> <span className="text-red-400">已暂停</span></>}
                                                    </div>
                                                </div>
                                                <button onClick={toggleAccepting} className={`px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors border ${config.accepting ? 'bg-red-600/20 text-red-500 border-red-500/30 hover:bg-red-600/40' : 'bg-green-600/20 text-green-500 border-green-500/30 hover:bg-green-600/40'}`}>
                                                    {config.accepting ? '停单' : '接单'}
                                                </button>
                                            </div>

                                            <div className="bg-white/5 p-5 rounded-xl border border-white/10 flex justify-between items-center">
                                                <div>
                                                    <div className="text-sm text-gray-400 mb-2">自动播放状态</div>
                                                    <div className="text-2xl font-bold flex items-center gap-3 mt-1">
                                                        {config.playing ? <><span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span> <span className="text-blue-400">播放中</span></> : <><span className="w-3 h-3 rounded-full bg-gray-500 shadow-[0_0_8px_rgba(107,114,128,0.8)]"></span> <span className="text-gray-400">已暂停</span></>}
                                                    </div>
                                                </div>
                                                <button onClick={togglePlaying} className={`px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors border ${config.playing ? 'bg-gray-600/40 text-gray-400 border-gray-500/30 hover:bg-gray-600/60' : 'bg-blue-600/20 text-blue-500 border-blue-500/30 hover:bg-blue-600/40'}`}>
                                                    {config.playing ? '暂停' : '恢复'}
                                                </button>
                                            </div>
                                        </div>

                                        <section ref={overlaySettingsRef} className="bg-gradient-to-br from-violet-500/[0.08] to-cyan-500/[0.05] rounded-2xl border border-violet-400/25 overflow-hidden scroll-mt-4">
                                            <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-lg font-bold text-white">🎨 Mod UI</h3>
                                                        {overlayMods?.active && <span className="text-[10px] px-2 py-1 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/20">当前：{overlayMods.active.name}</span>}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">支持 GitHub 仓库发布清单，也支持选择或拖入本地 ZIP。包会经过路径、体积和文件类型校验。</p>
                                                </div>
                                                <a href="https://github.com/Enkianssus/HaruMusicBot-Overlay-Default" target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:text-cyan-200 underline shrink-0">开发示例</a>
                                            </div>

                                            <div className="p-5 space-y-4">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="url"
                                                        value={overlayUrl}
                                                        onChange={event => setOverlayUrl(event.target.value)}
                                                        placeholder="https://github.com/作者/仓库"
                                                        className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-400 outline-none"
                                                    />
                                                    <button disabled={overlayBusy} onClick={installOverlayFromUrl} className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                                                        {overlayBusy ? '处理中…' : '识别并安装'}
                                                    </button>
                                                    <button disabled={overlayBusy} onClick={() => overlayFileInputRef.current?.click()} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-200 text-sm font-bold border border-white/10 transition-colors">＋ 选择 ZIP</button>
                                                    <input
                                                        ref={overlayFileInputRef}
                                                        type="file"
                                                        accept=".zip,application/zip"
                                                        hidden
                                                        onChange={event => {
                                                            const file = event.target.files?.[0];
                                                            if (file) void installOverlayZip(file);
                                                        }}
                                                    />
                                                </div>

                                                <div
                                                    onDragEnter={event => { event.preventDefault(); setOverlayDropActive(true); }}
                                                    onDragOver={event => { event.preventDefault(); setOverlayDropActive(true); }}
                                                    onDragLeave={event => { event.preventDefault(); setOverlayDropActive(false); }}
                                                    onDrop={event => {
                                                        event.preventDefault();
                                                        setOverlayDropActive(false);
                                                        const file = event.dataTransfer.files?.[0];
                                                        if (file) void installOverlayZip(file);
                                                    }}
                                                    className={`rounded-xl border border-dashed px-4 py-3 text-center text-xs transition-colors ${overlayDropActive ? 'border-cyan-300 bg-cyan-400/10 text-cyan-200' : 'border-white/15 bg-black/15 text-gray-500'}`}
                                                >
                                                    {overlayDropActive ? '松开即可安装 Mod UI ZIP' : '将 Mod UI ZIP 拖到这里安装'}
                                                </div>

                                                <div className="space-y-2">
                                                    {(overlayMods?.overlays || []).map(overlay => (
                                                        <div key={overlay.id} className={`rounded-xl border p-3 flex items-center gap-3 ${overlay.active ? 'border-violet-400/35 bg-violet-500/10' : 'border-white/10 bg-black/15'}`}>
                                                            <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${overlay.active ? 'bg-violet-500/25 text-violet-200' : 'bg-white/5 text-gray-500'}`}>◫</div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white truncate">{overlay.name}</span>
                                                                    <span className="text-[10px] text-gray-500">v{overlay.version}</span>
                                                                    {overlay.builtin && <span className="text-[10px] text-gray-500">内置</span>}
                                                                </div>
                                                                <div className="text-[11px] text-gray-500 truncate mt-0.5">{overlay.description || `${overlay.author} · ${overlay.id}`}</div>
                                                            </div>
                                                            {overlay.active ? (
                                                                <span className="text-xs font-bold text-violet-300 px-3 py-1.5">使用中</span>
                                                            ) : (
                                                                <button disabled={overlayBusy} onClick={() => void activateOverlay(overlay.id)} className="text-xs font-bold text-cyan-300 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50">切换</button>
                                                            )}
                                                            {!overlay.builtin && (
                                                                <button disabled={overlayBusy} onClick={() => void removeOverlay(overlay.id)} title="删除这个 Mod UI" className="text-xs text-red-300/70 hover:text-red-300 px-2 py-1.5 disabled:opacity-50">删除</button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {!overlayMods && <div className="text-xs text-gray-500 py-2">正在读取已安装 Mod UI…</div>}
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'logs' && (
                                <div className="space-y-4 animate-slide-in-right flex flex-col h-[70vh]">
                                    <div className="flex justify-between items-center pr-2">
                                        <h2 className="text-2xl font-bold text-white mb-2">后端实时日志 (Log)</h2>
                                        {/* ⭐ 新增: 精致的滚动模式控制开关，让用户在阅读日志时可手动锁定 */}
                                        <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                            <label className="text-xs text-gray-400 flex items-center gap-1.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={autoScroll}
                                                    onChange={e => {
                                                        setAutoScroll(e.target.checked);
                                                        if (e.target.checked && logContainerRef.current) {
                                                            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                                                        }
                                                    }}
                                                    className="w-3.5 h-3.5 rounded border-white/20 bg-black/50 text-blue-500 focus:ring-0 cursor-pointer"
                                                />
                                                <span>自动滚动</span>
                                            </label>
                                            <div className="w-[1px] h-3 bg-white/10"></div>
                                            <button
                                                onClick={() => {
                                                    setAutoScroll(true);
                                                    if (logContainerRef.current) {
                                                        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                                                    }
                                                }}
                                                className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                            >
                                                ⬇️ 滚到底部
                                            </button>
                                        </div>
                                    </div>

                                    {/* ⭐ 改动: 日志容器加入 ref 监听和 scroll 回调事件，检测用户向上翻页操作并智能关闭 autoScroll */}
                                    <div className="flex-1 relative min-h-0">
                                        <div
                                            ref={logContainerRef}
                                            onScroll={handleLogScroll}
                                            className="w-full h-full bg-[#090b0f] rounded-xl border border-white/10 p-4 font-mono text-[13px] overflow-y-auto custom-scrollbar flex flex-col gap-2 shadow-inner"
                                        >
                                            {sysLogs.length === 0 ? (
                                                <div className="text-gray-500 text-center mt-10">暂无日志...</div>
                                            ) : (
                                                sysLogs.map((log, i) => (
                                                    <div key={i} className="flex gap-4 leading-relaxed">
                                                        <span className="text-gray-600 shrink-0">[{log.Time}]</span>
                                                        <span style={{color: mapConsoleColor(log.Color)}} className="break-all whitespace-pre-wrap">{log.Message}</span>
                                                    </div>
                                                ))
                                            )}
                                            <div ref={logsEndRef} className="h-[2px]" />
                                        </div>

                                        {/* ⭐ 新增: 当 autoScroll 在用户查阅日志时被锁定，显示极为好看和友好的动态按钮，一键恢复置底滚动 */}
                                        {!autoScroll && (
                                            <button
                                                onClick={() => {
                                                    setAutoScroll(true);
                                                    if (logContainerRef.current) {
                                                        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                                                    }
                                                }}
                                                className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-full shadow-lg text-xs font-bold transition-all flex items-center gap-1.5 animate-bounce select-none border border-blue-400/30"
                                            >
                                                <span>⬇️</span> 自动滚动已暂停 (点击恢复)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ⭐ 新增: 常见问题异常排查 FAQ 界面 */}
                            {activeTab === 'faq' && (
                                <div className="space-y-6 animate-slide-in-right pb-10">
                                    <h2 className="text-2xl font-bold text-white mb-6">❓ 常见问题与自助诊断</h2>

                                    {/* FAQ CARD 1: 播放器无法控制 */}
                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 shadow-inner">
                                        <h3 className="text-md font-bold text-red-400 flex items-center gap-2 pb-2 border-b border-white/5">
                                            <span>🎵</span> 问题 1：当前播放器显示“未连接”或无法控制？
                                        </h3>

                                        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
                                            <div>
                                                <strong className="text-white block mb-1">第一步：确认播放器已启动并显示主窗口</strong>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    v1.1.1 不再启动、结束或重启播放器。请先手动打开网易云、酷狗或 QQ 音乐；使用 Folia 时请启动 Stage API。再到 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('settings')}>基础设置</button> 选择对应方式并点击“重新连接”。
                                                </p>
                                            </div>

                                            <div className="border-t border-white/5 pt-3">
                                                <strong className="text-white block mb-1">第二步：查看播放器版本和运行日志</strong>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    网易云通过原生 IPC 连接；酷狗使用窗口消息与内部 IPC；QQ 使用单实例命令；Folia 使用本机 Stage API。播放器更新后若某项能力被拒绝，请把 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('logs')}>运行日志</button> 中的版本和错误信息发来。网易云不再需要调试端口。
                                                </p>
                                            </div>

                                            <div className="border-t border-white/5 pt-3">
                                                <strong className="text-white block mb-1">第三步：用调试页做主动测试</strong>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    前往 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('debug')}>调试测试</button> 搜索一首歌并登记下一首，或手动触发下一首。该操作会真实控制当前选中的播放器。
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* FAQ CARD 2: B站弹幕无法监控 */}
                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 shadow-inner">
                                        <h3 className="text-md font-bold text-yellow-400 flex items-center gap-2 pb-2 border-b border-white/5">
                                            <span>💬</span> 问题 2：在直播间里发送弹幕点歌，点歌机完全没有反应？
                                        </h3>

                                        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
                                            <div>
                                                <strong className="text-white block mb-1">第一步：自测点歌机是否正常收到弹幕消息</strong>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    请前往您的 B 站直播间发送一条极其简单的测试弹幕：<code className="px-1 py-0.5 rounded bg-black/50 text-cyan-300 font-mono font-bold">test</code> 或 <code className="px-1 py-0.5 rounded bg-black/50 text-cyan-300 font-mono font-bold">测试</code>。
                                                </p>
                                                <p className="text-xs text-gray-400 leading-relaxed mt-1">
                                                    随后，立刻在点歌机控制台点击 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('logs')}>运行日志</button> 翻阅刚刚产生的新记录，寻找是否出现了以下类似信息：
                                                </p>
                                                <code className="text-cyan-300 font-mono text-[12px] block bg-black/60 p-2.5 rounded border border-white/5 mt-1.5 select-all">
                                                    [23:16:30] [弹幕] 测试通信: test
                                                </code>
                                                <p className="text-xs text-gray-400 leading-relaxed mt-1.5">
                                                    <strong className="text-red-400">如果没有刷新任何弹幕日志：</strong> 代表您根本没有与 B 站直播间建立底层的物理网络连接。请看下方的第二步排查。
                                                </p>
                                            </div>

                                            <div className="border-t border-white/5 pt-3">
                                                <strong className="text-white block mb-1.5">第二步：依次进行网络、凭证和房间号校准排查</strong>
                                                <ul className="list-decimal pl-5 space-y-2.5 text-xs text-gray-400">
                                                    <li>
                                                        <strong className="text-white">美国/海外 IP 在 v1.1.1 中应该可以使用</strong>
                                                        新版已经加入海外网络兼容处理，不再把境外 IP 视为必然不可用。若当前线路仍触发 B站风控并反复断线，请先重新连接一次；仍不行时，再尝试规则/PAC 分流并让 B站直播域名直连，或临时关闭代理、切换国内节点。<br/>
                                                        <strong className="text-green-400">建议：</strong> 先保持当前美国 IP 直接测试，只有实际失败时才使用上述替代方法。
                                                    </li>
                                                    <li>
                                                        <strong className="text-white">重新建立游客或账号连接</strong>
                                                        游客模式无需扫码即可接收弹幕。请先前往 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('status')}>运行状态</button> 重新连接直播间；只有在你需要白名单、权限分级，或想刷新已有账号凭据时，才需要前往扫码登录页。
                                                    </li>
                                                    <li>
                                                        <strong className="text-white">房间号错填成 UID？</strong>
                                                        千万不要在运行状态配置中把主播的个人 UID（即几千万的一长串数字）填了进去。<br/>
                                                        <strong className="text-green-400">解决方法：</strong> 请前往 <button className="text-cyan-400 font-bold underline hover:text-cyan-300" onClick={() => setActiveTab('status')}>运行状态</button>，确认输入的房间号是该直播网页链接最末尾的那串纯数字，如果是短号就输入短号。
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'debug' && (
                                <div className="space-y-6 animate-slide-in-right flex flex-col h-full">
                                    <h2 className="text-2xl font-bold text-white mb-2">调试与测试</h2>

                                    <div className="bg-white/5 p-6 rounded-xl border border-white/10 shadow-inner">
                                        <h3 className="text-sm font-bold text-purple-400 mb-4 uppercase tracking-wider">🛠️ 测试一：搜索并加入播放列表</h3>
                                        <div className="flex gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={debugInput}
                                                onChange={e => setDebugInput(e.target.value)}
                                                className="flex-1 bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500"
                                                placeholder="输入要搜索的歌曲名称"
                                                onKeyDown={e => e.key === 'Enter' && handleDebugInsert()}
                                            />
                                            <button onClick={handleDebugInsert} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-bold transition-colors shadow-lg">发送到播放器</button>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-8 leading-relaxed">此操作会使用当前选中播放器自己的搜索接口；Folia 使用 Stage 搜索接口，其余播放器使用各自适配器，并登记下一首守卫。</p>

                                        <h3 className="text-sm font-bold text-blue-400 mb-4 uppercase tracking-wider">🛠️ 测试二：模拟切歌指令</h3>
                                        <button onClick={handleDebugPlayNext} className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-bold transition-colors shadow-lg flex justify-center items-center gap-2">
                                            ⏭️ 立即触发播放下一首
                                        </button>
                                        <p className="text-xs text-gray-500 mt-3 text-center leading-relaxed">向播放器发送播放下一首指令，用于测试控制权连接状态。</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'settings' && (
                                <div className="admin-settings-page animate-slide-in-right pb-10">
                                    <section className="admin-settings-hero">
                                        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
                                            <div>
                                                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/80">Preferences</div>
                                                <h2 className="admin-page-heading">基础设置</h2>
                                                <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
                                                    集中管理播放器连接、点歌规则、展示接口与用户权限。
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-semibold text-emerald-300">自动保存已开启</span>
                                                <span className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${config.playerConnected ? 'border-violet-400/25 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/[0.035] text-gray-400'}`}>
                                                    {config.playerConnected ? '播放器已连接' : '播放器待连接'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="admin-quick-nav relative z-10" aria-label="设置页快速定位">
                                            <button type="button" onClick={() => document.getElementById('settings-player')?.scrollIntoView({behavior: 'smooth'})}>播放与连接</button>
                                            <button type="button" onClick={() => document.getElementById('settings-request-rules')?.scrollIntoView({behavior: 'smooth'})}>点歌规则</button>
                                            <button type="button" onClick={() => document.getElementById('settings-display')?.scrollIntoView({behavior: 'smooth'})}>展示设置</button>
                                            <button type="button" onClick={() => document.getElementById('settings-api')?.scrollIntoView({behavior: 'smooth'})}>外部接口</button>
                                            <button type="button" onClick={() => document.getElementById('settings-permissions')?.scrollIntoView({behavior: 'smooth'})}>用户与权限</button>
                                        </div>
                                    </section>

                                    {/* 登录账号信息卡 */}
                                    {config.biliLogin && config.currentUser?.uid ? (
                                        <div className="settings-card bg-white/5 p-5 rounded-xl border border-white/10 mb-6 shadow-inner flex items-center gap-5">
                                            <img
                                                src={config.currentUser.face ? `${config.currentUser.face}@160w_160h.webp` : `https://api.dicebear.com/7.x/identicon/svg?seed=${config.currentUser.uid}`}
                                                referrerPolicy="no-referrer"
                                                alt="avatar"
                                                onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${config.currentUser.uid}`; }}
                                                className="w-16 h-16 rounded-full border-2 border-pink-400/60 object-cover shrink-0 shadow-lg"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-lg font-bold text-white truncate">{config.currentUser.uname || '未知用户'}</span>
                                                    {config.currentUser.level > 0 && (
                                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-400/30 shrink-0">Lv.{config.currentUser.level}</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-400">
                                                    <span>UID <span className="ml-1 text-gray-200 font-mono select-all">{config.currentUser.uid}</span></span>
                                                    <span>直播间 {config.currentUser.myRoomId > 0
                                                        ? <span className="text-cyan-400 font-mono select-all">{config.currentUser.myRoomId}</span>
                                                        : <span className="text-gray-500">未开通</span>}</span>
                                                    <span>粉丝 <span className="ml-1 text-gray-200">{config.currentUser.followerCount ?? 0}</span></span>
                                                    {config.currentUser.myRoomId > 0 && (
                                                        <>
                                                            <span>大航海 <span className="ml-1 text-gray-200">{config.currentUser.guardCount ?? 0}</span></span>
                                                            <span>粉丝团 <span className="ml-1 text-gray-200">{config.currentUser.fanClubCount ?? 0}</span></span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="settings-card bg-cyan-500/10 p-4 rounded-xl border border-cyan-500/20 mb-6 text-sm text-cyan-100 flex items-start gap-3">
                                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300">◎</span>
                                            <div>
                                                <div className="font-bold">游客模式已启用</div>
                                                <div className="text-xs text-gray-400 mt-1">无需扫码即可连接直播间和使用普通点歌。超级用户白名单与自定义权限控制需登录后才可设置。</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 播放器原生控制区域 */}
                                    <div id="settings-player" className="settings-card bg-white/5 p-6 rounded-xl border border-purple-500/40 space-y-5 mb-6 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 rounded-bl-xl border-b border-l border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-[10px] font-bold text-violet-200">独立连接器</div>

                                        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                                            <div>
                                                <h3 className="text-sm font-bold text-violet-300">播放与连接</h3>
                                                <p className="mt-1 text-[11px] text-gray-500">选择目标播放器，并管理对应的本地连接器。</p>
                                            </div>
                                            <span className="px-3 py-1.5 bg-green-500/10 text-green-300 text-[11px] rounded-lg font-bold border border-green-500/30">
                                                {connectorChecking ? '正在同步版本…' : '兼容补丁自动更新'}
                                            </span>
                                        </div>

                                        {connectorStatusError && (
                                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-300">
                                                连接器版本检查失败：{connectorStatusError}。已安装的连接器仍可继续使用；首次使用则需要网络恢复后自动下载安装。
                                            </div>
                                        )}

                                        <div className="hidden md:grid grid-cols-12 gap-4 text-[11px] text-gray-500 font-bold uppercase tracking-wider pb-2 border-b border-white/5 mt-3">
                                            <div className="col-span-2">目标播放器</div>
                                            <div className="col-span-2">当前状态</div>
                                            <div className="col-span-3">连接器版本</div>
                                            <div className="col-span-2">控制方式</div>
                                            <div className="col-span-3 text-right">操作</div>
                                        </div>

                                        <div className="flex flex-col gap-3 mt-2">
                                            {playerOptions.map(player => {
                                                const selected = config.config.PlayerType === player.type;
                                                const connected = config.playerConnected ?? config.cdpConnected;
                                                const connecting = selected && config.playerConnecting === true;
                                                const connectorStatus =
                                                    connectorStatuses[player.connectorId];
                                                const reinstalling =
                                                    player.connectorId === connectorUpdating;
                                                const automaticallyUpdating =
                                                    connectorStatus?.updating === true;
                                                return (
                                                    <div key={player.type} className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-black/40 border ${selected ? 'border-purple-500/50 shadow-inner' : 'border-white/10'} rounded-lg p-3 transition-colors hover:bg-white/5`}>
                                                        <div className="md:col-span-2 flex items-center gap-3">
                                                            <button onClick={() => handleSetPlayerType(player.type)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-purple-500' : 'border-gray-500'}`}>
                                                                {selected && <div className="w-2.5 h-2.5 bg-purple-500 rounded-full" />}
                                                            </button>
                                                            <span className={`text-sm font-bold tracking-wide ${selected ? 'text-white' : 'text-gray-400'}`}>{player.name}</span>
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            {selected ? (
                                                                <div className="space-y-1.5">
                                                                    <span className={`inline-flex text-[10px] px-2.5 py-1 rounded-full font-bold shadow-md ${connecting ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : connected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                                                {connecting ? '连接中' : connected ? '已连接' : '未连接'}
                                                                    </span>
                                                                    <div className="text-[10px] text-gray-400">
                                                                        播放器版本：
                                                                        <span className="font-mono text-gray-200">
                                                                            {connected && config.playerSnapshot?.version
                                                                                ? config.playerSnapshot.version
                                                                                : connecting
                                                                                    ? '正在检测'
                                                                                    : '未检测到'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-gray-600/20 text-gray-500 border border-gray-500/30">未启用</span>
                                                            )}
                                                        </div>
                                                        <div className="md:col-span-3 min-w-0">
                                                            {connectorStatus ? (
                                                                    <div className="space-y-1">
                                                                        {connectorStatus.manualUpdateAvailable && (
                                                                            <div className="text-[10px] text-orange-300 font-bold">
                                                                                新播放器版本分支：仅手动更新
                                                                                <span className="block text-orange-200/70 font-normal mt-0.5">
                                                                                    支持播放器版本：{connectorStatus.supportedPlayerVersion || '清单未注明'}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                        {connectorStatus.autoUpdateAvailable && connectorStatus.installed && (
                                                                            <div className="text-[10px] text-cyan-300 font-bold">
                                                                                同播放器版本补丁，将自动更新
                                                                            </div>
                                                                        )}
                                                                        <div className="text-[11px] text-gray-300">
                                                                            当前：
                                                                            <span className="font-mono text-white">
                                                                                {connectorStatus.installed
                                                                                    ? `独立 v${connectorStatus.currentVersion}`
                                                                                    : '未安装'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-500">
                                                                            网站最新：
                                                                            <span className="font-mono">
                                                                                {connectorStatus.latestVersion
                                                                                    ? `v${connectorStatus.latestVersion}`
                                                                                    : '未知'}
                                                                            </span>
                                                                        </div>
                                                                        <span
                                                                            title={connectorStatus.error || undefined}
                                                                            className={`inline-flex text-[9px] px-2 py-0.5 rounded-full border ${
                                                                                connectorStatus.updating
                                                                                    ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                                                                                    : connectorStatus.error
                                                                                    ? 'bg-red-500/10 text-red-300 border-red-500/30'
                                                                                    : !connectorStatus.compatible
                                                                                        ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                                                                                        : connectorStatus.updateAvailable
                                                                                            ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                                                                            : 'bg-green-500/10 text-green-300 border-green-500/30'
                                                                            }`}
                                                                        >
                                                                            {connectorStatus.updating
                                                                                ? connectorStatus.installed ? '后台更新中' : '自动安装中'
                                                                                : connectorStatus.error
                                                                                ? '检查失败'
                                                                                : !connectorStatus.compatible
                                                                                    ? `需要本体 v${connectorStatus.minimumCoreVersion}`
                                                                                    : connectorStatus.updateAvailable
                                                                                        ? connectorStatus.installed ? '有新版本可选' : '缺失时自动安装'
                                                                                        : '已是最新'}
                                                                        </span>
                                                                    </div>
                                                            ) : (
                                                                    <span className="text-[10px] text-gray-500">
                                                                        {connectorChecking ? '正在读取版本...' : '尚未检查版本'}
                                                                    </span>
                                                            )}
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <div className={`text-xs font-bold ${selected ? 'text-purple-300' : 'text-gray-600'}`}>{player.method}</div>
                                                            <div className="text-[10px] text-gray-500 mt-1">{player.detail}</div>
                                                        </div>
                                                        <div className="md:col-span-3 flex flex-wrap justify-end gap-2">
                                                            {connectorStatus?.updateAvailable && (
                                                                <button
                                                                    disabled={
                                                                        connectorUpdating !== null
                                                                        || connectorStatus.updating === true
                                                                        || connectorStatus.compatible === false
                                                                    }
                                                                    onClick={() => void handleConnectorUpdate(player.connectorId)}
                                                                    className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] rounded-lg font-bold shadow transition-colors border border-cyan-400/40 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >
                                                                    {reinstalling
                                                                        ? '⏳ 更新中'
                                                                        : connectorStatus.manualUpdateAvailable
                                                                            ? '手动更新'
                                                                            : '⬆️ 立即更新'}
                                                                </button>
                                                            )}
                                                            <button
                                                                disabled={
                                                                    connectorUpdating !== null
                                                                    || connectorStatus?.updating === true
                                                                    || connectorStatus?.compatible === false
                                                                    || connectorStatus?.manualUpdateAvailable === true
                                                                }
                                                                onClick={() => void handleConnectorReinstall(player.connectorId)}
                                                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[11px] rounded-lg font-bold shadow transition-colors border border-amber-400/40 disabled:opacity-30 disabled:cursor-not-allowed"
                                                            >
                                                                {reinstalling
                                                                    ? '⏳ 重新安装中'
                                                                    : automaticallyUpdating
                                                                        ? '⏳ 自动更新中'
                                                                        : '重新安装'}
                                                            </button>
                                                            <button
                                                                disabled={
                                                                    !selected
                                                                    || connecting
                                                                    || connectorUpdating !== null
                                                                    || connectorStatus?.updating === true
                                                                }
                                                                onClick={handleReconnectPlayer}
                                                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[11px] rounded-lg font-bold shadow transition-colors border border-purple-400/50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                            >
                                                                {connecting ? '连接中' : '重新连接'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {config.config.PlayerType === 'Folia' && (
                                            <div className="bg-pink-500/5 border border-pink-500/20 rounded-lg p-4">
                                                <label className="block text-xs text-pink-300 font-bold mb-2">Folia Stage Token</label>
                                                <input
                                                    type="password"
                                                    value={config.config.FoliaToken || ''}
                                                    onChange={e => setConfig({
                                                        ...config,
                                                        config: {
                                                            ...config.config,
                                                            FoliaToken: e.target.value
                                                        }
                                                    })}
                                                    placeholder={
                                                        config.config.FoliaTokenConfigured
                                                            ? '已配置；输入新 Token 可替换'
                                                            : 'Bearer Token...'
                                                    }
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-pink-500"
                                                />
                                                <p className="text-[10px] text-gray-500 mt-2">
                                                    Token 仅保存在本机配置中，并只通过本地进程环境交给 Folia 连接器。保存后点击上方“重新连接”，连接本机 32107 端口的 Stage API。
                                                </p>
                                            </div>
                                        )}

                                        <div className="text-xs text-gray-500 mt-2 italic flex gap-2 leading-relaxed">
                                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 text-[10px] not-italic">i</span>
                                            <span>
                                                本体会自动补齐缺少的连接器，并每 30 分钟检查新版本。同一播放器兼容分支只提高第三位的补丁会自动更新；第二位提高代表播放器兼容版本变化，只会提示并等待手动确认。跨分支手动更新前会显示目标连接器支持的播放器版本。“重新安装”只用于当前兼容分支的手动修复。
                                            </span>
                                        </div>
                                    </div>

                                    <div id="settings-request-rules" className="settings-card bg-white/5 p-6 rounded-xl border border-white/10 space-y-5 mb-6">
                                        <div className="border-b border-white/10 pb-3">
                                            <h3 className="text-sm font-bold text-violet-200">点歌冷却</h3>
                                            <p className="mt-1 text-[11px] text-gray-500">分别设置不同身份用户的请求间隔，单位为秒。</p>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-2">普通用户</label>
                                                <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none" value={config.config.Cooldowns?.Normal || 0} onChange={e => updateCooldown('Normal', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-blue-400 mb-2 font-bold">舰长</label>
                                                <input type="number" className="w-full bg-blue-900/30 border border-blue-500/30 rounded-lg p-2.5 text-md text-blue-200 focus:border-blue-500 outline-none" value={config.config.Cooldowns?.Captain || 0} onChange={e => updateCooldown('Captain', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-purple-400 mb-2 font-bold">提督</label>
                                                <input type="number" className="w-full bg-purple-900/30 border border-purple-500/30 rounded-lg p-2.5 text-md text-purple-200 focus:border-purple-500 outline-none" value={config.config.Cooldowns?.Admiral || 0} onChange={e => updateCooldown('Admiral', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-red-400 mb-2 font-bold">总督</label>
                                                <input type="number" className="w-full bg-red-900/30 border border-red-500/30 rounded-lg p-2.5 text-md text-red-200 focus:border-red-500 outline-none" value={config.config.Cooldowns?.Governor || 0} onChange={e => updateCooldown('Governor', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center gap-4 bg-black/30 border border-white/10 rounded-lg p-3">
                                            <div>
                                                <label className="block text-sm text-white font-medium">白名单用户无视点歌冷却</label>
                                                <span className="text-xs text-gray-500 block mt-1">开启后，下方 UID 白名单用户不会被本冷却规则限制</span>
                                            </div>
                                            <button onClick={() => persistSysConfigNow({...config.config, CooldownWhitelistExempt: !config.config.CooldownWhitelistExempt})} className={`w-10 h-6 rounded-full p-1 transition-colors shrink-0 ${config.config.CooldownWhitelistExempt ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.CooldownWhitelistExempt ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div id="settings-display" className="settings-card bg-white/5 p-6 rounded-xl border border-white/10 space-y-5 mb-6">
                                        <div className="border-b border-white/10 pb-3">
                                            <h3 className="text-sm font-bold text-violet-200">点歌与展示</h3>
                                            <p className="mt-1 text-[11px] text-gray-500">调整播放衔接、封面显示与通知条样式。</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-2">空闲时点歌行为</label>
                                                <select
                                                    value={config.config.IdleWaitNext === false ? 'false' : 'true'}
                                                    onChange={e => setConfig({...config, config: {...config.config, IdleWaitNext: e.target.value === 'true'}})}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="true">登记播放器下一首守卫（等当前播完）</option>
                                                    <option value="false">立即强行切歌播放</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-2">点歌全部播完后</label>
                                                <select
                                                    value={config.config.PauseAfterRequests === true ? 'pause' : 'continue'}
                                                    onChange={e => setConfig({...config, config: {...config.config, PauseAfterRequests: e.target.value === 'pause'}})}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="continue">继续播放主播歌单（默认）</option>
                                                    <option
                                                        value="pause"
                                                        disabled={config.playerSnapshot?.capabilities?.pause === false}
                                                    >
                                                        最后一首点歌结束后暂停播放器
                                                    </option>
                                                </select>
                                                {config.playerSnapshot?.capabilities?.pause === false && (
                                                    <span className="text-xs text-yellow-400 block mt-1.5">
                                                        当前播放器连接器无法保证明确暂停，将继续播放主播歌单。
                                                    </span>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-2">点歌图片显示</label>
                                                <select
                                                    value={config.config.RequestedSongArtwork === 'song_cover' ? 'song_cover' : 'bili_avatar'}
                                                    onChange={e => setConfig({...config, config: {...config.config, RequestedSongArtwork: e.target.value}})}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="bili_avatar">B站点歌人头像（默认）</option>
                                                    <option value="song_cover">播放器歌曲封面</option>
                                                </select>
                                                <span className="text-xs text-gray-500 block mt-1.5">主播歌单始终显示歌曲封面</span>
                                            </div>

                                            <div>
                                                <BoundedRange
                                                    label="顶部通知停留时长"
                                                    value={Number(config.config.OverlayNoticeDurationMs ?? 5000)}
                                                    minimum={1000}
                                                    maximum={15000}
                                                    step={100}
                                                    minimumLabel="1 秒"
                                                    maximumLabel="15 秒"
                                                    formatValue={value => `${Number((value / 1000).toFixed(1))} 秒`}
                                                    onChange={value => updateBoundedConfigValue('OverlayNoticeDurationMs', value)}
                                                    onCommit={value => commitBoundedConfigValue('OverlayNoticeDurationMs', value)}
                                                    onEditingChange={handleRangeEditingChange}
                                                />
                                                <span className="text-xs text-gray-500 block mt-1.5">应用于顶部成功/失败通知条，建议 3–7 秒。</span>
                                            </div>

                                            <div>
                                                <BoundedRange
                                                    label="顶部通知条宽度"
                                                    value={Number(config.config.OverlayNoticeWidthPx ?? 720)}
                                                    minimum={280}
                                                    maximum={1200}
                                                    step={10}
                                                    minimumLabel="280 px"
                                                    maximumLabel="1200 px"
                                                    formatValue={value => `${value} px`}
                                                    onChange={value => updateBoundedConfigValue('OverlayNoticeWidthPx', value)}
                                                    onCommit={value => commitBoundedConfigValue('OverlayNoticeWidthPx', value)}
                                                    onEditingChange={handleRangeEditingChange}
                                                />
                                                <span className="text-xs text-gray-500 block mt-1.5">控制通知条的最大宽度，建议 360–760 px。</span>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-2">顶部通知条主题</label>
                                                <select
                                                    value={config.config.OverlayNoticeTheme === 'light' ? 'light' : 'dark'}
                                                    onChange={e => setConfig({...config, config: {...config.config, OverlayNoticeTheme: e.target.value === 'light' ? 'light' : 'dark'}})}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="dark">深色主题</option>
                                                    <option value="light">浅色主题</option>
                                                </select>
                                                <span className="text-xs text-gray-500 block mt-1.5">影响顶部成功/失败通知条的底色、边框和文字亮度。</span>
                                            </div>

                                            <div>
                                                <BoundedRange
                                                    label="顶部通知条透明度"
                                                    value={Number(config.config.OverlayNoticeOpacity ?? 0.94)}
                                                    minimum={0}
                                                    maximum={1}
                                                    step={0.05}
                                                    minimumLabel="透明"
                                                    maximumLabel="不透明"
                                                    formatValue={value => `${Math.round(value * 100)}%`}
                                                    onChange={value => updateBoundedConfigValue('OverlayNoticeOpacity', Number(value.toFixed(2)))}
                                                    onCommit={value => commitBoundedConfigValue('OverlayNoticeOpacity', Number(value.toFixed(2)))}
                                                    onEditingChange={handleRangeEditingChange}
                                                />
                                                <span className="text-xs text-gray-500 block mt-1.5">只控制通知卡片主体，文字、头像和状态标记保持清晰。</span>
                                                <div className="mt-2.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
                                                    <span className="font-bold text-amber-300">OBS 浅色半透明提示：</span>
                                                    若降低透明度后卡片发灰，请在 OBS 中右键该浏览器源，将“混合方式”设为“SRGB Off”；“混合模式”保持“普通”。
                                                </div>
                                            </div>

                                            <div className="flex flex-col justify-center pt-3">
                                                <div className="flex justify-between items-center gap-4 bg-black/30 border border-white/10 rounded-lg p-3">
                                                    <div>
                                                        <label className="block text-sm text-white font-medium">同一用户只能同时点一首</label>
                                                        <span className="text-xs text-gray-500 block mt-1">开启后，用户上一首仍在队列中或正在播放时，新点歌会被拒绝</span>
                                                    </div>
                                                    <button onClick={() => persistSysConfigNow({...config.config, SinglePendingRequestPerUser: !config.config.SinglePendingRequestPerUser})} className={`w-10 h-6 rounded-full p-1 transition-colors shrink-0 ${config.config.SinglePendingRequestPerUser ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.SinglePendingRequestPerUser ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </button>
                                                </div>
                                                <label className={`flex items-center gap-2 mt-2 text-xs ${config.config.SinglePendingRequestPerUser ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    <input
                                                        type="checkbox"
                                                        disabled={!config.config.SinglePendingRequestPerUser}
                                                        checked={config.config.SinglePendingRequestWhitelistExempt === true}
                                                        onChange={e => persistSysConfigNow({...config.config, SinglePendingRequestWhitelistExempt: e.target.checked})}
                                                        className="w-4 h-4"
                                                    />
                                                    白名单用户不受此限制
                                                </label>
                                            </div>

                                            <div className="flex flex-col justify-center pt-3">
                                                <div className="flex justify-between items-center gap-4 bg-black/30 border border-white/10 rounded-lg p-3">
                                                    <div>
                                                        <label className="block text-sm text-white font-medium">显示播放器当前歌曲</label>
                                                        <span className="text-xs text-gray-500 block mt-1">没有点歌时，以淡蓝色卡片显示主播歌单歌曲</span>
                                                    </div>
                                                    <button onClick={() => setConfig({...config, config: {...config.config, ShowPlayerCurrentTrack: !config.config.ShowPlayerCurrentTrack}})} className={`w-10 h-6 rounded-full p-1 transition-colors shrink-0 ${config.config.ShowPlayerCurrentTrack ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.ShowPlayerCurrentTrack ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col justify-center pt-3">
                                                <div className="flex justify-between items-center bg-black/30 border border-white/10 rounded-lg p-3">
                                                    <div>
                                                        <label className="block text-sm text-white font-medium">记录所有弹幕日志</label>
                                                        <span className="text-xs text-gray-500 block mt-1">用于在日志排错抓取</span>
                                                    </div>
                                                    <button onClick={() => setConfig({...config, config: {...config.config, ShowAllDanmaku: !config.config.ShowAllDanmaku}})} className={`w-10 h-6 rounded-full p-1 transition-colors ${config.config.ShowAllDanmaku ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.ShowAllDanmaku ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div id="settings-api" className="settings-card bg-white/5 p-6 rounded-xl border border-cyan-500/20 space-y-5 mb-6">
                                        <div className="border-b border-white/10 pb-3">
                                            <h3 className="text-sm font-bold text-cyan-300">外部只读接口</h3>
                                            <p className="text-[11px] text-gray-500 mt-1">供 OBS 插件或其他工具读取当前歌曲与待播队列，仅监听本机 127.0.0.1。</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="flex justify-between items-center bg-black/30 border border-white/10 rounded-lg p-3">
                                                <div>
                                                    <label className="block text-sm text-white font-medium">HTTP API</label>
                                                    <span className="text-xs text-gray-500">GET /api/v1/state</span>
                                                </div>
                                                <button onClick={() => setConfig({...config, config: {...config.config, ExternalHttpEnabled: !config.config.ExternalHttpEnabled}})} className={`w-10 h-6 rounded-full p-1 transition-colors ${config.config.ExternalHttpEnabled ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.ExternalHttpEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                </button>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/30 border border-white/10 rounded-lg p-3">
                                                <div>
                                                    <label className="block text-sm text-white font-medium">WebSocket 推送</label>
                                                    <span className="text-xs text-gray-500">状态变化时推送 /ws</span>
                                                </div>
                                                <button onClick={() => setConfig({...config, config: {...config.config, ExternalWebSocketEnabled: !config.config.ExternalWebSocketEnabled}})} className={`w-10 h-6 rounded-full p-1 transition-colors ${config.config.ExternalWebSocketEnabled ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.config.ExternalWebSocketEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">本地监听端口</label>
                                            <input
                                                type="number"
                                                min="1024"
                                                max="65535"
                                                value={config.config.ExternalApiPort || 5556}
                                                onChange={e => setConfig({...config, config: {...config.config, ExternalApiPort: parseInt(e.target.value) || 5556}})}
                                                className="w-32 bg-black/30 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none"
                                            />
                                            <div className="text-xs text-gray-500 mt-2 font-mono break-all">
                                                HTTP: http://127.0.0.1:{config.config.ExternalApiPort || 5556}/api/v1/state<br/>
                                                WebSocket: ws://127.0.0.1:{config.config.ExternalApiPort || 5556}/ws<br/>
                                                OBS 示例: http://127.0.0.1:{config.config.ExternalApiPort || 5556}/overlay/
                                            </div>
                                        </div>
                                    </div>

                                    <div id="settings-permissions" className={`settings-card bg-white/5 p-6 rounded-xl border border-white/10 space-y-5 mb-6 relative ${!config.biliLogin ? 'opacity-50' : ''}`}>
                                        <div className="border-b border-white/10 pb-3">
                                            <h3 className="text-sm font-bold text-amber-300">用户白名单</h3>
                                            <p className="mt-1 text-[11px] text-gray-500">管理可以绕过部分限制或执行高级操作的 B站用户。</p>
                                        </div>
                                        <p className="text-sm text-gray-500">超级用户会无视冷却时间和所有点歌、切歌权限限制。主播本人不会自动获得该权限，如有需要请手动添加 UID。</p>
                                        {!config.biliLogin && <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">游客模式下不可用，请先扫码登录。</div>}

                                        <div className="flex gap-3">
                                            <input
                                                disabled={!config.biliLogin}
                                                type="text"
                                                inputMode="numeric"
                                                value={superUserInput}
                                                onChange={e => setSuperUserInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && addSuperUser()}
                                                className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-blue-500 outline-none"
                                                placeholder="输入需要特权的 B站 UID..."
                                            />
                                            <button disabled={!config.biliLogin} onClick={addSuperUser} className="px-6 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-md rounded-lg font-bold transition-colors disabled:cursor-not-allowed">添加</button>
                                        </div>

                                        <div className="flex flex-wrap gap-3 mt-3">
                                            {!(config.config.SuperUsers?.length > 0) ? (
                                                <span className="text-sm text-gray-600 italic">暂无超级用户</span>
                                            ) : (
                                                config.config.SuperUsers.map((su: string | number) => (
                                                    <div key={String(su)} className="bg-white/10 border border-white/20 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                                                        <span className="font-mono">{String(su)}</span>
                                                        <button disabled={!config.biliLogin} onClick={() => removeSuperUser(su)} className="text-red-400 hover:text-red-300 font-bold ml-1 disabled:cursor-not-allowed">✕</button>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className="border-t border-white/10 pt-5 space-y-4">
                                            <div>
                                                <h4 className="text-sm font-bold text-cyan-300">规则白名单 UID</h4>
                                                <p className="text-xs text-gray-500 mt-1">这里配置 B站 UID；是否豁免由每条点歌规则自己的开关决定。</p>
                                            </div>
                                            <div className="flex gap-3">
                                                <input
                                                    disabled={!config.biliLogin}
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={requestWhitelistInput}
                                                    onChange={e => setRequestWhitelistInput(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && addRequestWhitelistUser()}
                                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2.5 text-md text-white focus:border-cyan-500 outline-none"
                                                    placeholder="输入 B站 UID..."
                                                />
                                                <button disabled={!config.biliLogin} onClick={addRequestWhitelistUser} className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white text-md rounded-lg font-bold transition-colors disabled:cursor-not-allowed">添加</button>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                {!(config.config.RequestWhitelistUsers?.length > 0) ? (
                                                    <span className="text-sm text-gray-600 italic">暂无规则白名单用户</span>
                                                ) : (
                                                    config.config.RequestWhitelistUsers.map((uid: string | number) => (
                                                        <div key={String(uid)} className="bg-cyan-500/10 border border-cyan-400/20 text-cyan-100 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                                                            <span className="font-mono">{String(uid)}</span>
                                                            <button disabled={!config.biliLogin} onClick={() => removeRequestWhitelistUser(uid)} className="text-red-400 hover:text-red-300 font-bold ml-1 disabled:cursor-not-allowed">✕</button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`settings-card bg-white/5 p-6 rounded-xl border border-white/10 ${!config.biliLogin ? 'opacity-50' : ''}`}>
                                        <div className="mb-5 border-b border-white/10 pb-3">
                                            <h3 className="text-sm font-bold text-emerald-300">弹幕指令权限</h3>
                                            <p className="mt-1 text-[11px] text-gray-500">按指令类型设置房管、白名单、舰队与粉丝牌门槛。</p>
                                        </div>
                                        {!config.biliLogin && <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-5">游客模式固定使用基础权限，以下自定义设置暂不可用。</div>}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {permTypes.map(pt => {
                                                const pData = config.config[pt.key] || { AllowManager: true, MinGuardType: (pt.key === 'ForceControlPermission' ? -1 : 0), MinMedalLevel: 0 };

                                                return (
                                                    <div key={pt.key} className="bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col gap-4">
                                                        <div className="font-bold text-white text-md border-b border-white/5 pb-2">{pt.label}</div>

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-300">允许房管无视限制</span>
                                                            <button disabled={!config.biliLogin} onClick={() => updatePermission(pt.key, 'AllowManager', !pData.AllowManager)} className={`w-10 h-6 rounded-full p-1 transition-colors disabled:cursor-not-allowed ${pData.AllowManager ? 'bg-green-600' : 'bg-gray-600'}`}>
                                                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${pData.AllowManager ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                            </button>
                                                        </div>

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-300">允许规则白名单无视限制</span>
                                                            <button disabled={!config.biliLogin} onClick={() => persistSysConfigNow({...config.config, [pt.key]: {...pData, AllowWhitelist: !pData.AllowWhitelist}})} className={`w-10 h-6 rounded-full p-1 transition-colors disabled:cursor-not-allowed ${pData.AllowWhitelist ? 'bg-cyan-600' : 'bg-gray-600'}`}>
                                                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${pData.AllowWhitelist ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                            </button>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs text-gray-500 mb-1.5">最低航海舰队要求</label>
                                                            <select
                                                                disabled={!config.biliLogin}
                                                                value={pData.MinGuardType}
                                                                onChange={e => updatePermission(pt.key, 'MinGuardType', parseInt(e.target.value))}
                                                                className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none cursor-pointer"
                                                            >
                                                                <option value="0">无限制 (所有人)</option>
                                                                <option value="3">舰长 及以上</option>
                                                                <option value="2">提督 及以上</option>
                                                                <option value="1">仅限 总督</option>
                                                                <option value="-1">仅限 房管和超级用户</option>
                                                            </select>
                                                        </div>

                                                        <BoundedRange
                                                            label="最低粉丝牌等级"
                                                            value={Number(pData.MinMedalLevel ?? 0)}
                                                            minimum={0}
                                                            maximum={40}
                                                            step={1}
                                                            minimumLabel="无限制"
                                                            maximumLabel="Lv.40"
                                                            formatValue={value => value === 0 ? '无限制' : `Lv.${value}`}
                                                            disabled={!config.biliLogin}
                                                            onChange={value => updatePermission(pt.key, 'MinMedalLevel', value)}
                                                            onCommit={value => persistSysConfigNow({
                                                                ...config.config,
                                                                [pt.key]: {
                                                                    ...pData,
                                                                    MinMedalLevel: value
                                                                }
                                                            })}
                                                            onEditingChange={handleRangeEditingChange}
                                                            />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'login' && (
                                <div className="space-y-6 animate-slide-in-right flex flex-col items-center pt-10">
                                    <h2 className="text-2xl font-bold text-white mb-2 self-start w-full max-w-md">B站账号授权</h2>
                                    <div className="bg-white/5 p-8 rounded-2xl border border-white/10 flex flex-col items-center justify-center w-full max-w-md text-center shadow-xl">

                                        {config.biliLogin ? (
                                            <div className="mb-6 w-full bg-green-500/20 border border-green-500/40 p-4 rounded-xl text-green-400 font-medium text-sm leading-relaxed">
                                                已检测到有效的账号登录缓存 <br/> (UID: {config.uid}) <br/><br/> 您可直接前往「运行状态」切换房间号！
                                            </div>
                                        ) : (
                                            <div className="mb-6 w-full bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-xl text-cyan-200 font-medium text-sm leading-relaxed">
                                                当前为游客模式，可直接使用普通点歌。扫码登录是可选项，用于启用超级用户白名单和自定义权限控制。
                                            </div>
                                        )}

                                        {qrState.base64 ? (
                                            <div className="bg-white p-3 rounded-2xl shadow-2xl mb-6"><img src={qrState.base64} alt="Bilibili Login QR" className="w-48 h-48" /></div>
                                        ) : (
                                            <div className="w-48 h-48 bg-black/30 rounded-2xl mb-6 flex items-center justify-center text-6xl border border-white/5">📱</div>
                                        )}

                                        <h3 className="text-md text-white font-bold mb-5">{qrState.message}</h3>
                                        <div className={`grid gap-3 w-full ${config.biliLogin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            <button onClick={startQrLogin} disabled={qrState.loading} className="px-5 py-3 bg-[#fb7299] hover:bg-[#ff85a8] text-white text-sm rounded-xl font-bold shadow-lg disabled:opacity-50 transition-colors w-full">
                                                {config.biliLogin ? '扫码更换账号' : (qrState.loading ? '正在获取...' : '点击获取登录二维码')}
                                            </button>
                                            {config.biliLogin && (
                                                <button onClick={logoutBili} className="px-5 py-3 bg-red-600/20 hover:bg-red-600/35 border border-red-500/40 text-red-300 text-sm rounded-xl font-bold shadow-lg transition-colors w-full">
                                                    退出当前账号
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                                            登录凭据仅保存在本地。需要白名单或权限分级时，扫码登录<strong className="text-pink-400">任意普通B站账号</strong>即可，不要求必须是主播账号。
                                        </p>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const params = new URLSearchParams(window.location.search);
    const isAdmin = params.get('admin') === 'true';
    const view = params.get('view');

    if (isAdmin) {
        return (
            <>
                <GlobalStyles />
                <div style={{ background: '#0d1117', minHeight: '100vh' }}>
                    <AdminWidget />
                </div>
            </>
        );
    }

    if (view === 'success-banner') {
        return (
            <>
                <GlobalStyles />
                <SuccessBannerOverlay />
            </>
        );
    }

    return (
        <>
            <GlobalStyles />
            <OverlayWidget onToggleAdmin={() => {
                if (isElectron) electronAPI?.openAdmin();
            }}/>
        </>
    );
};

export default App;
