import React, { useState, useMemo } from 'react';
import { CharacterDesign, CharacterStats } from '../types';
import { AiService } from '../services/aiService';
import { buildShareUrl } from '../lib/shareCodec';
import { clampStat } from '../lib/design';

interface CharacterSheetProps {
  design: CharacterDesign;
  onUpdate: (field: keyof CharacterDesign, value: unknown) => void;
  ai: AiService;
  onEvolve: () => void;
  onGenEnv: () => void;
  onPlayTheme: () => void;
  onNotify: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  isProcessing: boolean;
}

const AESTHETICS = ['Cyberpunk', 'Steampunk', 'Gothic', 'High Fantasy', 'Dark Fantasy', 'Space Opera', 'Solarpunk', 'Art Nouveau', 'Grimdark'];

const AESTHETIC_PREVIEWS: Record<string, string> = {
  'Cyberpunk': 'linear-gradient(135deg, #00f2ff, #ff00ff)',
  'Steampunk': 'linear-gradient(135deg, #d2691e, #ffd700)',
  'Gothic': 'linear-gradient(135deg, #000, #4b0082)',
  'High Fantasy': 'linear-gradient(135deg, #00bfff, #ffd700)',
  'Dark Fantasy': 'linear-gradient(135deg, #1a1a1a, #8b0000)',
  'Space Opera': 'linear-gradient(135deg, #00008b, #c0c0c0)',
  'Solarpunk': 'linear-gradient(135deg, #32cd32, #87ceeb)',
  'Art Nouveau': 'linear-gradient(135deg, #f5f5dc, #d2b48c)',
  'Grimdark': 'linear-gradient(135deg, #2f4f4f, #000)'
};

const getPowerIcon = (power: string) => {
  const p = power.toLowerCase();
  // Elements
  if (p.includes('fire') || p.includes('flame') || p.includes('pyro')) return 'fa-fire';
  if (p.includes('water') || p.includes('aqua') || p.includes('hydro')) return 'fa-droplet';
  if (p.includes('ice') || p.includes('frost') || p.includes('cryo')) return 'fa-icicles';
  if (p.includes('lightning') || p.includes('bolt') || p.includes('electric')) return 'fa-bolt-lightning';
  if (p.includes('earth') || p.includes('stone') || p.includes('rock')) return 'fa-mountain';
  if (p.includes('wind') || p.includes('air') || p.includes('aero')) return 'fa-wind';
  if (p.includes('light') || p.includes('holy') || p.includes('solar')) return 'fa-sun';
  if (p.includes('dark') || p.includes('shadow') || p.includes('void')) return 'fa-moon';

  // Physical/Combat
  if (p.includes('sword') || p.includes('blade') || p.includes('slash')) return 'fa-sword';
  if (p.includes('fist') || p.includes('punch') || p.includes('strength')) return 'fa-hand-fist';
  if (p.includes('shield') || p.includes('defense') || p.includes('barrier')) return 'fa-shield-halved';
  if (p.includes('speed') || p.includes('haste') || p.includes('dash')) return 'fa-gauge-high';
  if (p.includes('stealth') || p.includes('hide') || p.includes('ninja')) return 'fa-user-ninja';

  // Magic/Special
  if (p.includes('mind') || p.includes('tele') || p.includes('psion')) return 'fa-brain';
  if (p.includes('tech') || p.includes('cyber') || p.includes('droid')) return 'fa-microchip';
  if (p.includes('heart') || p.includes('heal') || p.includes('life')) return 'fa-heart-pulse';
  if (p.includes('time') || p.includes('chrono') || p.includes('future')) return 'fa-clock-rotate-left';
  if (p.includes('gravity') || p.includes('weight') || p.includes('force')) return 'fa-arrows-down-to-line';
  if (p.includes('dragon') || p.includes('beast') || p.includes('animal')) return 'fa-dragon';
  if (p.includes('magic') || p.includes('spell') || p.includes('wizard')) return 'fa-wand-magic-sparkles';
  if (p.includes('dimension') || p.includes('space') || p.includes('rift')) return 'fa-circle-nodes';

  return 'fa-star'; // Generic fallback
};

const CharacterSheet: React.FC<CharacterSheetProps> = ({ design, onUpdate, ai, onEvolve, onGenEnv, onPlayTheme, onNotify, isProcessing }) => {
  const [loreChatOpen, setLoreChatOpen] = useState(false);
  const [loreQuestion, setLoreQuestion] = useState('');
  const [loreSearch, setLoreSearch] = useState('');
  const [loreHistory, setLoreHistory] = useState<{q: string, a: string}[]>([]);
  const [isLoadingField, setIsLoadingField] = useState<string | null>(null);

  const filteredLore = useMemo(() => {
    if (!loreSearch.trim()) return loreHistory;
    const s = loreSearch.toLowerCase();
    return loreHistory.filter(h => h.q.toLowerCase().includes(s) || h.a.toLowerCase().includes(s));
  }, [loreHistory, loreSearch]);

  const handleReroll = async (field: keyof CharacterDesign) => {
    setIsLoadingField(String(field));
    try {
      const newValue = await ai.updateField(design, field);
      onUpdate(field, newValue);
      onNotify(`${String(field).charAt(0).toUpperCase() + String(field).slice(1)} re-manifested.`, 'success');
    } catch (e) {
      console.error('[sheet] failed to re-roll', field, e);
      onNotify('Re-manifestation failed. See console for details.', 'error');
    } finally {
      setIsLoadingField(null);
    }
  };

  const handleRefineVisuals = async (aspect: string) => {
    setIsLoadingField('visualTraits');
    onNotify(`Refining ${aspect}...`, 'info');
    try {
      const newValue = await ai.updateField(design, 'visualTraits');
      onUpdate('visualTraits', newValue);
      onNotify(`${aspect} optimized.`, 'success');
    } catch (e) {
      console.error('[sheet] failed to refine visuals', aspect, e);
      onNotify('Visual refinement failed.', 'error');
    } finally {
      setIsLoadingField(null);
    }
  };

  const handleStatChange = (stat: keyof CharacterStats, value: number) => {
    onUpdate('stats', { ...design.stats, [stat]: clampStat(value) });
  };

  const handleLoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = loreQuestion.trim();
    if (!question || isLoadingField === 'lore_chat') return;
    setLoreQuestion('');
    setIsLoadingField('lore_chat');
    try {
      const answer = await ai.loreChat(design, question);
      setLoreHistory(prev => [...prev, { q: question, a: answer }]);
    } catch (e) {
      console.error('[sheet] lore expansion failed', e);
      onNotify('The Oracle did not respond. Try again.', 'error');
    } finally {
      setIsLoadingField(null);
    }
  };

  const handleShare = async () => {
    try {
      const url = buildShareUrl(design);
      await navigator.clipboard.writeText(url);
      onNotify('Share link copied to clipboard.', 'success');
    } catch (e) {
      console.error('[sheet] share failed', e);
      onNotify('Could not copy the link — clipboard blocked?', 'error');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <p className="text-[9px] md:text-[10px] text-orange-500 font-black uppercase tracking-[0.2em] mb-1">RECORD TYPE: ASCENDED FORM {design.evolutionStage}</p>
          <input
            className="text-2xl md:text-4xl font-bungee bg-transparent border-none text-white mb-1 leading-tight w-full outline-none focus:text-orange-500 transition-colors"
            value={design.name}
            aria-label="Character name"
            onChange={(e) => onUpdate('name', e.target.value)}
          />
          <input
            className="text-[11px] md:text-xs text-gray-400 italic bg-transparent border-none w-full outline-none focus:text-white"
            value={design.title}
            aria-label="Character title"
            onChange={(e) => onUpdate('title', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onPlayTheme}
            disabled={isProcessing}
            title="Generate Character Jingle"
            aria-label="Generate character theme audio"
            className="w-12 h-12 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 text-cyan-500 flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/10 group"
          >
            <i className={`fa-solid ${isProcessing ? 'fa-circle-notch fa-spin' : 'fa-music'} text-lg group-hover:scale-110 transition-transform`}></i>
          </button>
          <button
            onClick={handleShare}
            title="Copy share link"
            aria-label="Copy share link"
            className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-gray-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all"
          >
            <i className="fa-solid fa-share-nodes text-lg"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onEvolve}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center gap-1 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-bungee text-[10px] tracking-[0.2em] transition-all shadow-xl shadow-orange-600/20 active:scale-95 group disabled:opacity-50"
        >
          <i className="fa-solid fa-angles-up text-lg group-hover:-translate-y-1 transition-transform"></i>
          UNLEASH EVOLUTION
        </button>
        <button
          onClick={onGenEnv}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center gap-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-bungee text-[10px] tracking-[0.2em] transition-all active:scale-95 group disabled:opacity-50"
        >
          <i className="fa-solid fa-mountain-sun text-lg group-hover:scale-110 transition-transform"></i>
          EXPAND WORLD
        </button>
      </div>

      <div className="space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-400">Core Attribute Matrix</h3>
            <button onClick={() => handleReroll('stats')} aria-label="Re-roll stats" className="text-gray-500 hover:text-cyan-400 transition-colors">
              <i className={`fa-solid fa-arrows-rotate text-[11px] ${isLoadingField === 'stats' ? 'fa-spin' : ''}`}></i>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(design.stats).map(([key, val]) => (
              <div key={key} className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 tracking-widest">
                  <span>{key}</span>
                  <span className="text-cyan-400 font-mono">{val}/100</span>
                </div>
                <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                  <div
                    className="absolute h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
                    style={{ width: `${val}%`, boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)' }}
                  />
                  <input
                    type="range" min="1" max="100" value={val}
                    aria-label={`${key} stat`}
                    onChange={(e) => handleStatChange(key as keyof CharacterStats, parseInt(e.target.value, 10))}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white/5 p-6 rounded-[2.5rem] border border-white/5 space-y-6 shadow-2xl relative group overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <i className="fa-solid fa-dna text-6xl"></i>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em]">Homeworld Signature</span>
              <button onClick={() => handleReroll('homeworld')} aria-label="Re-roll homeworld" className="text-gray-600 hover:text-orange-500 transition-colors"><i className="fa-solid fa-shuffle text-[10px]"></i></button>
            </div>
            <p className="text-[13px] text-gray-300 leading-relaxed italic border-l-2 border-orange-500/30 pl-4">{design.homeworld}</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em]">Morphological Specs</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                 {['Eyes', 'Fabric', 'Armor', 'Scars', 'Aura'].map(aspect => (
                   <button
                    key={aspect}
                    onClick={() => handleRefineVisuals(aspect)}
                    className="text-[9px] font-black text-gray-500 hover:text-white hover:bg-white/5 px-2 py-1 rounded-md uppercase transition-all border border-transparent hover:border-white/10"
                   >
                    {aspect}
                   </button>
                 ))}
                 <button onClick={() => handleReroll('visualTraits')} aria-label="Re-roll visual traits" className="text-orange-500 hover:text-orange-400 transition-colors ml-1"><i className="fa-solid fa-arrows-spin text-[11px] animate-pulse"></i></button>
              </div>
            </div>
            <p className="text-[13px] text-gray-400 leading-relaxed font-medium bg-black/20 p-4 rounded-2xl border border-white/5">{design.visualTraits}</p>
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-400 mb-4 ml-1">Manifested Abilities</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {design.powers.map((p, i) => (
              <div key={`${p}-${i}`} className="flex items-center gap-4 bg-orange-600/5 border border-orange-500/10 px-5 py-4 rounded-2xl group hover:bg-orange-600/10 hover:border-orange-500/30 transition-all cursor-default shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-orange-600/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                  <i className={`fa-solid ${getPowerIcon(p)} text-lg`}></i>
                </div>
                <span className="text-[12px] font-black text-white uppercase tracking-wider">{p}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl transition-all duration-500">
            <button
              onClick={() => setLoreChatOpen(!loreChatOpen)}
              aria-expanded={loreChatOpen}
              className={`w-full px-8 py-5 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.3em] transition-all ${loreChatOpen ? 'bg-orange-600 text-white' : 'text-orange-500 hover:bg-white/5'}`}
            >
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-book-sparkles"></i>
                <span>{loreChatOpen ? 'SEALING THE CHRONICLE' : 'CONSULTING THE ORACLE'}</span>
              </div>
              <i className={`fa-solid fa-caret-${loreChatOpen ? 'up' : 'down'} transition-transform duration-300`}></i>
            </button>
            {loreChatOpen && (
              <div className="p-8 space-y-6 animate-in slide-in-from-top-4 duration-500 bg-black/40">
                <div className="relative group">
                  <input
                    className="w-full bg-black/60 border border-white/10 rounded-2xl px-12 py-4 text-[11px] font-bold focus:border-orange-500 outline-none transition-all placeholder:text-gray-700 shadow-inner"
                    placeholder="Search past lore fragments..."
                    value={loreSearch}
                    onChange={e => setLoreSearch(e.target.value)}
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-gray-700 text-[11px] group-focus-within:text-orange-500 transition-colors"></i>
                </div>

                <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-5 pr-2">
                  {filteredLore.length === 0 && loreHistory.length > 0 && (
                    <div className="text-center py-8 opacity-30">
                       <i className="fa-solid fa-wind text-3xl mb-3 block"></i>
                       <p className="text-[10px] font-black uppercase tracking-widest">No matching resonance found</p>
                    </div>
                  )}
                  {filteredLore.map((h, i) => (
                    <div key={i} className="space-y-3 animate-in slide-in-from-bottom-2 border-l-2 border-white/5 pl-4 ml-1">
                      <div className="text-[9px] text-orange-500 font-black tracking-[0.3em] uppercase opacity-70">Inquiry: {h.q}</div>
                      <div className="text-[13px] text-gray-400 leading-relaxed font-medium">{h.a}</div>
                    </div>
                  ))}
                  {loreHistory.length === 0 && (
                    <div className="text-center py-10 opacity-20">
                      <p className="text-[11px] font-black uppercase tracking-[0.4em]">The Oracle awaits your whisper</p>
                    </div>
                  )}
                </div>

                <form onSubmit={handleLoreSubmit} className="flex gap-3 pt-4 border-t border-white/5">
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-[13px] focus:border-orange-500 outline-none transition-all font-medium"
                    placeholder="Whisper a mythic query..."
                    value={loreQuestion}
                    onChange={e => setLoreQuestion(e.target.value)}
                    disabled={isLoadingField === 'lore_chat'}
                  />
                  <button type="submit" className="w-14 h-14 bg-orange-600 hover:bg-orange-500 rounded-2xl flex items-center justify-center text-white transition-all active:scale-90 shadow-xl shadow-orange-600/20 disabled:opacity-50" disabled={isLoadingField === 'lore_chat'} aria-label="Ask the Oracle">
                    {isLoadingField === 'lore_chat' ? <i className="fa-solid fa-circle-notch fa-spin text-lg"></i> : <i className="fa-solid fa-paper-plane text-lg"></i>}
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>

        <div className="flex items-center gap-6 pt-8 border-t border-white/5">
          <div className="flex items-center gap-4 bg-white/5 p-3 pr-6 rounded-[1.5rem] border border-white/5 shadow-lg group hover:border-orange-500/30 transition-all">
            <div className="w-10 h-10 rounded-xl border border-white/20 shadow-xl transition-all group-hover:rotate-12 group-hover:scale-110" style={{ background: AESTHETIC_PREVIEWS[design.aesthetic] || '#333' }} />
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-0.5">Manifest Aesthetic</span>
              <select
                value={design.aesthetic}
                aria-label="Manifest aesthetic"
                onChange={e => onUpdate('aesthetic', e.target.value)}
                className="bg-transparent border-none text-[11px] text-orange-400 font-black uppercase tracking-[0.2em] outline-none cursor-pointer hover:text-orange-300 transition-colors"
              >
                {AESTHETICS.map(a => <option key={a} value={a} className="bg-black text-white">{a}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterSheet;
