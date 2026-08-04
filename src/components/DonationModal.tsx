import React, { useEffect, useState } from 'react';
import qrcode from 'qrcode';
import { APOIA_SE_URL } from '../config';

// ponytail: localStorage only – upgrade to server‑side verification later
const BR_CODE = `00020126580014BR.GOV.BCB.PIX0136eab16de1-fb73-4748-8403-786c273266415204000053039865802BR5925MARIO ILUMINATTO DA SILVA6009SAO PAULO622905258hhtxtzom0tcipn6ellveyyxh6304EDD1`;

export const DonationModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  useEffect(() => {
    if (!isOpen) return;
    qrcode.toDataURL(BR_CODE).then(setQrUrl).catch(console.error);
  }, [isOpen]);

  const copyKey = async () => {
    const key = 'eab16de1-fb73-4748-8403-786c27326641';
    await navigator.clipboard.writeText(key);
    alert('Chave Pix copiada!');
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
        <h3 className="text-lg font-extrabold text-slate-900">Apoie o UkeMaster Pro</h3>
        <p className="text-sm text-slate-600">
          Sem paywall: o acervo é 100% gratuito e vive graças aos anúncios e à comunidade.
        </p>

        {/* CTA principal: comunidade APOIA.se */}
        <a
          href={APOIA_SE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center px-4 py-3 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-extrabold text-sm shadow-md shadow-[#0E7C7B]/20 transition-all"
        >
          💚 Apoiar no APOIA.se
        </a>
        <p className="text-[11px] text-slate-400 text-center">
          Entre para a comunidade de apoiadores do portal.
        </p>

        {/* Divider */}
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
          <div className="flex-1 h-px bg-slate-200" />
          ou via Pix
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {qrUrl ? (
          <img src={qrUrl} alt="QR Pix" className="w-40 h-40 mx-auto" />
        ) : (
          <p className="text-center text-slate-400">Gerando QR…</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={copyKey}
            className="px-3 py-1 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600"
          >
            Copiar chave
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-slate-200 text-slate-800 text-sm font-medium hover:bg-slate-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
