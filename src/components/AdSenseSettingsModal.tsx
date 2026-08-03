import React, { useState } from 'react';
import { X, Check, DollarSign, HelpCircle, ShieldCheck, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { AdSenseConfig } from '../types';
import { getAdSenseConfig, saveAdSenseConfig } from '../utils/adsense';

interface AdSenseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export const AdSenseSettingsModal: React.FC<AdSenseSettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [config, setConfig] = useState<AdSenseConfig>(getAdSenseConfig);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveAdSenseConfig(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      if (onSave) onSave();
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-stone-100 flex items-center gap-2">
                Configuração do Google AdSense
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold uppercase">
                  100% Grátis
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Monetize seu portal de cifras com anúncios do Google AdSense.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSave} className="space-y-5 overflow-y-auto pr-1 flex-1">
          {/* Main Toggle */}
          <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-stone-200 block">Exibição de Anúncios</span>
              <span className="text-xs text-stone-400">Ativar ou desativar todos os blocos de anúncios no site</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Publisher ID Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-300 flex items-center justify-between">
              <span>Google Publisher ID (ca-pub-xxxxxxxxxxxxxxxx)</span>
              <a
                href="https://adsense.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline text-[11px] flex items-center gap-1 font-normal"
              >
                <span>Obter no AdSense</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <input
              type="text"
              value={config.publisherId}
              onChange={(e) => setConfig({ ...config, publisherId: e.target.value.trim() })}
              placeholder="Ex: ca-pub-7409769323856107"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <div className="flex items-center justify-between text-[11px] text-stone-500">
              <span>Configurado para a conta ID: <code className="text-amber-400 font-mono">pub-7409769323856107</code></span>
              <span>Cliente: <code className="text-stone-400 font-mono">1732333136</code></span>
            </div>
          </div>

          {/* Test Placeholders Mode */}
          <div className="bg-stone-950/60 p-4 rounded-2xl border border-stone-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-stone-300 block">Exibir Banners de Teste</span>
              <span className="text-[11px] text-stone-400">
                Mostra a localização exata dos anúncios em modo demonstrativo se o Publisher ID não estiver ativo
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.showTestPlaceholders}
                onChange={(e) => setConfig({ ...config, showTestPlaceholders: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Advanced Slot IDs Section */}
          <div className="border-t border-stone-800 pt-4 space-y-3">
            <h3 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> IDs Individuais dos Blocos de Anúncio (Opcional)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-stone-400 block mb-1">
                  Banner Topo (Leaderboard)
                </label>
                <input
                  type="text"
                  value={config.slotTopHeader || ''}
                  onChange={(e) => setConfig({ ...config, slotTopHeader: e.target.value })}
                  placeholder="Ex: 1234567890"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-400 block mb-1">
                  Dentro da Cifra (In-Article)
                </label>
                <input
                  type="text"
                  value={config.slotInSong || ''}
                  onChange={(e) => setConfig({ ...config, slotInSong: e.target.value })}
                  placeholder="Ex: 2345678901"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-400 block mb-1">
                  Entre Lista de Músicas (In-Feed)
                </label>
                <input
                  type="text"
                  value={config.slotInFeed || ''}
                  onChange={(e) => setConfig({ ...config, slotInFeed: e.target.value })}
                  placeholder="Ex: 3456789012"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-400 block mb-1">
                  Barra Fixa Rodapé (Anchor)
                </label>
                <input
                  type="text"
                  value={config.slotAnchorBottom || ''}
                  onChange={(e) => setConfig({ ...config, slotAnchorBottom: e.target.value })}
                  placeholder="Ex: 4567890123"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-300 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Quick Guide */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-xs text-amber-200">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <HelpCircle className="w-4 h-4" />
              <span>Como funciona a monetização do AdSense no seu app grátis?</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-stone-300 leading-relaxed text-[11px]">
              <li>Os anúncios automáticos e adaptativos ajustam-se a qualquer tela (celular, tablet e computador).</li>
              <li>A barra fixa de rodapé e os blocos entre versos aumentam imensamente o CTR e os ganhos sem atrapalhar a leitura do músico.</li>
              <li>Basta colar o seu código <code className="text-amber-300 font-mono bg-stone-950 px-1 py-0.5 rounded">ca-pub-...</code> acima e salvar!</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-800 hover:bg-stone-800 text-stone-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Configurações Salvas!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Salvar e Aplicar AdSense</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
