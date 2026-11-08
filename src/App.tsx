import React, { useState, useEffect, useRef, useCallback } from 'react';
import { extractErrorMessage, isQuotaError } from './lib/aiErrors';
import { AiService } from './services/aiService';
import { isGroqConfigured } from './services/groqService';
import {
  GenerationState,
  GeneratedResult,
  QualityLevel,
  SenseiMessage,
  CharacterDesign,
  User,
  StoredUser,
  AppSettings,
  ArtStyle,
  LightingStyle,
  CompositionStyle
} from './types';
import CharacterSheet from './components/CharacterSheet';
import {
  loadHistory,
  persistHistory,
  loadSavedScrolls,
  persistSavedScrolls,
  loadDraft,
  persistDraft,
  migrateLocalStorageToIdb,
  buildBackup,
  parseBackup,
  createId,
} from './lib/storage';
import { hashPassword, verifyPassword, isPlausibleEmail } from './lib/authCrypto';
import { decodeShareHash } from './lib/shareCodec';
import { themeAudioScript } from './lib/prompts';
import { generateSpectralPortrait, generateSpectralEnvironment } from './lib/spectralPortrait';

const QUALITY_INFO: Record<QualityLevel, string> = {
  GENIN: 'GENIN · flux · fast · 512px',
  CHUNIN: 'CHUNIN · flux · 768px · high detail',
  JONIN: 'JONIN · flux · 1024px · master detail',
};

// Demo-only admin account, configured at build time (never commit real credentials).
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() || undefined;
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || undefined;
const ADMIN_CONFIGURED = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const USERS_KEY = 'aaruto_all_users';
const SETTINGS_KEY = 'aaruto_settings';
const USER_KEY = 'aaruto_user';
const LOGIN_COUNT_KEY = 'aaruto_login_count';

const readStoredUsers = (): StoredUser[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const DEFAULT_SETTINGS: AppSettings = {
  autoSave: true,
  resolution: '1024',
  artStyle: 'Classic Anime',
  lighting: 'Cinematic',
  composition: 'Dynamic Pose'
};

type NotificationKind = 'success' | 'error' | 'info';
interface Notification {
  id: number;
  msg: string;
  kind: NotificationKind;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<QualityLevel>('GENIN');
  const [state, setState] = useState<GenerationState>(GenerationState.IDLE);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [history, setHistory] = useState<GeneratedResult[]>([]);
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'list'>('grid');
  const [savedScrolls, setSavedScrolls] = useState<GeneratedResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loginCount, setLoginCount] = useState<number>(0);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImmersiveImage, setShowImmersiveImage] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [connectionDetail, setConnectionDetail] = useState<string>('');

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [showSensei, setShowSensei] = useState(false);
  const [senseiThinking, setSenseiThinking] = useState(false);
  const [messages, setMessages] = useState<SenseiMessage[]>([
    { role: 'sensei', text: "Welcome to AARUTO_ANIME.AI. Manifest your vision with god-tier precision." }
  ]);
  const [senseiInput, setSenseiInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const notifyTimeout = useRef<number | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement>(null);

  const ai = useRef(new AiService());

  const showNotify = useCallback((msg: string, kind: NotificationKind = 'info') => {
    window.clearTimeout(notifyTimeout.current);
    setNotification({ id: Date.now(), msg, kind });
    notifyTimeout.current = window.setTimeout(() => setNotification(null), 3500);
  }, []);

  // Insert or update a record in history (keyed by stable id).
  const upsertHistory = useCallback((item: GeneratedResult) => {
    setHistory(prev => [item, ...prev.filter(x => x.id !== item.id)].slice(0, 30));
  }, []);

  // ---- Startup: migrate legacy localStorage → IndexedDB, load persisted data, check for share hash ----
  useEffect(() => {
    let cancelled = false;

    const savedUser = localStorage.getItem(USER_KEY);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    const savedLoginCount = localStorage.getItem(LOGIN_COUNT_KEY);
    if (savedLoginCount) {
      const n = parseInt(savedLoginCount, 10);
      if (!Number.isNaN(n)) setLoginCount(n);
    }
    const savedSettingsLocal = localStorage.getItem(SETTINGS_KEY);
    if (savedSettingsLocal) {
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettingsLocal) }); } catch (e) { console.warn('[settings] ignoring corrupt settings', e); }
    }

    // Shared-chronicle import: #/summon/<base64url(design)>
    const imported = decodeShareHash(window.location.hash);
    if (imported) {
      setResult({
        id: createId(),
        imageUrl: '',
        design: imported,
        timestamp: Date.now(),
        quality: 'GENIN',
        artStyle: DEFAULT_SETTINGS.artStyle,
        lighting: DEFAULT_SETTINGS.lighting,
        composition: DEFAULT_SETTINGS.composition,
        resolution: DEFAULT_SETTINGS.resolution,
      });
      showNotify('Shared chronicle loaded. MANIFEST to re-materialize it.', 'info');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    (async () => {
      try {
        await migrateLocalStorageToIdb();
        const [h, s, draft] = await Promise.all([loadHistory(), loadSavedScrolls(), loadDraft()]);
        if (cancelled) return;
        setHistory(h);
        setSavedScrolls(s);
        // A share-link import wins over the autosaved draft.
        if (draft && !imported) setResult(draft);
      } catch (err) {
        console.error('[storage] failed to load persisted data', err);
        showNotify('Could not open local archive (IndexedDB unavailable?). History will not persist.', 'error');
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Persist history / scrolls to IndexedDB (gated on initial load) ----
  useEffect(() => {
    if (!storageReady) return;
    persistHistory(history).catch(err => {
      console.error('[storage] failed to persist history', err);
      showNotify('History could not be saved (storage full?).', 'error');
    });
  }, [history, storageReady, showNotify]);

  useEffect(() => {
    if (!storageReady) return;
    persistSavedScrolls(savedScrolls).catch(err => {
      console.error('[storage] failed to persist scrolls', err);
      showNotify('Scrolls could not be saved (storage full?).', 'error');
    });
  }, [savedScrolls, storageReady, showNotify]);

  // ---- Auto-save the current manifestation every minute ----
  useEffect(() => {
    if (!settings.autoSave || !result || !storageReady) return;
    const interval = window.setInterval(() => {
      persistDraft(result).catch(err => console.error('[storage] draft autosave failed', err));
    }, 60000);
    return () => window.clearInterval(interval);
  }, [result, settings.autoSave, storageReady]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => window.clearTimeout(notifyTimeout.current), []);

  const incrementLoginCount = () => {
    setLoginCount(prev => {
      const n = prev + 1;
      localStorage.setItem(LOGIN_COUNT_KEY, String(n));
      return n;
    });
  };

  const notifyError = useCallback((err: unknown, fallback: string) => {
    console.error(fallback, err);
    const detail = extractErrorMessage(err);
    showNotify(detail && detail !== '{}' ? `${fallback}: ${detail}` : fallback, 'error');
  }, [showNotify]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!isPlausibleEmail(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Passkey must be at least 6 characters.');
      return;
    }
    setError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'LOGIN') {
        // Optional build-time demo admin account.
        if (ADMIN_CONFIGURED && cleanEmail === ADMIN_EMAIL!.toLowerCase()) {
          if (password === ADMIN_PASSWORD) {
            const u: User = { email: ADMIN_EMAIL!, isAdmin: true };
            setUser(u);
            localStorage.setItem(USER_KEY, JSON.stringify(u));
            incrementLoginCount();
            return;
          }
          setError('Mismatch. Access denied.');
          return;
        }
        const users = readStoredUsers();
        const found = users.find(u => u.email.toLowerCase() === cleanEmail);
        if (!found) {
          setError('No record bound to that identity.');
          return;
        }
        let ok = false;
        if (found.passwordHash) {
          ok = await verifyPassword(password, found.passwordHash);
        } else if (typeof found.password === 'string') {
          // Legacy plaintext account → verify once, then migrate to a hash.
          ok = found.password === password;
          if (ok) {
            found.passwordHash = await hashPassword(password);
            delete found.password;
            writeStoredUsers(users);
          }
        }
        if (!ok) {
          setError('Mismatch. Access denied.');
          return;
        }
        const u: User = { email: found.email, isAdmin: false };
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        incrementLoginCount();
      } else {
        if (ADMIN_CONFIGURED && cleanEmail === ADMIN_EMAIL!.toLowerCase()) {
          setError('This identity is reserved. Use the Sealed Entry instead.');
          return;
        }
        const users = readStoredUsers();
        if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
          setError('Identity already bound.');
          return;
        }
        const passwordHash = await hashPassword(password);
        writeStoredUsers([...users, { email: cleanEmail, passwordHash }]);
        const u: User = { email: cleanEmail, isAdmin: false };
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        incrementLoginCount();
      }
    } catch (err) {
      notifyError(err, 'Authentication failed');
      setError('Authentication subsystem error. See console for details.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(USER_KEY);
    setUser(null);
    showNotify('Session ended.', 'info');
  };

  const handleSummon = async (e?: React.FormEvent, promptOverride?: string) => {
    if (e) e.preventDefault();
    const text = (promptOverride ?? prompt).trim();
    if (!text || state !== GenerationState.IDLE) return;
    setError(null);

    // Stage 1 — design (text quota). A failure here aborts the summon.
    setState(GenerationState.GENERATING_DESIGN);
    let design: CharacterDesign;
    try {
      design = await ai.current.generateDesign(text);
    } catch (err) {
      notifyError(err, 'Manifestation failed');
      setState(GenerationState.IDLE);
      return;
    }

    // Stage 2 — image. Free tier has zero image quota, so on any failure we
    // manifest a local Spectral Sketch (deterministic SVG, no network/cost).
    setState(GenerationState.GENERATING_IMAGE);
    let imageUrl = '';
    let imageError: unknown = null;
    try {
      imageUrl = await ai.current.generateImage(design, quality, settings);
    } catch (err) {
      imageError = err;
      console.warn('[summon] image materialization failed — using Spectral Sketch fallback', err);
      imageUrl = generateSpectralPortrait(design);
    }

    const newResult: GeneratedResult = {
      id: createId(),
      imageUrl,
      design,
      timestamp: Date.now(),
      quality,
      artStyle: settings.artStyle,
      lighting: settings.lighting,
      composition: settings.composition,
      resolution: settings.resolution
    };
    setResult(newResult);
    upsertHistory(newResult);
    setState(GenerationState.IDLE);

    if (imageError) {
      showNotify(
        isQuotaError(imageError)
          ? 'Images unavailable (quota) — a Spectral Sketch was manifested instead (design preserved).'
          : 'Image failed — a Spectral Sketch was manifested instead (design preserved).',
        'info',
      );
    } else {
      showNotify('Manifestation successful.', 'success');
    }
    if (window.innerWidth < 768) setShowImmersiveImage(true);
  };

  const handleEvolve = async () => {
    if (!result || state !== GenerationState.IDLE) return;
    setState(GenerationState.EVOLVING);
    let evolved: CharacterDesign;
    try {
      evolved = await ai.current.evolveDesign(result.design);
    } catch (err) {
      notifyError(err, 'Evolution failed');
      setState(GenerationState.IDLE);
      return;
    }
    setState(GenerationState.GENERATING_IMAGE);
    let imageUrl = '';
    let imageError: unknown = null;
    try {
      imageUrl = await ai.current.generateImage(evolved, quality, settings);
    } catch (err) {
      imageError = err;
      console.warn('[evolve] image materialization failed — using Spectral Sketch fallback', err);
      imageUrl = generateSpectralPortrait(evolved);
    }
    const newResult: GeneratedResult = {
      ...result,
      id: createId(),
      design: evolved,
      imageUrl,
      timestamp: Date.now(),
      quality,
    };
    setResult(newResult);
    upsertHistory(newResult);
    setState(GenerationState.IDLE);
    if (imageError) {
      showNotify(
        isQuotaError(imageError)
          ? 'Ascension recorded — Pollinations unavailable, so a Spectral Sketch was manifested.'
          : 'Evolution image failed — a Spectral Sketch was manifested.',
        'info',
      );
      return;
    }
    if (window.innerWidth < 768) setShowImmersiveImage(true);
    showNotify('Ascension complete.', 'success');
  };

  const handleGenEnv = async () => {
    if (!result || state !== GenerationState.IDLE) return;
    setState(GenerationState.GENERATING_ENV);
    let envImageUrl: string;
    let envError: unknown = null;
    try {
      envImageUrl = await ai.current.generateImage(result.design, quality, settings, 'environment');
    } catch (err) {
      envError = err;
      console.warn('[world] environment image failed — using Spectral Sketch environment fallback', err);
      envImageUrl = generateSpectralEnvironment(result.design);
    }
    const newResult: GeneratedResult = { ...result, envImageUrl };
    setResult(newResult);
    // Update the same history record — never prepend a duplicate.
    setHistory(prev => prev.map(item => item.id === newResult.id ? newResult : item));
    setSavedScrolls(prev => prev.map(item => item.id === newResult.id ? newResult : item));
    if (window.innerWidth < 768) setShowImmersiveImage(true);
    if (envError) {
      showNotify(
        isQuotaError(envError)
          ? 'Images unavailable — a Spectral Sketch environment was manifested instead.'
          : 'World image failed — a Spectral Sketch environment was manifested.',
        'info',
      );
    } else {
      showNotify('World manifested.', 'success');
    }
    setState(GenerationState.IDLE);
  };

  const speakWithDeviceVoice = (text: string) =>
    new Promise<void>((resolve, reject) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        reject(new Error('Web Speech API unavailable in this browser.'));
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.92;
      utter.pitch = 0.75;
      utter.volume = 1;
      const voices = synth.getVoices();
      const preferred =
        voices.find((v) => /^en/i.test(v.lang) && /daniel|david|google us/i.test(v.name)) ??
        voices.find((v) => /^en(-|_)/i.test(v.lang)) ??
        voices[0];
      if (preferred) utter.voice = preferred;
      utter.onend = () => resolve();
      utter.onerror = (e) => reject(new Error(`speech synthesis failed: ${e.error}`));
      synth.cancel();
      synth.speak(utter);
    });

  const playBase64Audio = async (b64: string) => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API is not available in this browser.');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
    } finally {
      window.setTimeout(() => ctx.close().catch(() => undefined), 30_000);
    }
  };

  const handlePlayTheme = async () => {
    if (!result || state !== GenerationState.IDLE) return;
    setState(GenerationState.GENERATING_AUDIO);
    try {
      try {
        const { data } = await ai.current.generateThemeAudio(result.design);
        await playBase64Audio(data);
        showNotify('Theme resonating.', 'success');
      } catch (err) {
        // Orpheus TTS needs a one-time terms acceptance in the Groq console —
        // fall back to the browser's built-in voice so the feature never dead-ends.
        console.warn('[theme] Orpheus TTS unavailable, using device voice', err);
        await speakWithDeviceVoice(themeAudioScript(result.design));
        showNotify('Theme resonating (device voice — accept the Orpheus terms in Groq console for studio audio).', 'info');
      }
    } catch (err) {
      notifyError(err, 'Audio resonance failed');
    } finally {
      setState(GenerationState.IDLE);
    }
  };

  const saveToScrolls = () => {
    if (!result || !result.imageUrl) {
      showNotify('Re-materialize this chronicle before archiving.', 'info');
      return;
    }
    const updated = [result, ...savedScrolls.filter(s => s.id !== result.id)].slice(0, 50);
    setSavedScrolls(updated);
    showNotify('Archived in the Eternal Scrolls.', 'success');
  };

  const clearHistory = () => {
    if (history.length === 0) return;
    if (!window.confirm('Purge the entire temporal history? This cannot be undone.')) return;
    setHistory([]);
    showNotify('History purged.', 'info');
  };

  const downloadImage = (url: string, name: string) => {
    const safe = (name || 'aaruto-character').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
    const isSvg = url.startsWith('data:image/svg+xml');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.${isSvg ? 'svg' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleTestConnection = async () => {
    setConnectionState('testing');
    setConnectionDetail('Pinging Groq…');
    const diagnostic = await ai.current.testConnection();
    const groqLine = !diagnostic.groq.configured
      ? 'Groq — not configured'
      : diagnostic.groq.ok
        ? 'Groq ✓ working'
        : `Groq ✗ ${diagnostic.groq.detail}`;
    const pollinationsLine = diagnostic.pollinations.configured
      ? 'Pollinations ✓ key set (flux)'
      : 'Pollinations — anonymous flux';
    const anyOk = diagnostic.groq.ok;
    setConnectionState(anyOk ? 'ok' : 'error');
    setConnectionDetail(`${groqLine}  ·  ${pollinationsLine}`);
  };

  const handleExportBackup = () => {
    try {
      const json = buildBackup(history, savedScrolls, settings);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aaruto-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showNotify('Backup exported.', 'success');
    } catch (err) {
      notifyError(err, 'Backup export failed');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      setHistory(backup.history);
      setSavedScrolls(backup.savedScrolls);
      setSettings(backup.settings);
      await Promise.all([persistHistory(backup.history), persistSavedScrolls(backup.savedScrolls)]);
      showNotify('Backup restored.', 'success');
    } catch (err) {
      notifyError(err, 'Backup import failed');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const artStyles: ArtStyle[] = [
    'Classic Anime', 'Ufotable Style', 'Studio Ghibli',
    'Cyberpunk Edge', 'Retro 90s', 'Ink Wash',
    'Realistic', 'Digital Concept', 'Fantasy Oil',
    'High-Impact Shonen', 'Vintage Manga'
  ];

  const lightingStyles: LightingStyle[] = [
    'Cinematic', 'Ethereal', 'Dramatic', 'Neon', 'Golden Hour', 'Cyber-Noir'
  ];

  // ============ AUTH SCREEN ============
  if (!user) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-6 bg-black relative">
        <div className="absolute inset-0 chakra-gradient opacity-10 blur-[120px]" />
        <div className="w-full max-w-sm glass p-10 rounded-[2.5rem] border-orange-500/20 text-center relative z-10 animate-in fade-in duration-700">
          <div className="w-20 h-20 chakra-gradient rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-45 shadow-[0_0_50px_rgba(255,107,0,0.3)]">
            <i className="fa-solid fa-atom text-white text-4xl -rotate-45"></i>
          </div>
          <h1 className="text-3xl font-bungee mb-10 tracking-tighter uppercase">AARUTO_<span className="chakra-text">ANIME.AI</span></h1>

          <form onSubmit={handleAuth} className="space-y-5">
            {error && (
              <div role="alert" className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                {error}
              </div>
            )}
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Access Email"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500/50 transition-all text-sm"
            />
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Soul Passkey"
              autoComplete={authMode === 'LOGIN' ? 'current-password' : 'new-password'}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500/50 transition-all text-sm"
            />
            <button type="submit" disabled={authBusy} className="w-full py-5 chakra-gradient rounded-2xl font-bungee text-white tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-orange-500/20 text-xs disabled:opacity-50">
              {authBusy ? 'CHANNELING…' : authMode === 'LOGIN' ? 'UNSEAL ENTRY' : 'MANIFEST IDENTITY'}
            </button>
          </form>

          <button
            onClick={() => { setAuthMode(authMode === 'LOGIN' ? 'SIGNUP' : 'LOGIN'); setError(null); }}
            className="mt-8 text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] hover:text-orange-500 transition-colors"
          >
            {authMode === 'LOGIN' ? 'Register new essence?' : 'Return to existing record?'}
          </button>
          <p className="mt-4 text-[9px] text-gray-700 uppercase tracking-[0.2em]">Demo accounts stored on this device only</p>
        </div>
      </div>
    );
  }

  // ============ MAIN APP ============
  return (
    <div className="h-screen w-screen flex flex-col font-space bg-black text-white relative overflow-hidden">
      <header className="flex-shrink-0 px-8 py-5 border-b border-white/5 glass flex items-center justify-between z-40">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 chakra-gradient rounded-xl flex items-center justify-center rotate-45 shadow-lg"><i className="fa-solid fa-bolt text-white text-lg -rotate-45"></i></div>
          <h1 className="text-xl font-bungee hidden md:block">AARUTO_<span className="chakra-text">ANIME.AI</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
             <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{user.isAdmin ? 'MASTER ARCHITECT' : 'SUMMONER'}</span>
             <div className="flex items-center gap-3">
              <span className="text-[9px] text-gray-500 truncate max-w-[150px]">{user.email}</span>
              <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Sessions: {loginCount}</span>
             </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} aria-label="Open engine parameters" className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/10"><i className="fa-solid fa-gear"></i></button>
          <button onClick={() => setShowSensei(!showSensei)} aria-label="Toggle Omni-Sensei chat" className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${showSensei ? 'bg-orange-500 text-white shadow-orange-500/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}><i className="fa-solid fa-comments"></i></button>
          <button onClick={handleLogout} className="text-[11px] text-red-500 font-black uppercase tracking-widest px-4 py-2 hover:bg-red-500/10 rounded-xl transition-all">OUT</button>
        </div>
      </header>

      {!isGroqConfigured() && (
        <div role="alert" className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-center z-30">
          Groq key missing — set the FREE VITE_GROQ_API_KEY in .env.local (console.groq.com/keys). Images still work free via Pollinations.
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-hidden">

        {/* Sidebar History */}
        <aside className="hidden lg:flex flex-col gap-8 w-80 h-full overflow-y-auto custom-scrollbar pr-3">
          <section>
             <div className="flex items-center justify-between mb-6">
                <h4 className="text-[11px] font-black uppercase text-gray-500 tracking-[0.3em]">Temporal History</h4>
                <div className="flex items-center gap-3">
                  <button onClick={() => setHistoryViewMode('grid')} aria-label="Grid view" className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${historyViewMode === 'grid' ? 'text-orange-500 bg-orange-500/10' : 'text-gray-500 hover:text-white'}`}><i className="fa-solid fa-table-cells-large"></i></button>
                  <button onClick={() => setHistoryViewMode('list')} aria-label="List view" className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${historyViewMode === 'list' ? 'text-orange-500 bg-orange-500/10' : 'text-gray-500 hover:text-white'}`}><i className="fa-solid fa-list-ul"></i></button>
                  <button onClick={clearHistory} aria-label="Purge history" className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors" title="Purge Records"><i className="fa-solid fa-trash-can"></i></button>
                </div>
             </div>

             {history.length === 0 ? (
               <div className="text-center py-16 opacity-20 border-2 border-dashed border-white/5 rounded-[2rem]">
                 <i className="fa-solid fa-hourglass-start text-3xl mb-4"></i>
                 <p className="text-[11px] font-black uppercase tracking-[0.3em]">History Empty</p>
               </div>
             ) : (
               <div className={historyViewMode === 'grid' ? "grid grid-cols-3 gap-3" : "flex flex-col gap-3"}>
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setResult(item);
                        if (window.innerWidth < 768) setShowImmersiveImage(true);
                      }}
                      className={`group relative overflow-hidden rounded-2xl border-2 transition-all ${result?.id === item.id ? 'border-orange-500 scale-105 shadow-[0_0_20px_rgba(255,107,0,0.3)] z-10' : 'border-white/5 opacity-50 hover:opacity-100'} ${historyViewMode === 'list' ? 'flex items-center gap-4 p-3 bg-white/5' : 'aspect-square'}`}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={`Manifestation of ${item.design.name}`} className={historyViewMode === 'list' ? "w-14 h-14 rounded-xl object-cover flex-shrink-0" : "w-full h-full object-cover"} />
                      ) : (
                        <div className={historyViewMode === 'list'
                          ? "w-14 h-14 rounded-xl bg-orange-600/10 flex items-center justify-center text-orange-500/60 flex-shrink-0"
                          : "w-full h-full flex items-center justify-center bg-orange-600/10 text-orange-500/60"}>
                          <i className="fa-solid fa-scroll"></i>
                        </div>
                      )}
                      {historyViewMode === 'list' && (
                        <div className="text-left min-w-0">
                          <p className="text-[11px] font-black uppercase truncate text-white">{item.design.name}</p>
                          <p className="text-[9px] font-bold text-gray-500 truncate tracking-widest">{item.design.title}</p>
                        </div>
                      )}
                    </button>
                  ))}
               </div>
             )}
          </section>

          <section>
             <div className="flex items-center justify-between mb-6">
                <h4 className="text-[11px] font-black uppercase text-gray-500 tracking-[0.3em]">Eternal Archive</h4>
                <span className="text-[9px] px-2 py-0.5 bg-white/5 rounded-full text-gray-400">{savedScrolls.length}</span>
             </div>
             <div className="space-y-3">
                {savedScrolls.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setResult(item);
                      if (window.innerWidth < 768) setShowImmersiveImage(true);
                    }}
                    className="group w-full flex items-center gap-4 p-3 bg-white/5 rounded-2xl border border-white/10 hover:border-orange-500/50 transition-all text-left"
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={`Archived manifestation of ${item.design.name}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-orange-600/10 flex items-center justify-center text-orange-500/60"><i className="fa-solid fa-scroll"></i></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-white truncate uppercase tracking-tight">{item.design.name}</p>
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{item.quality} Manifest</span>
                    </div>
                  </button>
                ))}
             </div>
          </section>
        </aside>

        <div className="flex-1 flex flex-col gap-6 max-w-6xl mx-auto w-full h-full">
          <div className="flex-shrink-0 flex items-center gap-4 overflow-x-auto no-scrollbar py-1">
            {(['GENIN', 'CHUNIN', 'JONIN'] as QualityLevel[]).map(q => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                title={QUALITY_INFO[q]}
                className={`px-8 py-3 rounded-2xl text-[11px] font-black tracking-[0.2em] whitespace-nowrap transition-all ${quality === q ? 'chakra-gradient text-white shadow-lg' : 'bg-white/5 text-gray-500 hover:text-white'}`}
              >{q}</button>
            ))}
          </div>

          <div className="flex-1 min-h-0 relative glass rounded-[3rem] overflow-hidden border-white/5 group shadow-2xl">
            {result ? (
              <div className="flex flex-col md:flex-row h-full overflow-y-auto custom-scrollbar">
                <div className="w-full md:w-5/12 h-96 md:h-full relative overflow-hidden flex-shrink-0">
                  {result.imageUrl ? (
                    <>
                      <img
                        src={result.imageUrl}
                        alt={`${result.design.name} — ${result.design.title}`}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform [transition-duration:5s]"
                        onClick={() => setShowImmersiveImage(true)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none" />
                      {result.imageUrl.startsWith('data:image/svg+xml') && (
                        <span className="absolute bottom-28 left-8 px-3 py-1.5 bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 rounded-lg text-[9px] font-black tracking-[0.25em] uppercase backdrop-blur">Spectral Sketch · Free</span>
                      )}
                      <div className="absolute bottom-8 left-8 right-8">
                        <h2 className="text-2xl md:text-3xl font-bungee text-white drop-shadow-2xl truncate leading-none mb-1">{result.design.name}</h2>
                        <p className="text-[11px] text-orange-500 font-black uppercase tracking-[0.3em]">{result.design.title} | Stage {result.design.evolutionStage}</p>
                      </div>
                      <button onClick={() => setShowImmersiveImage(true)} aria-label="Expand image" className="absolute top-6 right-6 bg-black/50 p-4 rounded-full text-white backdrop-blur md:hidden shadow-xl"><i className="fa-solid fa-expand"></i></button>
                      <button
                        onClick={() => downloadImage(result.imageUrl, result.design.name)}
                        aria-label="Download PNG"
                        title="Download PNG"
                        className="absolute top-6 left-6 bg-black/50 w-12 h-12 rounded-full text-white backdrop-blur flex items-center justify-center hover:bg-orange-600 transition-colors shadow-xl"
                      ><i className="fa-solid fa-download"></i></button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-6">
                      <i className="fa-solid fa-scroll text-6xl text-orange-500/40"></i>
                      <div>
                        <h2 className="text-2xl font-bungee text-white mb-2">{result.design.name}</h2>
                        <p className="text-[10px] text-orange-500 font-black uppercase tracking-[0.3em] mb-4">{result.design.title} | Stage {result.design.evolutionStage}</p>
                        <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">No image has been materialized for this chronicle — it may have been imported from a shared link, or the image call failed (e.g. quota). Your design is fully preserved — re-materialize it below.</p>
                      </div>
                      <button
                        onClick={() => handleSummon(undefined, `${result.design.name}, the ${result.design.title}. ${result.design.visualTraits}. From ${result.design.homeworld}. Powers: ${result.design.powers.join(', ')}.`)}
                        className="px-8 py-4 chakra-gradient rounded-2xl font-bungee text-[10px] tracking-[0.3em] text-white shadow-xl shadow-orange-600/20 hover:scale-105 transition-all"
                      >MANIFEST THIS CHRONICLE</button>
                    </div>
                  )}
                </div>
                <div className="flex-1 p-8 md:p-12">
                  <CharacterSheet
                    design={result.design}
                    onUpdate={(f, v) => setResult(prev => prev ? { ...prev, design: { ...prev.design, [f]: v } } : prev)}
                    ai={ai.current}
                    onEvolve={handleEvolve}
                    onGenEnv={handleGenEnv}
                    onPlayTheme={handlePlayTheme}
                    onNotify={showNotify}
                    isProcessing={state !== GenerationState.IDLE}
                  />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-32 h-32 md:w-48 md:h-48 relative mb-12">
                   <div className="absolute inset-0 chakra-gradient rounded-full opacity-20 blur-3xl animate-pulse" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fa-solid fa-dna text-6xl md:text-8xl text-orange-500/20"></i>
                   </div>
                </div>
                <h3 className="text-2xl md:text-3xl font-bungee mb-6 tracking-tight">Akashic Terminal Ready</h3>
                <p className="text-gray-500 text-sm max-w-sm font-bold uppercase tracking-[0.3em] leading-relaxed">Enter your visualization below to pull existence from the Multiverse.</p>
              </div>
            )}

            {state !== GenerationState.IDLE && (
              <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500 backdrop-blur-3xl">
                <div className="relative w-24 h-24 md:w-32 md:h-32 mb-10">
                   <div className="absolute inset-0 border-t-4 border-orange-500 rounded-full animate-spin" />
                   <div className="absolute inset-0 border-r-4 border-cyan-500 rounded-full animate-spin duration-1000" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fa-solid fa-atom text-4xl text-white animate-pulse"></i>
                   </div>
                </div>
                <p className="text-orange-500 font-bungee text-lg md:text-xl tracking-[0.5em] animate-pulse uppercase">
                  {state === GenerationState.GENERATING_DESIGN ? 'Reading Fate...' :
                   state === GenerationState.EVOLVING ? 'Transmuting...' :
                   state === GenerationState.GENERATING_IMAGE ? 'Realizing Form...' :
                   state === GenerationState.GENERATING_AUDIO ? 'Tuning Resonance...' : 'Constructing World...'}
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleSummon} className="flex-shrink-0 flex flex-col md:flex-row gap-4 p-5 glass rounded-[2.5rem] border-white/10 mb-4 shadow-2xl">
            <input
              type="text" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Whisper a legend into the void..."
              aria-label="Character prompt"
              className="flex-1 bg-transparent px-6 text-lg font-bold outline-none placeholder:text-gray-700" disabled={state !== GenerationState.IDLE}
            />
            <button type="submit" className="h-16 px-12 chakra-gradient rounded-2xl font-bungee tracking-[0.3em] text-sm text-white disabled:opacity-50 hover:scale-[1.03] transition-all shadow-xl shadow-orange-500/10" disabled={state !== GenerationState.IDLE || !prompt.trim()}>MANIFEST</button>
          </form>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-3xl glass p-10 md:p-14 rounded-[3.5rem] border-white/10 relative shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setShowSettings(false)} aria-label="Close settings" className="absolute top-10 right-10 w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl text-gray-400 hover:text-white transition-all"><i className="fa-solid fa-xmark text-xl"></i></button>
            <h2 className="text-3xl font-bungee mb-12 tracking-wider uppercase">Engine_<span className="chakra-text">Parameters</span></h2>

            <div className="space-y-10">
              <div className="flex items-center justify-between gap-4 p-6 bg-white/5 rounded-[2rem] border border-white/5">
                <div className="min-w-0">
                   <h4 className="text-lg font-bold text-white mb-1">Connection Diagnostic</h4>
                   <p className={`text-[11px] uppercase font-black tracking-widest break-words ${
                     connectionState === 'ok' ? 'text-emerald-400' :
                     connectionState === 'error' ? 'text-red-400' : 'text-gray-500'
                   }`}>
                     {connectionDetail || 'Ping Groq and check Pollinations status'}
                   </p>
                </div>
                <button onClick={handleTestConnection} disabled={connectionState === 'testing'} className="flex-shrink-0 px-6 py-4 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-600 hover:text-white transition-all disabled:opacity-50">
                  {connectionState === 'testing' ? 'TESTING…' : connectionState === 'ok' ? '✓ WORKING' : 'TEST KEY'}
                </button>
              </div>

              <div className="flex items-center justify-between p-6 bg-white/5 rounded-[2rem] border border-white/5">
                <div>
                   <h4 className="text-lg font-bold text-white mb-1">Temporal Sync</h4>
                   <p className="text-[11px] text-gray-500 uppercase font-black tracking-widest">Auto-save current manifestation</p>
                </div>
                <button onClick={() => setSettings({...settings, autoSave: !settings.autoSave})} role="switch" aria-checked={settings.autoSave} aria-label="Toggle auto-save" className={`w-14 h-7 rounded-full relative transition-all ${settings.autoSave ? 'bg-orange-600' : 'bg-white/10'}`}><div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.autoSave ? 'right-1' : 'left-1'}`} /></button>
              </div>

              <div className="space-y-6">
                 <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 ml-2">Artistic Paradigm</h4>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {artStyles.map(s => (
                      <button key={s} onClick={() => setSettings({...settings, artStyle: s})} className={`py-4 px-3 rounded-2xl text-[10px] font-black uppercase transition-all ${settings.artStyle === s ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'}`}>{s}</button>
                    ))}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 ml-2">Spectral Resolution</h4>
                  <div className="flex gap-3">
                    {['512', '1024', '2048'].map(r => (
                      <button key={r} onClick={() => setSettings({...settings, resolution: r as AppSettings['resolution']})} className={`flex-1 py-4 rounded-2xl text-[11px] font-black transition-all ${settings.resolution === r ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}>{r}px</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 ml-2">Lighting Frequency</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {lightingStyles.map(l => (
                      <button key={l} onClick={() => setSettings({...settings, lighting: l})} className={`py-3 px-2 rounded-xl text-[9px] font-black uppercase transition-all ${settings.lighting === l ? 'bg-orange-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 ml-2">Lens Composition</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                   {['Dynamic Pose', 'Portrait', 'Wide Shot', 'Epic Low Angle', 'Close-up Detail'].map(c => (
                     <button key={c} onClick={() => setSettings({...settings, composition: c as CompositionStyle})} className={`py-3 px-2 rounded-xl text-[9px] font-black uppercase transition-all ${settings.composition === c ? 'bg-orange-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>{c}</button>
                   ))}
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 ml-2">Backup & Restore</h4>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={handleExportBackup} className="flex-1 py-4 px-6 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:border-orange-500/40 transition-all flex items-center justify-center gap-3"><i className="fa-solid fa-file-arrow-down text-orange-500"></i>Export Backup</button>
                  <button onClick={() => importInputRef.current?.click()} className="flex-1 py-4 px-6 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:border-cyan-500/40 transition-all flex items-center justify-center gap-3"><i className="fa-solid fa-file-arrow-up text-cyan-500"></i>Import Backup</button>
                  <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportBackup} className="hidden" aria-hidden="true" tabIndex={-1} />
                </div>
                <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] ml-2">Backs up temporal history, eternal scrolls and engine parameters as JSON.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sensei Sidebar */}
      <div className={`fixed top-0 right-0 w-full md:w-[450px] h-full z-[120] bg-[#080808] border-l border-white/5 shadow-2xl transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) flex flex-col ${showSensei ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-xl">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-cyan-900/20 border border-cyan-500/20 flex items-center justify-center shadow-lg shadow-cyan-500/5">
                <i className="fa-solid fa-brain text-cyan-500 text-xl"></i>
             </div>
             <div>
                <h4 className="font-bungee text-sm tracking-widest text-white">Omni-Sensei</h4>
                <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">AI Intelligence</span>
             </div>
          </div>
          <button onClick={() => setShowSensei(false)} aria-label="Close Sensei" className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-all"><i className="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] px-6 py-5 rounded-[2rem] text-[14px] leading-relaxed shadow-xl ${m.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-none' : 'bg-white/5 text-gray-400 rounded-tl-none border border-white/10'}`}>{m.text}</div>
            </div>
          ))}
          {senseiThinking && (
             <div className="flex items-center gap-4 text-cyan-500/50 animate-pulse px-4">
                <i className="fa-solid fa-circle-nodes fa-spin text-sm"></i>
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">Consulting the Archive...</span>
             </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={async e => {
          e.preventDefault();
          const msg = senseiInput.trim();
          if (!msg || senseiThinking) return;
          setSenseiInput('');
          const nextMessages: SenseiMessage[] = [...messages, { role: 'user', text: msg }];
          setMessages(nextMessages);
          setSenseiThinking(true);
          try {
            const reply = await ai.current.senseiAdvice(nextMessages.map(x => ({ role: x.role === 'sensei' ? 'model' : 'user', parts: [{ text: x.text }] })));
            setMessages(prev => [...prev, { role: 'sensei', text: reply }]);
          } catch (err) {
            console.error('[sensei] request failed', err);
            setMessages(prev => [...prev, { role: 'sensei', text: 'Spirit signal destabilized. Try again.' }]);
          } finally {
            setSenseiThinking(false);
          }
        }} className="p-8 border-t border-white/5 bg-black/60">
          <div className="relative">
            <input value={senseiInput} onChange={e => setSenseiInput(e.target.value)} placeholder="Seek wisdom from the Guide..." aria-label="Message to Omni-Sensei" className="w-full bg-black border border-white/10 rounded-[2rem] px-8 py-5 text-sm focus:border-cyan-500 outline-none transition-all pr-16 font-medium shadow-inner" />
            <button type="submit" disabled={senseiThinking} aria-label="Send message" className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-400 p-2 transition-all disabled:opacity-40"><i className="fa-solid fa-paper-plane text-xl"></i></button>
          </div>
        </form>
      </div>

      {/* Immersive View */}
      {showImmersiveImage && result && result.imageUrl && (
        <div className="fixed inset-0 z-[200] bg-black animate-in fade-in zoom-in-95 duration-500 overflow-y-auto">
          <button onClick={() => setShowImmersiveImage(false)} aria-label="Close immersive view" className="fixed top-10 right-10 z-[210] w-14 h-14 bg-black/60 rounded-[1.5rem] flex items-center justify-center text-white backdrop-blur shadow-2xl border border-white/10"><i className="fa-solid fa-xmark text-2xl"></i></button>
          <div className="min-h-full w-full flex flex-col items-center justify-center p-4 py-20">
            <div className="flex-1 relative w-full flex items-center justify-center">
              <img src={result.imageUrl} alt={`${result.design.name} — immersive view`} className="max-w-full max-h-[80vh] object-contain rounded-[2rem] shadow-[0_0_100px_rgba(255,107,0,0.2)]" />
              {result.envImageUrl && (
                <div className="absolute bottom-10 right-10 w-48 h-28 border-2 border-white/30 rounded-[1.5rem] overflow-hidden shadow-2xl group/swap">
                  <img src={result.envImageUrl} alt={`World of ${result.design.name}`} className="w-full h-full object-cover transition-transform group-hover/swap:scale-110 duration-700" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/swap:opacity-100 transition-opacity"><button onClick={() => setResult({...result, imageUrl: result.envImageUrl!, envImageUrl: result.imageUrl})} className="text-[11px] font-black uppercase text-white tracking-widest bg-orange-600 px-4 py-2 rounded-xl">SWAP VIEW</button></div>
                </div>
              )}
            </div>
            <div className="p-10 glass rounded-[3rem] border-t border-white/10 text-center w-full max-w-4xl mt-12 mx-auto">
              <h2 className="text-3xl md:text-4xl font-bungee text-white mb-2 leading-none">{result.design.name}</h2>
              <p className="text-[11px] text-orange-500 font-black uppercase tracking-[0.4em] mb-8">{result.design.title} | {result.quality} Manifest{result.imageUrl.startsWith('data:image/svg+xml') ? ' | SPECTRAL SKETCH (FREE)' : ` | ${result.resolution}px`}</p>
              <div className="flex flex-wrap justify-center gap-4 mb-8">
                 {result.design.powers.slice(0, 3).map((p, i) => (
                   <span key={`${p}-${i}`} className="px-4 py-2 bg-white/5 rounded-xl text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-white/5">{p}</span>
                 ))}
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                <button onClick={() => downloadImage(result.imageUrl, result.design.name)} className="px-10 py-5 bg-cyan-600 rounded-2xl font-bungee text-[11px] tracking-[0.3em] text-white hover:scale-105 transition-all shadow-xl shadow-cyan-600/20 uppercase flex items-center gap-3"><i className="fa-solid fa-download"></i>PNG</button>
                <button onClick={saveToScrolls} className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-bungee text-[11px] tracking-[0.3em] text-white hover:bg-white/10 transition-all uppercase">Archive Record</button>
                <button onClick={() => setShowImmersiveImage(false)} className="px-10 py-5 bg-orange-600 rounded-2xl font-bungee text-[11px] tracking-[0.3em] text-white hover:scale-105 transition-all shadow-xl shadow-orange-500/20 uppercase">CLOSE INSPECTION</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Notification Toast */}
      {notification && (
        <div
          role="status"
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-[500] backdrop-blur text-white px-5 py-2 rounded-xl font-black text-[9px] tracking-widest shadow-2xl animate-in slide-in-from-top-2 duration-300 uppercase max-w-[90vw] text-center ${
            notification.kind === 'error' ? 'bg-red-600/90' :
            notification.kind === 'success' ? 'bg-emerald-600/90' :
            'bg-orange-600/90'
          }`}
        >
          {notification.msg}
        </div>
      )}
    </div>
  );
};

export default App;
