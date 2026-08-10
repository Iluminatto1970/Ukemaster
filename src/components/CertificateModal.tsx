/**
 * Certificado de Conclusão de trilha: gera um certificado visual (canvas PNG)
 * com nome do participante, trilha, nível, data e um código de verificação
 * único e determinístico (UKM-ANO-XXXXXX). Permite baixar em PNG e imprimir
 * (via @media print — só a área .certificate-print-area sai no papel).
 */
import React, { useEffect, useRef, useState } from 'react';
import { LearningTrail } from '../data/learningTrails';
import { useT } from '../lib/i18n';
import {
  Download,
  Printer,
  X,
  Award,
  Linkedin,
  Facebook,
  Twitter,
  MessageCircle,
  Share2,
} from 'lucide-react';

export interface CertificateData {
  name: string;
  /** Data ISO (yyyy-mm-dd) da emissão. */
  date: string;
  /** Código de verificação (UKM-2026-XXXXXX). */
  number: string;
}

interface CertificateModalProps {
  isOpen: boolean;
  trail: LearningTrail;
  /** Certificado já emitido para esta trilha (reabre com os dados salvos). */
  existing?: CertificateData | null;
  /** Nome pré-preenchido (usuário logado). */
  defaultName?: string;
  onEmit: (data: CertificateData) => void;
  onClose: () => void;
}

const CERT_W = 1200;
const CERT_H = 850;

/** Hash djb2 → 6 hexa (código determinístico: mesma trilha+data+nome = mesmo código). */
const hash6 = (str: string): string => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
};

export const makeCertificateNumber = (trailId: string, date: string, name: string): string =>
  `UKM-${date.slice(0, 4)}-${hash6(`${trailId}|${date}|${name.trim().toLowerCase()}`)}`;

interface DrawTexts {
  titleLabel: string;
  certifiesLabel: string;
  completedLabel: string;
  trailTitle: string;
  levelLabel: string;
  dateCaption: string;
  dateLabel: string;
  verificationCaption: string;
  number: string;
  signatureLabel: string;
  portalLabel: string;
  name: string;
}

/** Desenha o certificado no canvas (1200×850). `logo` é a imagem /logo.png
 *  (carregada de forma assíncrona) — sem ela, usa o selo "UK" como fallback.
 *
 *  Layout vertical revisado: todos os textos usam textBaseline 'alphabetic'
 *  (baseline) e ficam DENTRO da borda interna (área útil y≈74 a 802) — o
 *  rodapé termina antes da borda, sem sobreposição. */
function drawCertificate(
  canvas: HTMLCanvasElement,
  tx: DrawTexts,
  logo?: HTMLImageElement | null
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = CERT_W;
  const H = CERT_H;
  ctx.clearRect(0, 0, W, H);

  // Fundo creme
  ctx.fillStyle = '#FFFDF6';
  ctx.fillRect(0, 0, W, H);

  // Borda externa dourada + interna laranja
  ctx.strokeStyle = '#F6AE2D';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.roundRect(24, 24, W - 48, H - 48, 24);
  ctx.stroke();

  ctx.strokeStyle = '#F26419';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(48, 48, W - 96, H - 96, 16);
  ctx.stroke();

  // Selo no topo: a LOGO do UkeMaster dentro de um círculo branco com anel
  // dourado. Enquanto a imagem não carrega, usa o selo "UK" como fallback.
  const sealX = W / 2;
  const sealY = 118;
  if (logo && logo.complete && logo.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sealX, sealY, 44, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#F6AE2D';
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(logo, sealX - 38, sealY - 38, 76, 76);
    ctx.restore();
    ctx.fillStyle = '#F6AE2D';
    ctx.font = '14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', sealX, sealY + 66);
  } else {
    ctx.fillStyle = '#0E7C7B';
    ctx.beginPath();
    ctx.arc(sealX, sealY, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F6AE2D';
    ctx.font = 'bold 38px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UK', sealX, sealY - 6);
    ctx.font = '16px Georgia, serif';
    ctx.fillText('★', sealX, sealY + 22);
  }

  // Textos de conteúdo — baseline padrão (evita centralização vertical)
  ctx.textBaseline = 'alphabetic';

  // Título
  ctx.fillStyle = '#0E7C7B';
  ctx.font = 'bold 50px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(tx.titleLabel.toUpperCase(), W / 2, 218);

  // "Certificamos que"
  ctx.fillStyle = '#5B6B73';
  ctx.font = 'italic 25px Georgia, serif';
  ctx.fillText(tx.certifiesLabel, W / 2, 288);

  // Nome (grande, elegante) — fonte reduz/trunca se for muito longo
  let nameFont = 'italic bold 60px Georgia, serif';
  let name = tx.name;
  if (name.length > 26) {
    nameFont = 'italic bold 42px Georgia, serif';
    name = name.length > 38 ? `${name.slice(0, 37).trim()}…` : name;
  }
  ctx.fillStyle = '#1D2D44';
  ctx.font = nameFont;
  ctx.fillText(name, W / 2, 358);

  // "concluiu com êxito a trilha"
  ctx.fillStyle = '#5B6B73';
  ctx.font = 'italic 25px Georgia, serif';
  ctx.fillText(tx.completedLabel, W / 2, 426);

  // Nome da trilha (laranja, bold) + nível
  ctx.fillStyle = '#F26419';
  ctx.font = 'bold 38px Georgia, serif';
  ctx.fillText(tx.trailTitle, W / 2, 478);
  ctx.fillStyle = '#0E7C7B';
  ctx.font = 'bold 23px Arial, sans-serif';
  ctx.fillText(tx.levelLabel.toUpperCase(), W / 2, 520);

  // Linha divisória dourada
  ctx.strokeStyle = '#F6AE2D';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(260, 570);
  ctx.lineTo(W - 260, 570);
  ctx.stroke();

  // Data (esquerda) e Código (direita)
  ctx.fillStyle = '#5B6B73';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(tx.dateCaption.toUpperCase(), 210, 638);
  ctx.textAlign = 'right';
  ctx.fillText(tx.verificationCaption.toUpperCase(), W - 210, 638);
  ctx.fillStyle = '#1D2D44';
  ctx.font = 'bold 25px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(tx.dateLabel, 210, 680);
  ctx.textAlign = 'right';
  ctx.fillText(tx.number, W - 210, 680);

  // Assinatura (centralizada)
  ctx.strokeStyle = '#B9C2C7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, 724);
  ctx.lineTo(W / 2 + 180, 724);
  ctx.stroke();
  ctx.fillStyle = '#1D2D44';
  ctx.font = 'italic bold 21px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(tx.signatureLabel, W / 2, 756);

  // Rodapé — termina ANTES da borda interna (fundo em 802), sem sobrepor
  ctx.fillStyle = '#8A979E';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(tx.portalLabel, W / 2, 788);
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  trail,
  existing = null,
  defaultName = '',
  onEmit,
  onClose,
}) => {
  const { t, lang } = useT();
  const [name, setName] = useState<string>(defaultName);
  const [cert, setCert] = useState<CertificateData | null>(existing);
  const [error, setError] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // Ao abrir: se já existe certificado salvo, mostra direto; senão usa o nome padrão
  useEffect(() => {
    if (isOpen) {
      setCert(existing);
      setName(existing?.name ?? defaultName);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, existing]);

  const generate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('cert.nameRequired'));
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const data: CertificateData = {
      name: trimmed,
      date,
      number: makeCertificateNumber(trail.id, date, trimmed),
    };
    setCert(data);
    onEmit(data);
  };

  // Redesenha o certificado no canvas (com a logo já carregada, se houver)
  const redraw = React.useCallback(() => {
    if (!isOpen || !cert || !canvasRef.current) return;
    const locale = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP', zh: 'zh-CN', ar: 'ar-SA' }[lang] ?? 'pt-BR';
    drawCertificate(
      canvasRef.current,
      {
        titleLabel: t('cert.title'),
        certifiesLabel: t('cert.certifies'),
        completedLabel: t('cert.completedTrail'),
        trailTitle: t(trail.titleKey),
        levelLabel: `${t('cert.level')}: ${t(`trails.level.${trail.level}`)}`,
        dateCaption: t('cert.date'),
        dateLabel: new Date(`${cert.date}T12:00:00`).toLocaleDateString(locale, {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        verificationCaption: t('cert.verification'),
        number: cert.number,
        signatureLabel: t('cert.signature'),
        portalLabel: t('cert.portal'),
        name: cert.name,
      },
      logoImgRef.current
    );
  }, [isOpen, cert, lang, trail, t]);

  // Desenha sempre que o certificado/idioma muda
  useEffect(() => {
    redraw();
  }, [redraw]);

  // Carrega a logo /logo.png uma vez — ao terminar, redesenha com a logo
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      logoImgRef.current = img;
      redraw();
    };
    img.src = '/logo.png';
  }, [redraw]);

  if (!isOpen || !trail) return null;

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `certificado-${trail.id}-${cert?.number ?? 'ukemaster'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Mensagem + URL de compartilhamento (redes sociais abrem com texto/link;
  // a imagem em si é enviada pela Web Share API — botão "Enviar imagem").
  const shareText = `${t('cert.shareText')} "${t(trail.titleKey)}" — UkeMaster Pro`;
  const shareUrl = `${window.location.origin}/trilhas`;
  const encodedShare = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  // Envia o PNG pelo share sheet nativo (WhatsApp, Instagram, LinkedIn app...)
  // quando suportado; senão, baixa o arquivo para anexar manualmente.
  const sharePng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return downloadPng();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return downloadPng();
    const file = new File([blob], `certificado-${trail.id}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('cert.title'), text: shareText });
        return;
      } catch {
        // usuário cancelou — cai no download para anexar manualmente
      }
    }
    downloadPng();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Header do modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F6AE2D]/15 text-[#F26419] flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#1D2D44] leading-tight">{t('cert.title')}</h3>
              <p className="text-[11px] text-slate-500">{t(trail.titleKey)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title={t('cert.close')}
            className="p-2 rounded-xl text-slate-400 hover:text-[#F26419] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {!cert ? (
            /* Passo 1: pede o nome */
            <div className="max-w-md mx-auto py-8 text-center">
              <p className="text-sm font-bold text-[#1D2D44]">{t('cert.ready')}</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">{t('trails.completedTrail')}</p>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && generate()}
                placeholder={t('cert.yourName')}
                maxLength={60}
                className="w-full bg-slate-100/90 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-[#1D2D44] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#F26419] focus:ring-2 focus:ring-[#F26419]/20 transition-all"
              />
              {error && <p className="mt-2 text-xs font-bold text-[#F26419]">{error}</p>}
              <button
                onClick={generate}
                className="mt-4 w-full px-5 py-3 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white text-xs font-black tracking-wider uppercase shadow-sm transition-all cursor-pointer"
              >
                {t('cert.generate')}
              </button>
            </div>
          ) : (
            /* Passo 2: certificado gerado + ações */
            <>
              <div className="certificate-print-area bg-white rounded-xl overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={CERT_W}
                  height={CERT_H}
                  className="w-full h-auto block"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  onClick={downloadPng}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white text-xs font-black tracking-wider uppercase shadow-sm transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" /> {t('cert.download')}
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[#1D2D44] text-xs font-black tracking-wider uppercase hover:bg-slate-50 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> {t('cert.print')}
                </button>
              </div>

              {/* Compartilhar nas redes sociais — links abrem com texto/conquista;
                  o botão "Enviar imagem" usa a Web Share API (PNG real) no celular */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">
                  {t('cert.share')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={`https://wa.me/?text=${encodedShare}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="WhatsApp"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366] hover:brightness-110 text-white text-[11px] font-black tracking-wide transition-all"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodedShare}&url=${encodedUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="X (Twitter)"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white text-[11px] font-black tracking-wide transition-all"
                  >
                    <Twitter className="w-4 h-4" /> X
                  </a>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedShare}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Facebook"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1877F2] hover:brightness-110 text-white text-[11px] font-black tracking-wide transition-all"
                  >
                    <Facebook className="w-4 h-4" /> Facebook
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="LinkedIn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A66C2] hover:brightness-110 text-white text-[11px] font-black tracking-wide transition-all"
                  >
                    <Linkedin className="w-4 h-4" /> LinkedIn
                  </a>
                  <button
                    onClick={sharePng}
                    title={t('cert.shareImage')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white text-[11px] font-black tracking-wide transition-all cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> {t('cert.shareImage')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
