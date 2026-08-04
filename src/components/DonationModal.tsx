import React, { useEffect, useState } from 'react';
import qrcode from 'qrcode';

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
        <h3 className="text-lg font-extrabold text-slate-900">Apoie o Projeto</h3>
        <p className="text-sm text-slate-600">Ajude a manter o UkeMaster gratuito e aberto.</p>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Pix" className="w-48 h-48 mx-auto" />
        ) : (
          <p className="text-center text-slate-400">Gerando QR…</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2">
          <button onClick={copyKey} className="px-3 py-1 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">
            Copiar chave
          </button>
          <button onClick={onClose} className="px-3 py-1 rounded-xl bg-slate-200 text-slate-800 text-sm font-medium hover:bg-slate-300">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
