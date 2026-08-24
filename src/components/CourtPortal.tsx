/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, CourtLawsuit, CourtLawsuitType, CourtLawsuitSubtype, PromissoryNoteData, CourtAttachment } from '../types.js';
import { 
  Scale, Gavel, ShieldAlert, FileText, CheckCircle2, Clock, AlertTriangle, 
  ArrowLeft, Search, PlusCircle, Building2, Landmark, RefreshCw, Printer, 
  Send, UserCheck, ShieldCheck, ArrowUpRight, DollarSign, X, HelpCircle, Eye,
  Paperclip, UploadCloud, Download, Trash2, FileCheck, Receipt
} from 'lucide-react';
import { formatNumber } from '../lib/formatters.js';

interface CourtPortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export default function CourtPortal({ currentUser, onBackToHub, onUserBalanceUpdated }: CourtPortalProps) {
  const isJudge = currentUser.role === 'teacher' || 
                  currentUser.username?.toLowerCase() === 'pupdaniel' || 
                  currentUser.id === 'pupdaniel' || 
                  currentUser.id.toLowerCase().includes('pupdaniel');
  const isTeacher = isJudge;
  const [activeTab, setActiveTab] = useState<'demandas' | 'nueva_demanda' | 'guia'>('demandas');
  const [lawsuits, setLawsuits] = useState<CourtLawsuit[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [unpaidNotes, setUnpaidNotes] = useState<PromissoryNoteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Selected lawsuit for document modal
  const [selectedLawsuitForView, setSelectedLawsuitForView] = useState<CourtLawsuit | null>(null);

  // Filter for expediente list
  const [filterType, setFilterType] = useState<'all' | 'plaintiff' | 'defendant' | 'cambiaria' | 'ordinaria'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State for filing lawsuit
  const [formType, setFormType] = useState<CourtLawsuitType>('ordinaria');
  const [formSubtype, setFormSubtype] = useState<CourtLawsuitSubtype>('incumplimiento_pago');
  const [formDefendantId, setFormDefendantId] = useState<string>('');
  const [formClaimedAmount, setFormClaimedAmount] = useState<string>('');
  const [formGoodsDescription, setFormGoodsDescription] = useState<string>('');
  const [formContractDate, setFormContractDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formFacts, setFormFacts] = useState<string>('');
  const [formLegalBasis, setFormLegalBasis] = useState<string>('');
  const [formPetitum, setFormPetitum] = useState<string>('');
  const [formEvidence, setFormEvidence] = useState<string>('');
  const [selectedPromissoryNote, setSelectedPromissoryNote] = useState<PromissoryNoteData | null>(null);

  // Form Attachments State (Strictly PDF only)
  const [formAttachments, setFormAttachments] = useState<CourtAttachment[]>([]);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);

  // Ruling modal for teacher/judge
  const [rulingLawsuit, setRulingLawsuit] = useState<CourtLawsuit | null>(null);
  const [rulingType, setRulingType] = useState<'estimatoria' | 'desestimatoria'>('estimatoria');
  const [rulingComments, setRulingComments] = useState<string>('');

  // Defendant Answer Modal State
  const [answeringLawsuit, setAnsweringLawsuit] = useState<CourtLawsuit | null>(null);
  const [answerType, setAnswerType] = useState<'ordinaria_contestacion' | 'cambiaria_ya_pagado' | 'cambiaria_paga_ahora'>('ordinaria_contestacion');
  const [answerFacts, setAnswerFacts] = useState<string>('');
  const [answerAttachments, setAnswerAttachments] = useState<CourtAttachment[]>([]);
  const [isDraggingAnswerPdf, setIsDraggingAnswerPdf] = useState(false);
  const [answerPdfError, setAnswerPdfError] = useState<string | null>(null);

  const fetchCourtData = async () => {
    setIsLoading(true);
    try {
      // Mark court notifications as read
      fetch('/api/court/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, role: currentUser.role })
      }).catch(() => {});

      const [lawsuitsRes, usersRes, notesRes] = await Promise.all([
        fetch(`/api/court/lawsuits?userId=${currentUser.id}`),
        fetch('/api/users'),
        fetch(`/api/court/unpaid-notes?userId=${currentUser.id}`)
      ]);

      if (lawsuitsRes.ok) {
        const lData = await lawsuitsRes.json();
        setLawsuits(lData.lawsuits || []);
      }
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsersList((uData.users || []).filter((u: User) => u.id !== currentUser.id && u.role === 'student'));
      }
      if (notesRes.ok) {
        const nData = await notesRes.json();
        setUnpaidNotes(nData.notes || []);
      }
    } catch (err) {
      console.error('Error fetching court data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCourtData();
  }, [currentUser.id]);

  // Auto-generate template text when switching type/subtype
  useEffect(() => {
    if (formType === 'cambiaria') {
      setFormSubtype('impago_pagare');
      setFormLegalBasis(
        '1. Artículos 819 a 827 de la Ley de Enjuiciamiento Civil (LEC), reguladores del juicio cambiario especial y sumario.\n' +
        '2. Artículos 49, 94 y concordantes de la Ley 19/1985 Cambiaria y del Cheque (LCCh), relativos a la fuerza ejecutiva del pagaré y la legitimación del tomador/tenedor.\n' +
        '3. Artículo 821.2 de la LEC, que prescribe el requerimiento judicial de pago en diez días y el embargo preventivo cautelar inmediato de bienes del deudor para cubrir principal, intereses y costas.'
      );
      setFormPetitum(
        'Suplico al juzgado: que teniendo por presentado este escrito junto con el pagaré original y documentos adjuntos, se sirva admitir a trámite la presente demanda de juicio cambiario, requiriendo de pago al demandado por la suma de ' +
        (formClaimedAmount ? `${formatNumber(Number(formClaimedAmount))} €` : '[cuantía]') +
        ' de principal, más el 30% fijado por ley para intereses de demora procesal y costas; decretándose de forma inmediata e inaudita parte el embargo preventivo de los saldos de sus cuentas bancarias y bienes.'
      );
      setFormEvidence('1. Pagaré oficial emitido con firma electrónica y certificación cambiaria.\n2. Justificante de presentación al cobro y rechazo por falta de fondos bancarios.\n3. Extracto bancario acreditativo.');
    } else {
      if (formSubtype === 'incumplimiento_pago') {
        setFormLegalBasis(
          '1. Artículos 399 y 437 de la Ley de Enjuiciamiento Civil.\n' +
          '2. Artículos 325, 336 y 345 del Código de Comercio, reguladores de la compraventa mercantil y la obligación de pago del comprador.\n' +
          '3. Artículos 1089, 1091, 1100, 1108 y 1124 del Código Civil, sobre la exigibilidad de los contratos y la indemnización de daños y perjuicios moratorios.'
        );
        setFormPetitum(
          'Suplico al juzgado: que se dicte sentencia por la que se declare la plena validez y eficacia del título contractual de compraventa y se condene al demandado al abono íntegro de la cantidad reclamada de ' +
          (formClaimedAmount ? `${formatNumber(Number(formClaimedAmount))} €` : '[cuantía]') +
          ', más los intereses legales desde la fecha de devengo e imposición de las costas procesales.'
        );
        setFormEvidence('1. Registro de pedido y acuerdo mercantil formalizado en el portal de mercado.\n2. Mensajería instantánea y comunicaciones directas entre las partes.\n3. Factura mercantil emitida y extractos contables acreditativos.');
      } else {
        setFormLegalBasis(
          '1. Artículos 399 y siguientes de la Ley de Enjuiciamiento Civil.\n' +
          '2. Artículos 329, 330 y 336 del Código de Comercio sobre la obligación de entrega en tiempo y forma por el vendedor.\n' +
          '3. Artículo 1124 del Código Civil sobre la resolución o cumplimiento forzoso del contrato con resarcimiento de daños.'
        );
        setFormPetitum(
          'Suplico al juzgado: que se dicte sentencia estimatoria reconociendo el título contractual de compraventa y condenando a la parte demandada a la entrega inmediata de los bienes pactados o, subsidiariamente, a la devolución y pago de ' +
          (formClaimedAmount ? `${formatNumber(Number(formClaimedAmount))} €` : '[cuantía]') +
          ' correspondientes a los fondos transferidos y daños causados, con intereses y costas.'
        );
        setFormEvidence('1. Justificante de transferencia bancaria emitida.\n2. Pedido aceptado en el mercado de suministros.\n3. Reclamaciones enviadas a través del chat corporativo.');
      }
    }
  }, [formType, formSubtype, formClaimedAmount]);

  // Handle promissory note selection
  const handleSelectPromissoryNote = (note: PromissoryNoteData) => {
    setSelectedPromissoryNote(note);
    setFormType('cambiaria');
    setFormSubtype('impago_pagare');
    setFormDefendantId(note.issuerId);
    setFormClaimedAmount(String(note.amount));
    setFormGoodsDescription(`Pagaré cambiario oficial n.º ${note.promissoryNoteNumber} (vto: ${new Date(note.dueDate).toLocaleDateString('es-ES')}) - concepto: ${note.concept || 'Compraventa de suministros'}`);
    setFormContractDate(note.issueDate.slice(0, 10));
    setFormFacts(
      `I. El demandado (${note.issuerName}) emitió a favor de esta parte el pagaré oficial cambiario n.º ${note.promissoryNoteNumber} por importe de ${formatNumber(note.amount)} € con vencimiento el ${new Date(note.dueDate).toLocaleDateString('es-ES')}.\n\n` +
      `II. Llegada la fecha de vencimiento, esta parte procedió a presentar formalmente el efecto al cobro en la entidad bancaria librada.\n\n` +
      `III. La entidad bancaria devolvió el efecto por falta de fondos suficientes en la cuenta del librador, resultando la deuda líquida, vencida y plenamente exigible por la vía ejecutiva cambiaria.`
    );
  };

  // Handle PDF files upload (Strictly PDF only)
  const handlePdfFiles = (files: FileList | File[]) => {
    setPdfUploadError(null);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach(file => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        if (file.size > 15 * 1024 * 1024) {
          invalidFiles.push(`${file.name} (excede el límite máximo de 15 MB)`);
        } else {
          validFiles.push(file);
        }
      } else {
        invalidFiles.push(`${file.name} (formato no permitido: solo se admite .pdf)`);
      }
    });

    if (invalidFiles.length > 0) {
      setPdfUploadError(`⚠️ Solo se admite documentación en formato PDF (.pdf):\n${invalidFiles.join('\n')}`);
    }

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newAttachment: CourtAttachment = {
          id: 'doc-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
          name: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          dataUrl,
          docType: 'documento_probatorio_pdf'
        };
        setFormAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (id: string) => {
    setFormAttachments(prev => prev.filter(att => att.id !== id));
  };

  // Open Defendant Answer Modal
  const openAnswerModal = (lawsuit: CourtLawsuit) => {
    setAnsweringLawsuit(lawsuit);
    setAnswerFacts('');
    setAnswerAttachments([]);
    setAnswerPdfError(null);
    if (lawsuit.type === 'cambiaria') {
      setAnswerType('cambiaria_ya_pagado');
    } else {
      setAnswerType('ordinaria_contestacion');
    }
  };

  // Handle PDF files upload for Defendant Answer
  const handleAnswerPdfFiles = (files: FileList | File[]) => {
    setAnswerPdfError(null);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach(file => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        if (file.size > 15 * 1024 * 1024) {
          invalidFiles.push(`${file.name} (excede el límite máximo de 15 MB)`);
        } else {
          validFiles.push(file);
        }
      } else {
        invalidFiles.push(`${file.name} (formato no permitido: solo se admite .pdf)`);
      }
    });

    if (invalidFiles.length > 0) {
      setAnswerPdfError(`⚠️ Solo se admite documentación en formato PDF (.pdf):\n${invalidFiles.join('\n')}`);
    }

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newAttachment: CourtAttachment = {
          id: 'doc-ans-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
          name: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          dataUrl,
          docType: 'documento_probatorio_pdf'
        };
        setAnswerAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAnswerAttachment = (id: string) => {
    setAnswerAttachments(prev => prev.filter(att => att.id !== id));
  };

  // Submit Defendant Answer
  const handleDefendantAnswerSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!answeringLawsuit) return;

    if (answerType === 'ordinaria_contestacion' && !answerFacts.trim()) {
      setAnswerPdfError('Debes incluir las alegaciones y fundamentos de tu contestación a la demanda.');
      return;
    }

    if (answerType === 'cambiaria_ya_pagado' && !answerFacts.trim() && answerAttachments.length === 0) {
      setAnswerPdfError('Por favor, indica los detalles del pago previo o adjunta el justificante bancario en PDF.');
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    setAnswerPdfError(null);

    try {
      const res = await fetch(`/api/court/lawsuits/${answeringLawsuit.id}/defendant-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defendantId: currentUser.id,
          answerType,
          facts: answerFacts,
          attachments: answerAttachments
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al presentar la contestación a la demanda.');
      }

      const lawyerFeeMsg = data.lawyerFee 
        ? ` Se ha abonado la minuta del letrado de la defensa por ${formatNumber(data.lawyerFee.total)} € (${formatNumber(data.lawyerFee.amount)} € + ${formatNumber(data.lawyerFee.iva)} € IVA - Fra: ${data.lawyerFee.invoiceNumber}).`
        : '';

      setFeedbackMsg({
        type: 'success',
        text: `✓ ${data.message || 'Contestación a la demanda formalizada con éxito.'}${lawyerFeeMsg}`
      });

      if (onUserBalanceUpdated && typeof data.newBalance === 'number') {
        onUserBalanceUpdated(data.newBalance);
      }

      setAnsweringLawsuit(null);
      fetchCourtData();
      if (selectedLawsuitForView && selectedLawsuitForView.id === answeringLawsuit.id) {
        setSelectedLawsuitForView(data.lawsuit);
      }
    } catch (err: any) {
      setAnswerPdfError(err.message || 'Error al registrar la contestación a la demanda.');
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al registrar la contestación a la demanda.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit lawsuit
  const handleSubmitLawsuit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formDefendantId) {
      setFeedbackMsg({ type: 'error', text: 'Por favor, selecciona la empresa o alumno demandado.' });
      return;
    }
    if (!formClaimedAmount || Number(formClaimedAmount) <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Por favor, introduce una cuantía reclamada válida y superior a 0 €.' });
      return;
    }
    if (!formFacts.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Por favor, redacta los hechos de la demanda.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/court/lawsuits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          subtype: formSubtype,
          plaintiffId: currentUser.id,
          defendantId: formDefendantId,
          claimedAmount: Number(formClaimedAmount),
          goodsDescription: formGoodsDescription.trim() || 'Compraventa mercantil de suministros / productos',
          contractDate: formContractDate,
          facts: formFacts,
          legalBasis: formLegalBasis,
          petitum: formPetitum,
          evidenceSummary: formEvidence,
          attachments: formAttachments,
          promissoryNoteNumber: selectedPromissoryNote?.promissoryNoteNumber,
          promissoryNoteId: selectedPromissoryNote?.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al interponer la demanda.');
      }

      const lawyerFeeMsg = data.lawyerFee 
        ? ` Se ha abonado la minuta del letrado por ${formatNumber(data.lawyerFee.total)} € (${formatNumber(data.lawyerFee.amount)} € + ${formatNumber(data.lawyerFee.iva)} € IVA - Fra: ${data.lawyerFee.invoiceNumber}).`
        : '';

      setFeedbackMsg({
        type: 'success',
        text: `✓ Demanda interpuesta formalmente con autos n.º ${data.lawsuit.caseNumber}.${lawyerFeeMsg} El procedimiento queda pendiente de auto de admisión a trámite por el magistrado-juez.`
      });

      if (onUserBalanceUpdated && typeof data.newBalance === 'number') {
        onUserBalanceUpdated(data.newBalance);
      }

      // Reset form
      setFormDefendantId('');
      setFormClaimedAmount('');
      setFormGoodsDescription('');
      setFormFacts('');
      setFormAttachments([]);
      setPdfUploadError(null);
      setSelectedPromissoryNote(null);
      setActiveTab('demandas');
      fetchCourtData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al registrar la demanda judicial.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Teacher / Judge: Auto de admisión a trámite o Inadmisión
  const handleJudgeAdmission = async (lawsuit: CourtLawsuit, admission: 'admitir' | 'rechazar') => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/court/lawsuits/${lawsuit.id}/judge-admission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admission,
          judgeId: currentUser.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al dictar la resolución de admisión.');
      }

      setFeedbackMsg({
        type: 'success',
        text: `✓ ${data.message || (admission === 'admitir' ? `Auto de admisión dictado en los autos ${lawsuit.caseNumber}. Demandado emplazado.` : `Auto de inadmisión dictado en los autos ${lawsuit.caseNumber}.`)}`
      });

      fetchCourtData();
      if (selectedLawsuitForView && selectedLawsuitForView.id === lawsuit.id) {
        setSelectedLawsuitForView(data.lawsuit);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al resolver la admisión de la demanda.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Teacher / Judge: Embargo Preventivo Cautelar (Juicio Cambiario - Art. 821 LEC)
  const handlePreventativeEmbargo = async (lawsuit: CourtLawsuit) => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/court/lawsuits/${lawsuit.id}/preventative-embargo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judgeId: currentUser.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al decretar el embargo preventivo cautelar.');
      }

      setFeedbackMsg({
        type: 'success',
        text: `✓ ${data.message || `Auto de embargo preventivo (art. 821 LEC) dictado en los autos ${lawsuit.caseNumber}. Fondos consignados en depósito judicial.`}`
      });

      fetchCourtData();
      if (selectedLawsuitForView && selectedLawsuitForView.id === lawsuit.id) {
        setSelectedLawsuitForView(data.lawsuit);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al decretar embargo preventivo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Settle / Pay lawsuit voluntarily (Allanamiento)
  const handleSettleLawsuit = async (lawsuit: CourtLawsuit) => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/court/lawsuits/${lawsuit.id}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerId: currentUser.id })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al allanarse y pagar la demanda judicial.');
      }

      setFeedbackMsg({
        type: 'success',
        text: `✓ Deuda judicial de ${formatNumber(lawsuit.claimedAmount)} € satisfecha con éxito. Procedimiento ${lawsuit.caseNumber} cerrado por allanamiento.`
      });

      if (onUserBalanceUpdated && typeof data.newBalance === 'number') {
        onUserBalanceUpdated(data.newBalance);
      }

      fetchCourtData();
      if (selectedLawsuitForView && selectedLawsuitForView.id === lawsuit.id) {
        setSelectedLawsuitForView(data.lawsuit);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al liquidar la demanda.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Judge / Teacher ruling
  const handleJudgeRuling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulingLawsuit) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/court/lawsuits/${rulingLawsuit.id}/judge-ruling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruling: rulingType,
          comments: rulingComments,
          judgeId: currentUser.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al dictar la resolución judicial.');
      }

      setFeedbackMsg({
        type: 'success',
        text: `✓ Resolución judicial dictada en los autos ${rulingLawsuit.caseNumber} (${rulingType === 'estimatoria' ? 'Estimada con ejecución' : 'Desestimada'}).`
      });

      setRulingLawsuit(null);
      fetchCourtData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al dictar resolución.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Printable window for lawsuit document
  const openPrintableLawsuitWindow = (lawsuit: CourtLawsuit) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes en tu navegador para ver e imprimir la demanda.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Escrito judicial - Autos ${lawsuit.caseNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 20mm; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; margin: 0; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 25px; }
          .court-title { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
          .court-sub { font-size: 11pt; color: #444; margin-top: 4px; }
          .case-badge { display: inline-block; padding: 4px 12px; background: #eee; border: 1px solid #999; font-family: monospace; font-size: 11pt; font-weight: bold; margin-top: 10px; }
          .meta-box { border: 1px solid #777; padding: 12px; margin-bottom: 20px; font-size: 11pt; background-color: #fafafa; }
          .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .meta-label { font-weight: bold; }
          h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
          p { margin: 8px 0; text-align: justify; }
          .stamp { float: right; margin-top: 30px; text-align: center; border: 2px dashed #666; padding: 10px 20px; width: 220px; }
          .seal-text { font-size: 9pt; font-weight: bold; color: #333; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #1e293b; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            🖨️ Imprimir / guardar en PDF
          </button>
        </div>

        <div class="header">
          <div class="court-title">Administración de justicia</div>
          <div class="court-title" style="font-size: 13pt; margin-top: 4px;">${lawsuit.courtName}</div>
          <div class="court-sub">Sede electrónica judicial y registro de procedimientos civiles y mercantiles</div>
          <div class="case-badge">Autos n.º: ${lawsuit.caseNumber}</div>
        </div>

        <div class="meta-box">
          <div class="meta-row"><span class="meta-label">Clase de procedimiento:</span> <span>${lawsuit.type === 'cambiaria' ? 'Juicio cambiario (título ejecutivo cambiario)' : 'Juicio declarativo ordinario (incumplimiento contractual)'}</span></div>
          <div class="meta-row"><span class="meta-label">Parte demandante (actor):</span> <span>${lawsuit.plaintiffName} (${lawsuit.plaintiffNif || 'NIF-ES'})</span></div>
          <div class="meta-row"><span class="meta-label">Parte demandada:</span> <span>${lawsuit.defendantName} (${lawsuit.defendantNif || 'NIF-ES'})</span></div>
          <div class="meta-row"><span class="meta-label">Cuantía principal reclamada:</span> <span>${lawsuit.claimedAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>
          <div class="meta-row"><span class="meta-label">Intereses y costas previstas:</span> <span>${lawsuit.interestAndCostsAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>
          <div class="meta-row"><span class="meta-label">Fecha de registro judicial:</span> <span>${new Date(lawsuit.createdAt).toLocaleDateString('es-ES')}</span></div>
          <div class="meta-row"><span class="meta-label">Estado procesal actual:</span> <span style="font-weight: bold;">${lawsuit.status.replace('_', ' ')}</span></div>
        </div>

        <p><strong>Al Juzgado de Primera Instancia</strong></p>
        <p>
          D./Dña. <strong>${lawsuit.plaintiffName}</strong>, en su propio nombre y representación, comparece en autos y como mejor proceda en Derecho, <strong>dice:</strong>
        </p>
        <p>
          Que por medio del presente escrito formula <strong>${lawsuit.type === 'cambiaria' ? 'demanda de juicio cambiario' : 'demanda ordinaria de reclamación contractual y de cantidad'}</strong> contra <strong>${lawsuit.defendantName}</strong>, en base a los siguientes:
        </p>

        <h2>I. Hechos</h2>
        <p style="white-space: pre-line;">${lawsuit.facts}</p>

        <h2>II. Fundamentos de derecho</h2>
        <p style="white-space: pre-line;">${lawsuit.legalBasis}</p>

        <h2>III. Medios de prueba aportados</h2>
        <p style="white-space: pre-line;">${lawsuit.evidenceSummary}</p>

        <h2>IV. Documentos probatorios adjuntos (formato PDF)</h2>
        ${
          lawsuit.attachments && lawsuit.attachments.length > 0
            ? `<ul style="margin: 8px 0; padding-left: 20px;">
                ${lawsuit.attachments
                  .map(
                    (att, idx) =>
                      `<li style="margin-bottom: 4px;"><strong>Doc. n.º ${idx + 1}:</strong> ${att.name} (${(att.size / 1024).toFixed(1)} KB) - Registrado digitalmente</li>`
                  )
                  .join('')}
              </ul>`
            : '<p><em>No se adjuntaron ficheros complementarios en el momento de la interposición.</em></p>'
        }

        <h2>V. Suplico al juzgado</h2>
        <p style="white-space: pre-line;">${lawsuit.petitum}</p>

        ${
          lawsuit.defendantAnswered
            ? `
            <div style="margin-top: 35px; border-top: 2px solid #111; padding-top: 20px;">
              <div style="font-size: 13pt; font-weight: bold; text-align: center; margin-bottom: 10px;">
                Escrito de contestación y alegaciones de la parte demandada
              </div>
              <div class="meta-box" style="background-color: #f1f5f9;">
                <div class="meta-row"><span class="meta-label">Parte que contesta:</span> <span>${lawsuit.defendantName} (${lawsuit.defendantNif || 'NIF-ES'})</span></div>
                <div class="meta-row"><span class="meta-label">Modalidad de respuesta:</span> <span>${
                  lawsuit.defendantAnswerType === 'ordinaria_contestacion'
                    ? 'Contestación a la demanda ordinaria (plazo 20 días hábiles)'
                    : lawsuit.defendantAnswerType === 'cambiaria_ya_pagado'
                    ? 'Oposición cambiaria por pago previo extintivo (art. 824 LEC)'
                    : 'Allanamiento y pago voluntario'
                }</span></div>
                <div class="meta-row"><span class="meta-label">Fecha de presentación:</span> <span>${lawsuit.defendantAnswerDate ? new Date(lawsuit.defendantAnswerDate).toLocaleDateString('es-ES') : '-'}</span></div>
                ${
                  lawsuit.defendantLawyerFeeTotal && lawsuit.defendantLawyerFeeTotal > 0
                    ? `<div class="meta-row"><span class="meta-label">Minuta letrado de la defensa:</span> <span>${lawsuit.defendantLawyerFeeTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € (15% + IVA) - Fra: ${lawsuit.defendantLawyerFeeInvoiceNumber || 'FRA-ABOG'}</span></div>`
                    : ''
                }
              </div>

              <h2>VI. Alegaciones y hechos de la defensa</h2>
              <p style="white-space: pre-line;">${lawsuit.defendantAnswerFacts || 'Sin alegaciones adicionales redactadas.'}</p>

              <h2>VII. Documentos probatorios aportados por la defensa (PDF)</h2>
              ${
                lawsuit.defendantAnswerAttachments && lawsuit.defendantAnswerAttachments.length > 0
                  ? `<ul style="margin: 8px 0; padding-left: 20px;">
                      ${lawsuit.defendantAnswerAttachments
                        .map(
                          (att, idx) =>
                            `<li style="margin-bottom: 4px;"><strong>Doc. defensa n.º ${idx + 1}:</strong> ${att.name} (${(att.size / 1024).toFixed(1)} KB) - Registrado digitalmente</li>`
                        )
                        .join('')}
                    </ul>`
                  : '<p><em>No se aportaron documentos complementarios con la contestación.</em></p>'
              }
            </div>
            `
            : ''
        }

        ${
          lawsuit.resolutionNotes
            ? `
            <div style="margin-top: 35px; border-top: 2px solid #111; padding-top: 20px;">
              <div style="font-size: 13pt; font-weight: bold; text-align: center; margin-bottom: 10px;">
                Fallo / resolución judicial definitiva
              </div>
              <div class="meta-box" style="background-color: ${lawsuit.status === 'desestimada' ? '#fff1f2' : '#f0fdf4'}; border-color: ${lawsuit.status === 'desestimada' ? '#f43f5e' : '#22c55e'};">
                <div class="meta-row"><span class="meta-label">Estado procesal:</span> <span style="font-weight: bold; color: ${lawsuit.status === 'desestimada' ? '#b91c1c' : '#15803d'};">${
                  lawsuit.status === 'desestimada' ? 'Sentencia desestimatoria (con condena en costas al actor)' : lawsuit.status === 'ejecutada' ? 'Sentencia estimatoria firme' : 'Auto de inadmisión'
                }</span></div>
                <div class="meta-row"><span class="meta-label">Fecha de resolución:</span> <span>${lawsuit.resolutionDate ? new Date(lawsuit.resolutionDate).toLocaleDateString('es-ES') : '-'}</span></div>
                ${
                  lawsuit.status === 'desestimada' && lawsuit.costsPaid
                    ? `<div class="meta-row"><span class="meta-label">Costas procesales devengadas:</span> <span style="font-weight: bold;">${lawsuit.costsPaid.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € (abonadas por el demandante ${lawsuit.plaintiffName} al demandado ${lawsuit.defendantName})</span></div>`
                    : ''
                }
              </div>
              <h2>VIII. Fundamentación y pronunciamiento judicial</h2>
              <p style="white-space: pre-line;">${lawsuit.resolutionNotes}</p>
              ${lawsuit.judgeComments ? `<p style="margin-top: 8px; font-style: italic;"><strong>Observaciones del juzgado:</strong> ${lawsuit.judgeComments}</p>` : ''}
            </div>
            `
            : ''
        }

        <div style="margin-top: 40px;">
          <p>En la Sede Judicial, a ${new Date(lawsuit.resolutionDate || lawsuit.createdAt).toLocaleDateString('es-ES')}.</p>
          <div class="stamp">
            <div class="seal-text">⚖️ Registro electrónico judicial</div>
            <div style="font-size: 8pt; font-family: monospace; margin-top: 5px;">HASH: ${lawsuit.id.slice(0, 16)}</div>
            <div style="font-size: 8pt; color: #444; margin-top: 4px;">Firma digital verificada</div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Filtered lawsuits
  const filteredLawsuits = lawsuits.filter(l => {
    if (filterType === 'plaintiff' && l.plaintiffId !== currentUser.id) return false;
    if (filterType === 'defendant' && l.defendantId !== currentUser.id) return false;
    if (filterType === 'cambiaria' && l.type !== 'cambiaria') return false;
    if (filterType === 'ordinaria' && l.type !== 'ordinaria') return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        l.caseNumber.toLowerCase().includes(s) ||
        l.plaintiffName.toLowerCase().includes(s) ||
        l.defendantName.toLowerCase().includes(s) ||
        l.goodsDescription.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al menú principal</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold text-white leading-tight flex items-center gap-2">
                  <span>Juzgado de 1ª Instancia e Instrucción</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                    Sede judicial
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Portal electrónico de litigios mercantiles y juicios cambiarios</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-slate-400 font-medium">{currentUser.name}</div>
              <div className="text-xs font-bold text-amber-400 font-mono">
                {formatNumber(currentUser.balance)} €
              </div>
            </div>
            <button
              onClick={fetchCourtData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Actualizar datos judiciales"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Feedback Message */}
        {feedbackMsg && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs sm:text-sm font-medium shadow-md ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                : feedbackMsg.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
                : 'bg-blue-950/80 border-blue-500/50 text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
              {feedbackMsg.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
              {feedbackMsg.type === 'info' && <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />}
              <span>{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* PRESIDING JUDGE BANNER (MAGISTRADO-JUEZ / PROFESOR) */}
        {isJudge && (
          <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border border-amber-500/40 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Gavel className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                    🏛️ Sala de gobierno jurisdiccional · Magistrado-juez titular
                  </span>
                  <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full shadow">
                    Perfil: Magistrado titular
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Simulación de juez activa: Tienes la potestad exclusiva de admitir, examinar y dictar sentencia firme con ejecución forzosa en todos los procedimientos del simulador.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Expedientes en trámite</div>
                <div className="text-xs font-bold text-amber-400 font-mono">
                  {lawsuits.filter(l => l.status === 'admitida').length} pendientes de sentencia
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('demandas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'demandas'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Autos y expedientes</span>
              {lawsuits.length > 0 && (
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-black ${activeTab === 'demandas' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'}`}>
                  {lawsuits.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('nueva_demanda')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'nueva_demanda'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Interponer demanda</span>
            </button>

            <button
              onClick={() => setActiveTab('guia')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'guia'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Guía procesal y tipos de demanda</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Jurisdicción civil y mercantil</span>
          </div>
        </div>

        {/* TAB 1: LISTADO DE DEMANDAS Y AUTOS */}
        {activeTab === 'demandas' && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    filterType === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({lawsuits.length})
                </button>
                <button
                  onClick={() => setFilterType('plaintiff')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    filterType === 'plaintiff' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Como demandante ({lawsuits.filter(l => l.plaintiffId === currentUser.id).length})
                </button>
                <button
                  onClick={() => setFilterType('defendant')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    filterType === 'defendant' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Demandas en mi contra ({lawsuits.filter(l => l.defendantId === currentUser.id).length})
                </button>
                <button
                  onClick={() => setFilterType('cambiaria')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    filterType === 'cambiaria' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Juicios cambiarios ({lawsuits.filter(l => l.type === 'cambiaria').length})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por autos, partes..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Lawsuits Grid / List */}
            {filteredLawsuits.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                  <Scale className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-300">No hay procedimientos judiciales registrados</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Cuando interpongas una demanda o recibas una reclamación mercantil/cambiaria, aparecerá registrada en esta bandeja de autos.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('nueva_demanda')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs transition inline-flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Interponer nueva demanda</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredLawsuits.map(lawsuit => {
                  const isPlaintiff = lawsuit.plaintiffId === currentUser.id;
                  const isDefendant = lawsuit.defendantId === currentUser.id;

                  return (
                    <div
                      key={lawsuit.id}
                      className={`p-5 rounded-2xl border transition shadow-md relative overflow-hidden flex flex-col justify-between space-y-4 ${
                        lawsuit.status === 'allanada_pagada' || lawsuit.status === 'ejecutada'
                          ? 'bg-slate-900/60 border-slate-800'
                          : lawsuit.type === 'cambiaria'
                          ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/40 border-blue-500/40'
                          : 'bg-slate-900/90 border-slate-700'
                      }`}
                    >
                      {/* Top Badges & Case Number */}
                      <div>
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-amber-400 tracking-wider">
                                {lawsuit.caseNumber}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                                  lawsuit.type === 'cambiaria'
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {lawsuit.type === 'cambiaria' ? 'Juicio cambiario (pagaré)' : 'Demanda ordinaria'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              Registrada el {new Date(lawsuit.createdAt).toLocaleDateString('es-ES')}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div>
                            {lawsuit.status === 'pendiente_admision' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>Pendiente de admisión</span>
                              </span>
                            )}
                            {lawsuit.status === 'admitida' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                <Clock className="w-3 h-3 text-blue-400" />
                                <span>Admitida a trámite</span>
                              </span>
                            )}
                            {lawsuit.status === 'embargo_preventivo' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <ShieldAlert className="w-3 h-3 text-amber-400" />
                                <span>Embargo preventivo (art. 821 LEC)</span>
                              </span>
                            )}
                            {lawsuit.status === 'inadmitida' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <X className="w-3 h-3 text-rose-400" />
                                <span>Inadmitida / rechazada</span>
                              </span>
                            )}
                            {lawsuit.status === 'allanada_pagada' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Allanada / pagada</span>
                              </span>
                            )}
                            {lawsuit.status === 'ejecutada' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                <Gavel className="w-3 h-3 text-purple-400" />
                                <span>Sentencia estimatoria firme</span>
                              </span>
                            )}
                            {lawsuit.status === 'desestimada' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 border border-slate-600">
                                <X className="w-3 h-3" />
                                <span>Sentencia desestimatoria</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Parties & Amounts */}
                        <div className="grid grid-cols-2 gap-3 mt-3.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                          <div>
                            <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                              <span>Demandante (actor)</span>
                              {isPlaintiff && <span className="text-amber-400 text-[9px] font-black">(tú)</span>}
                            </div>
                            <div className="text-xs font-semibold text-white truncate">{lawsuit.plaintiffName}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                              <span>Demandado</span>
                              {isDefendant && <span className="text-rose-400 text-[9px] font-black">(tú)</span>}
                            </div>
                            <div className="text-xs font-semibold text-rose-300 truncate">{lawsuit.defendantName}</div>
                          </div>

                          <div className="col-span-2 pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                            <span className="text-slate-400">Cuantía reclamada:</span>
                            <span className="font-black text-amber-400 font-mono text-sm">
                              {formatNumber(lawsuit.claimedAmount)} €
                              {lawsuit.interestAndCostsAmount > 0 && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                  (+{formatNumber(lawsuit.interestAndCostsAmount)} € costas/int.)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Concept / Goods summary */}
                        <div className="mt-3 text-xs text-slate-300">
                          <span className="font-semibold text-slate-400">Objeto: </span>
                          <span className="italic">{lawsuit.goodsDescription}</span>
                        </div>

                        {/* PDF Attachments badge if present */}
                        {lawsuit.attachments && lawsuit.attachments.length > 0 && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-xl w-fit">
                            <Paperclip className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-semibold">
                              {lawsuit.attachments.length} {lawsuit.attachments.length === 1 ? 'documento PDF aportado por el actor' : 'documentos PDF aportados por el actor'}
                            </span>
                            <span className="text-[10px] text-amber-400/80">({(lawsuit.attachments.reduce((sum, a) => sum + (a.size || 0), 0) / 1024).toFixed(1)} KB)</span>
                          </div>
                        )}

                        {/* Lawyer fee summary badge if recorded */}
                        {lawsuit.lawyerFeeTotal && lawsuit.lawyerFeeTotal > 0 && (
                          <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Minuta actor (15% + IVA): <strong>{formatNumber(lawsuit.lawyerFeeTotal)} €</strong> (Base: {formatNumber(lawsuit.lawyerFeeAmount || Number((lawsuit.lawyerFeeTotal / 1.21).toFixed(2)))} € + IVA: {formatNumber(lawsuit.lawyerFeeIva || Number((lawsuit.lawyerFeeTotal - (lawsuit.lawyerFeeTotal / 1.21)).toFixed(2)))} € · Fra: {lawsuit.lawyerFeeInvoiceNumber || 'FRA-ABOG'})</span>
                          </div>
                        )}

                        {/* Defendant Contestación Status or Deadline Box */}
                        {(lawsuit.status === 'admitida' || lawsuit.status === 'embargo_preventivo' || lawsuit.defendantAnswered) && (
                          <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                            {lawsuit.defendantAnswered ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <FileCheck className="w-3.5 h-3.5" />
                                    <span>Contestación formalizada en autos</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {lawsuit.defendantAnswerDate ? new Date(lawsuit.defendantAnswerDate).toLocaleDateString('es-ES') : ''}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-300">
                                  <strong>Modalidad:</strong>{' '}
                                  {lawsuit.defendantAnswerType === 'ordinaria_contestacion'
                                    ? 'Contestación y alegaciones de oposición'
                                    : lawsuit.defendantAnswerType === 'cambiaria_ya_pagado'
                                    ? 'Oposición cambiaria (alegación de pago previo extintivo)'
                                    : 'Allanamiento y pago voluntario'}
                                </div>
                                {lawsuit.defendantLawyerFeeTotal && lawsuit.defendantLawyerFeeTotal > 0 && (
                                  <div className="text-[10px] text-slate-400">
                                    Minuta letrado defensa (15% + IVA): <strong>{formatNumber(lawsuit.defendantLawyerFeeTotal)} €</strong> (Fra: {lawsuit.defendantLawyerFeeInvoiceNumber})
                                  </div>
                                )}
                                {lawsuit.defendantAnswerAttachments && lawsuit.defendantAnswerAttachments.length > 0 && (
                                  <div className="text-[10px] text-amber-300 flex items-center gap-1 pt-0.5">
                                    <Paperclip className="w-3 h-3 text-amber-400" />
                                    <span>{lawsuit.defendantAnswerAttachments.length} PDF(s) de prueba aportados por la defensa</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-amber-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>
                                      {lawsuit.type === 'cambiaria'
                                        ? 'Plazo de oposición cambiaria: 10 días hábiles'
                                        : 'Plazo de contestación: 20 días hábiles'}
                                    </span>
                                  </span>
                                  {lawsuit.defendantDeadlineDate && (
                                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                                      Límite: {new Date(lawsuit.defendantDeadlineDate).toLocaleDateString('es-ES')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400">
                                  {isDefendant
                                    ? lawsuit.type === 'cambiaria'
                                      ? 'Puedes alegar pago previo con justificante PDF o pagar en este momento.'
                                      : 'Puedes contestar alegando hechos y aportando documentación en PDF (se devengará minuta letrada del 15% + IVA).'
                                    : 'Emplazamiento legal en curso. Pendiente de que la parte demandada formalice su contestación.'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Resolution notes if resolved */}
                        {lawsuit.resolutionNotes && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300">
                            <div className="font-bold text-amber-400 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Resolución judicial:</span>
                            </div>
                            <p className="mt-0.5">{lawsuit.resolutionNotes}</p>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedLawsuitForView(lawsuit)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ver escrito {lawsuit.defendantAnswered ? 'y contestación' : 'de demanda'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openPrintableLawsuitWindow(lawsuit)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                            title="Imprimir o exportar escrito judicial"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-400" />
                            <span>Imprimir / PDF</span>
                          </button>
                        </div>

                        {/* Defendant Action: Contestar a la Demanda */}
                        {isDefendant && (lawsuit.status === 'admitida' || lawsuit.status === 'embargo_preventivo') && !lawsuit.defendantAnswered && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openAnswerModal(lawsuit)}
                              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer"
                              title="Contestar formalmente a la demanda aportando alegaciones y documentos PDF"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>
                                {lawsuit.type === 'cambiaria' ? 'Contestar / oponerse' : 'Contestar demanda (20 días)'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleSettleLawsuit(lawsuit)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md cursor-pointer disabled:opacity-50"
                              title="Pagar íntegramente la cantidad reclamada y archivar los autos"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Pagar ({formatNumber(lawsuit.claimedAmount)} €)</span>
                            </button>
                          </div>
                        )}

                        {/* Teacher/Judge Action Phase 1: Admitir a trámite o Rechazar */}
                        {isJudge && lawsuit.status === 'pendiente_admision' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleJudgeAdmission(lawsuit, 'admitir')}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                              title="Admitir a trámite y emplazar a las partes"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Admitir a trámite</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleJudgeAdmission(lawsuit, 'rechazar')}
                              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                              title="Inadmitir y archivar la demanda"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Inadmitir / rechazar</span>
                            </button>
                          </div>
                        )}

                        {/* Teacher/Judge Action Phase 2: Estimar, Desestimar, o Embargo Preventivo */}
                        {isJudge && (lawsuit.status === 'admitida' || lawsuit.status === 'embargo_preventivo') && (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Juicio Cambiario 3rd Button: Embargo Preventivo (Art. 821 LEC) */}
                            {lawsuit.type === 'cambiaria' && lawsuit.status === 'admitida' && (
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handlePreventativeEmbargo(lawsuit)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                                title="Decretar e inmovilizar judicialmente los fondos en cuenta bancaria del deudor"
                              >
                                <ShieldAlert className="w-3.5 h-3.5 text-blue-200" />
                                <span>Embargo preventivo (art. 821 LEC)</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setRulingLawsuit(lawsuit);
                                setRulingType('estimatoria');
                                setRulingComments('Estimada íntegramente la demanda con expresa imposición de costas.');
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer"
                            >
                              <Gavel className="w-3.5 h-3.5" />
                              <span>Estimar demanda</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRulingLawsuit(lawsuit);
                                setRulingType('desestimatoria');
                                setRulingComments('Desestimada la demanda por falta de acreditación probatoria bastante.');
                              }}
                              className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-rose-700 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Desestimar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FORMULARIO DE INTERPOSICIÓN DE DEMANDA */}
        {activeTab === 'nueva_demanda' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amber-400" />
                  <span>Redacción y presentación oficial de demanda judicial</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Sede judicial electrónica de Primera Instancia. Selecciona la modalidad procesal y cumplimenta los hechos y fundamentos.
                </p>
              </div>

              <form onSubmit={handleSubmitLawsuit} className="space-y-6">
                {/* Paso 1: Tipo de Demanda */}
                <div className="space-y-3">
                  <label className="text-xs font-extrabold uppercase text-amber-400 tracking-wider">
                    1. Modalidad de demanda judicial
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormType('ordinaria')}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                        formType === 'ordinaria'
                          ? 'bg-amber-500/10 border-amber-500 text-amber-200 ring-2 ring-amber-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-white">Demanda ordinaria / contractual</span>
                        <FileText className="w-5 h-5 text-amber-400" />
                      </div>
                      <p className="text-xs text-slate-300">
                        Reclamación por <strong>incumplimiento de compraventa</strong>: cuando el comprador no ha pagado la mercancía acordada o el vendedor no la ha entregado.
                      </p>
                      <span className="text-[10px] text-amber-400 font-semibold">Arts. 399 LEC & C. Comercio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormType('cambiaria')}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                        formType === 'cambiaria'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-200 ring-2 ring-blue-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-white">Demanda de juicio cambiario</span>
                        <Scale className="w-5 h-5 text-blue-400" />
                      </div>
                      <p className="text-xs text-slate-300">
                        Acción especial y sumaria por <strong>impago de pagaré oficial</strong> al vencimiento. Incluye embargo preventivo de cuentas y bienes.
                      </p>
                      <span className="text-[10px] text-blue-400 font-semibold">Arts. 819-827 LEC & Ley Cambiaria</span>
                    </button>
                  </div>
                </div>

                {/* Subtipo para demanda ordinaria */}
                {formType === 'ordinaria' && (
                  <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                    <label className="text-xs font-bold text-slate-300">Motivo del litigio contractual:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="subtype"
                          value="incumplimiento_pago"
                          checked={formSubtype === 'incumplimiento_pago'}
                          onChange={() => setFormSubtype('incumplimiento_pago')}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        <span>Falta de pago por el comprador</span>
                      </label>
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="subtype"
                          value="incumplimiento_entrega"
                          checked={formSubtype === 'incumplimiento_entrega'}
                          onChange={() => setFormSubtype('incumplimiento_entrega')}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        <span>Falta de entrega por el vendedor</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Selector rápido de pagaré para juicio cambiario */}
                {formType === 'cambiaria' && unpaidNotes.length > 0 && (
                  <div className="space-y-2 bg-blue-950/30 p-4 rounded-2xl border border-blue-500/40">
                    <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span>Seleccionar pagaré impagado de tu cartera:</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {unpaidNotes.map(note => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => handleSelectPromissoryNote(note)}
                          className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                            selectedPromissoryNote?.promissoryNoteNumber === note.promissoryNoteNumber
                              ? 'bg-blue-600 text-white border-blue-400 font-bold shadow-md'
                              : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold flex justify-between">
                            <span>{note.promissoryNoteNumber}</span>
                            <span className="font-mono text-amber-300">{formatNumber(note.amount)} €</span>
                          </div>
                          <div className="text-[11px] opacity-80 mt-0.5">Librador: {note.issuerName}</div>
                          <div className="text-[10px] text-rose-300 mt-0.5">
                            Vencido el {new Date(note.dueDate).toLocaleDateString('es-ES')} ({note.status === 'unpaid' ? 'impagado' : note.status})
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paso 2: Partes y Cuantía */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Empresa / alumno demandado:</label>
                    <select
                      value={formDefendantId}
                      onChange={e => setFormDefendantId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Selecciona el demandado --</option>
                      {usersList.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.username})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Cuantía líquida reclamada (€):</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Ej. 1500.00"
                        value={formClaimedAmount}
                        onChange={e => setFormClaimedAmount(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">€</span>
                    </div>

                    {/* Live Lawyer Fee Breakdown: 15% + 21% IVA */}
                    {Number(formClaimedAmount) > 0 && (
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] space-y-1 text-amber-200">
                        <div className="font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            <span>Minuta letrado (15% cuantía + 21% IVA):</span>
                          </span>
                          <span className="font-mono text-xs font-black text-amber-300">
                            {formatNumber(Number(formClaimedAmount) * 0.15 * 1.21)} €
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Base honorarios (15%): {formatNumber(Number(formClaimedAmount) * 0.15)} €</span>
                          <span>IVA (21%): {formatNumber(Number(formClaimedAmount) * 0.15 * 0.21)} €</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Descripción del objeto/bienes de la compraventa:</label>
                    <input
                      type="text"
                      placeholder="Ej. 500 kg de pellets de plástico y fragmentos de hierro acordados según pedido..."
                      value={formGoodsDescription}
                      onChange={e => setFormGoodsDescription(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Paso 3: Hechos y Fundamentos Procesales */}
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">I. Hechos de la demanda:</label>
                    <textarea
                      rows={4}
                      value={formFacts}
                      onChange={e => setFormFacts(e.target.value)}
                      placeholder="Redacta ordenadamente los antecedentes de hecho (acuerdo, fechas, impago o falta de entrega)..."
                      required
                      className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500 font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">II. Fundamentos de derecho:</label>
                    <textarea
                      rows={3}
                      value={formLegalBasis}
                      onChange={e => setFormLegalBasis(e.target.value)}
                      className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed focus:outline-none focus:border-amber-500 font-mono text-[11px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">III. Suplico al juzgado (petición de condena / embargo):</label>
                    <textarea
                      rows={3}
                      value={formPetitum}
                      onChange={e => setFormPetitum(e.target.value)}
                      className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500 font-sans"
                    />
                  </div>
                </div>

                {/* Paso 4: Documentación Probatoria Adjunta (SOLO FORMATO PDF) */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-amber-400" />
                      <span>IV. Documentación probatoria adjunta (solo formato PDF)</span>
                    </label>
                    <span className="text-[10px] bg-red-950/80 border border-red-500/40 text-red-300 font-black px-2 py-0.5 rounded-full">
                      Exclusivo .pdf
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Aporta facturas mercantiles, extractos bancarios, pagarés escaneados o contratos en formato PDF para fundamentar probatoriamente la pretensión ante el juez.
                  </p>

                  {/* PDF Upload Error message */}
                  {pdfUploadError && (
                    <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-start gap-2 whitespace-pre-line">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>{pdfUploadError}</div>
                    </div>
                  )}

                  {/* Drag & Drop and File Picker Area */}
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      setIsDraggingPdf(true);
                    }}
                    onDragLeave={e => {
                      e.preventDefault();
                      setIsDraggingPdf(false);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDraggingPdf(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handlePdfFiles(e.dataTransfer.files);
                      }
                    }}
                    className={`relative border-2 border-dashed rounded-2xl p-6 transition text-center cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                      isDraggingPdf
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <input
                      type="file"
                      id="pdf-upload-input"
                      multiple
                      accept=".pdf,application/pdf"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handlePdfFiles(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        Arrastra y suelta tus archivos PDF aquí, o <span className="text-amber-400 underline">haz clic para examinar</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Formatos aceptados: <strong>.pdf</strong> exclusivamente (Máx. 15 MB por documento)
                      </div>
                    </div>
                  </div>

                  {/* List of Attached PDF Documents */}
                  {formAttachments.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                        <span>Documentos listos para incorporar a los autos ({formAttachments.length}):</span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          Total: {(formAttachments.reduce((acc, curr) => acc + curr.size, 0) / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {formAttachments.map((att, idx) => (
                          <div
                            key={att.id}
                            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-700/50 px-1.5 py-0.5 rounded">
                                PDF
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-200 truncate" title={att.name}>
                                  {idx + 1}. {att.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {(att.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {att.dataUrl && (
                                <a
                                  href={att.dataUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  title="Abrir vista previa del PDF"
                                >
                                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => removeAttachment(att.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition"
                                title="Eliminar documento adjunto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Local Feedback message inside form */}
                {feedbackMsg && feedbackMsg.type === 'error' && (
                  <div className="p-3.5 bg-rose-950/90 border border-rose-500 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{feedbackMsg.text}</span>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Firma electrónica y certificación procesal inmediata</span>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setActiveTab('demandas')}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSubmitting ? 'Registrando autos...' : 'Presentar demanda oficial'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: GUÍA PROCESAL Y TIPOS DE DEMANDA */}
        {activeTab === 'guia' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-amber-400" />
                  <span>Guía procesal de litigios en el simulador empresarial</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Conceptos jurídicos fundamentales sobre reclamaciones contractuales y juicios cambiarios en el Derecho Procesal español (LEC y Código de Comercio).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Demanda ordinaria Card */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <FileText className="w-4 h-4" />
                    <span>1. Demanda declarativa ordinaria</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Se utiliza cuando surge una controversia sobre un contrato o compraventa mercantil y no se dispone de un título ejecutivo cambiario:
                  </p>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>
                      <strong className="text-slate-200">Falta de pago:</strong> El vendedor formalizó la venta o entregó los bienes y el comprador no abona el precio pactado.
                    </li>
                    <li>
                      <strong className="text-slate-200">Falta de entrega:</strong> El comprador transfirió los fondos o pactó la entrega y el vendedor incumple el plazo o la entrega del bien.
                    </li>
                    <li>
                      <strong className="text-slate-200">Procedimiento:</strong> Se solicita al juez que declare la existencia de la obligación contractual y condene al demandado al pago o cumplimiento forzoso más intereses legales y costas.
                    </li>
                  </ul>
                </div>

                {/* Juicio Cambiario Card */}
                <div className="p-5 rounded-2xl bg-blue-950/20 border border-blue-500/40 space-y-3">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                    <Scale className="w-4 h-4" />
                    <span>2. Demanda de juicio cambiario (pagaré)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Procedimiento especial, sumario y sumamente ágil regulado en los artículos 819 a 827 de la LEC para el cobro forzoso de títulos valores:
                  </p>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>
                      <strong className="text-slate-200">Fuerza ejecutiva:</strong> El pagaré cambiario lleva aparejada ejecución directa sobre el patrimonio del librador.
                    </li>
                    <li>
                      <strong className="text-slate-200">Embargo inmediato:</strong> El juzgado decreta de oficio e inaudita parte el requerimiento de pago en 10 días y el embargo preventivo cautelar sobre las cuentas bancarias del deudor.
                    </li>
                    <li>
                      <strong className="text-slate-200">Recargo del 30%:</strong> La ley prevé un 30% adicional calculado sobre el principal para responder de intereses de demora procesal y costas judiciales.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: VER ESCRITO OFICIAL DE DEMANDA */}
      {selectedLawsuitForView && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <Scale className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Escrito procesal de demanda</h3>
                  <div className="text-xs text-amber-400 font-mono font-bold">Autos n.º {selectedLawsuitForView.caseNumber}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPrintableLawsuitWindow(selectedLawsuitForView)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLawsuitForView(null)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-200 font-sans">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Demandante (actor):</span>
                  <span className="font-bold text-white text-sm">{selectedLawsuitForView.plaintiffName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Demandado:</span>
                  <span className="font-bold text-rose-300 text-sm">{selectedLawsuitForView.defendantName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Clase de procedimiento:</span>
                  <span className="font-semibold text-amber-400 uppercase">
                    {selectedLawsuitForView.type === 'cambiaria' ? 'Juicio cambiario especial' : 'Juicio declarativo ordinario'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Cuantía total reclamada:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {formatNumber(selectedLawsuitForView.totalClaimAmount || selectedLawsuitForView.claimedAmount)} €
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold uppercase text-amber-400 tracking-wider text-[11px]">I. Hechos</h4>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 leading-relaxed whitespace-pre-line text-slate-300">
                  {selectedLawsuitForView.facts}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold uppercase text-amber-400 tracking-wider text-[11px]">II. Fundamentos de derecho</h4>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 leading-relaxed whitespace-pre-line font-mono text-[11px] text-slate-400">
                  {selectedLawsuitForView.legalBasis}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold uppercase text-amber-400 tracking-wider text-[11px]">III. Suplico al juzgado</h4>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 leading-relaxed whitespace-pre-line text-slate-200 font-semibold">
                  {selectedLawsuitForView.petitum}
                </div>
              </div>

              {/* IV. Documentación Probatoria Adjunta (PDF) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold uppercase text-amber-400 tracking-wider text-[11px] flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>IV. Documentación probatoria aportada (archivos PDF)</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    {selectedLawsuitForView.attachments?.length || 0} {(selectedLawsuitForView.attachments?.length || 0) === 1 ? 'documento' : 'documentos'}
                  </span>
                </div>

                {selectedLawsuitForView.attachments && selectedLawsuitForView.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedLawsuitForView.attachments.map((att, idx) => (
                      <div
                        key={att.id || idx}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-300 shrink-0 font-bold text-[10px]">
                            PDF
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 truncate" title={att.name}>
                              {idx + 1}. {att.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {(att.size / 1024).toFixed(1)} KB · {new Date(att.uploadedAt).toLocaleDateString('es-ES')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {att.dataUrl && (
                            <>
                              <a
                                href={att.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                                title="Ver documento PDF en nueva pestaña"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                                <span>Ver</span>
                              </a>
                              <a
                                href={att.dataUrl}
                                download={att.name}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 cursor-pointer"
                                title="Descargar archivo PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 italic text-[11px]">
                    No se adjuntaron ficheros PDF complementarios en el momento de la interposición.
                  </div>
                )}
              </div>

              {/* V. ESCRITO DE CONTESTACIÓN Y PRUEBAS DEL DEMANDADO (SI YA HA SIDO PRESENTADO) */}
              {selectedLawsuitForView.defendantAnswered ? (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/40 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      <h4 className="font-extrabold uppercase text-emerald-400 tracking-wider text-[11px]">
                        V. Contestación a la demanda y alegaciones de la parte demandada
                      </h4>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">
                      Presentada el {selectedLawsuitForView.defendantAnswerDate ? new Date(selectedLawsuitForView.defendantAnswerDate).toLocaleDateString('es-ES') : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400 block font-semibold text-[10px]">Tipo de respuesta:</span>
                      <span className="font-bold text-white">
                        {selectedLawsuitForView.defendantAnswerType === 'ordinaria_contestacion'
                          ? 'Contestación a la demanda ordinaria'
                          : selectedLawsuitForView.defendantAnswerType === 'cambiaria_ya_pagado'
                          ? 'Oposición cambiaria (alegación de pago previo extintivo)'
                          : 'Allanamiento y pago voluntario'}
                      </span>
                    </div>
                    {selectedLawsuitForView.defendantLawyerFeeTotal && selectedLawsuitForView.defendantLawyerFeeTotal > 0 ? (
                      <div>
                        <span className="text-slate-400 block font-semibold text-[10px]">Minuta letrado defensor (15% + IVA):</span>
                        <span className="font-bold text-emerald-400">
                          {formatNumber(selectedLawsuitForView.defendantLawyerFeeTotal)} € (Fra: {selectedLawsuitForView.defendantLawyerFeeInvoiceNumber})
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Alegaciones formuladas por el demandado:</span>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 whitespace-pre-line leading-relaxed text-xs">
                      {selectedLawsuitForView.defendantAnswerFacts || 'Sin alegaciones de texto adicionales.'}
                    </div>
                  </div>

                  {/* Documentación PDF aportada por el demandado */}
                  <div className="space-y-2 pt-1">
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-amber-400" />
                      <span>Documentos probatorios aportados por la parte demandada (PDF):</span>
                    </span>

                    {selectedLawsuitForView.defendantAnswerAttachments && selectedLawsuitForView.defendantAnswerAttachments.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedLawsuitForView.defendantAnswerAttachments.map((att, idx) => (
                          <div
                            key={att.id || idx}
                            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0 font-bold text-[9px]">
                                PDF
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-200 truncate text-[11px]" title={att.name}>
                                  {att.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {(att.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {att.dataUrl && (
                                <>
                                  <a
                                    href={att.dataUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold transition flex items-center gap-1 border border-slate-700"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Ver</span>
                                  </a>
                                  <a
                                    href={att.dataUrl}
                                    download={att.name}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700"
                                    title="Descargar PDF"
                                  >
                                    <Download className="w-3 h-3" />
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        El demandado no adjuntó archivos PDF adicionales con su contestación.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPrintableLawsuitWindow(selectedLawsuitForView)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>Imprimir / exportar</span>
                </button>

                {/* Defendant action from inside modal if not answered */}
                {selectedLawsuitForView.defendantId === currentUser.id &&
                  (selectedLawsuitForView.status === 'admitida' || selectedLawsuitForView.status === 'embargo_preventivo') &&
                  !selectedLawsuitForView.defendantAnswered && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedLawsuitForView;
                        setSelectedLawsuitForView(null);
                        openAnswerModal(target);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Contestar a la demanda</span>
                    </button>
                  )}

                {/* Judge actions from inside modal */}
                {isJudge && selectedLawsuitForView.status === 'pendiente_admision' && (
                  <>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleJudgeAdmission(selectedLawsuitForView, 'admitir')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Admitir a trámite</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleJudgeAdmission(selectedLawsuitForView, 'rechazar')}
                      className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-black transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Inadmitir / rechazar</span>
                    </button>
                  </>
                )}

                {isJudge && (selectedLawsuitForView.status === 'admitida' || selectedLawsuitForView.status === 'embargo_preventivo') && (
                  <>
                    {selectedLawsuitForView.type === 'cambiaria' && selectedLawsuitForView.status === 'admitida' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handlePreventativeEmbargo(selectedLawsuitForView)}
                        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-blue-200" />
                        <span>Embargo preventivo (art. 821 LEC)</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRulingLawsuit(selectedLawsuitForView);
                        setRulingType('estimatoria');
                        setRulingComments('Estimada íntegramente la demanda con expresa imposición de costas.');
                        setSelectedLawsuitForView(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      <span>Estimar demanda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRulingLawsuit(selectedLawsuitForView);
                        setRulingType('desestimatoria');
                        setRulingComments('Desestimada la demanda.');
                        setSelectedLawsuitForView(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-800 hover:bg-rose-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 border border-rose-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Desestimar</span>
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedLawsuitForView(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONTESTACIÓN A LA DEMANDA (DEMANDADO) */}
      {answeringLawsuit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {answeringLawsuit.type === 'cambiaria'
                      ? 'Oposición / contestación a juicio cambiario'
                      : 'Escrito de contestación a la demanda'}
                  </h3>
                  <div className="text-xs text-amber-400 font-mono font-bold">
                    Autos n.º {answeringLawsuit.caseNumber} · Juzgado de 1ª Instancia
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAnsweringLawsuit(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto space-y-5 pr-1 text-xs">
              {/* Case Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">Demandante (actor):</span>
                  <span className="font-bold text-white text-xs">{answeringLawsuit.plaintiffName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">Cuantía reclamada:</span>
                  <span className="font-bold text-rose-400 font-mono text-xs">
                    {formatNumber(answeringLawsuit.claimedAmount)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase">Plazo legal:</span>
                  <span className="font-bold text-amber-400 text-xs">
                    {answeringLawsuit.type === 'cambiaria' ? '10 días (art. 824 LEC)' : '20 días hábiles (art. 404 LEC)'}
                  </span>
                </div>
              </div>

              {/* Minuta de Abogado Informative Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-400 flex items-center gap-1.5 text-xs">
                    <Receipt className="w-4 h-4" />
                    <span>Minuta de honorarios de abogado de la defensa</span>
                  </span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded">
                    15% + 21% IVA
                  </span>
                </div>

                {answerType === 'cambiaria_pago_ahora' ? (
                  <p className="text-[11px] text-slate-300">
                    Al optar por el allanamiento y pago en este acto, se transferirán los <strong>{formatNumber(answeringLawsuit.claimedAmount)} €</strong> al demandante y los autos quedarán concluidos sin devengo de honorarios litigiosos de contestación.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Conforme al arancel profesional fijado (15% sobre la cuantía litigiosa más 21% de IVA), al formalizar y firmar este escrito de contestación se cargará automáticamente en tu cuenta la minuta de tu letrado:
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-center">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Base (15%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {formatNumber(answeringLawsuit.claimedAmount * 0.15)} €
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">IVA (21%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {formatNumber(answeringLawsuit.claimedAmount * 0.15 * 0.21)} €
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-500/40">
                        <div className="text-[10px] text-amber-400 uppercase font-bold">Total minuta</div>
                        <div className="font-extrabold text-amber-300 mt-0.5">
                          {formatNumber(answeringLawsuit.claimedAmount * 0.15 * 1.21)} €
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Cambiaria Options Selection */}
              {answeringLawsuit.type === 'cambiaria' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-200 block">
                    Selecciona tu motivo de oposición / respuesta legal (art. 824 LEC):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        answerType === 'cambiaria_ya_pagado'
                          ? 'bg-amber-950/30 border-amber-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="cambiaria_answer"
                          value="cambiaria_ya_pagado"
                          checked={answerType === 'cambiaria_ya_pagado'}
                          onChange={() => setAnswerType('cambiaria_ya_pagado')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-bold text-xs">1. Ya he pagado la deuda</div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Alegar excepción de pago extintivo previo y adjuntar el justificante bancario en PDF.
                          </p>
                        </div>
                      </div>
                      <div className="text-[10px] text-amber-400 font-semibold pl-5">
                        Minuta letrado: {formatNumber(answeringLawsuit.claimedAmount * 0.15 * 1.21)} €
                      </div>
                    </label>

                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        answerType === 'cambiaria_pago_ahora'
                          ? 'bg-emerald-950/30 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="cambiaria_answer"
                          value="cambiaria_pago_ahora"
                          checked={answerType === 'cambiaria_pago_ahora'}
                          onChange={() => setAnswerType('cambiaria_pago_ahora')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-bold text-xs text-emerald-400">2. No he pagado, pero pago ahora</div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Allanamiento voluntario. Se transferirán los {formatNumber(answeringLawsuit.claimedAmount)} € al actor inmediatamente.
                          </p>
                        </div>
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold pl-5">
                        Importe a abonar: {formatNumber(answeringLawsuit.claimedAmount)} €
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Alegaciones / Facts textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>
                    {answeringLawsuit.type === 'cambiaria' && answerType === 'cambiaria_ya_pagado'
                      ? 'Detalles y alegación del pago previo extintivo:'
                      : answeringLawsuit.type === 'cambiaria' && answerType === 'cambiaria_pago_ahora'
                      ? 'Manifestación de allanamiento y pago:'
                      : 'Alegaciones de hecho y motivos de oposición (defensa):'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {answerFacts.length} caracteres
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={answerFacts}
                  onChange={e => setAnswerFacts(e.target.value)}
                  placeholder={
                    answeringLawsuit.type === 'cambiaria' && answerType === 'cambiaria_ya_pagado'
                      ? 'Indica fecha de la transferencia previa, cuenta de abono o detalles del pago extintivo...'
                      : answeringLawsuit.type === 'cambiaria' && answerType === 'cambiaria_pago_ahora'
                      ? 'La parte demandada se allana expresamente a la reclamación y procede a la satisfacción íntegra de la deuda...'
                      : 'Expón detalladamente los motivos por los que no procede la reclamación, cumplimiento por tu parte, excepciones procesales o defectos...'
                  }
                  className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition leading-relaxed"
                />
              </div>

              {/* PDF Documents Upload Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                    <span>Aportar documentación adicional en PDF:</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Solo archivos .pdf (máx. 15 MB)</span>
                </div>

                {/* Dropzone */}
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleAnswerPdfFiles(e.dataTransfer.files);
                    }
                  }}
                  className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-2xl p-4 text-center bg-slate-950/60 transition group cursor-pointer"
                  onClick={() => document.getElementById('defendant-pdf-file-input')?.click()}
                >
                  <input
                    id="defendant-pdf-file-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleAnswerPdfFiles(e.target.files);
                      }
                    }}
                  />
                  <FileText className="w-6 h-6 text-slate-400 group-hover:text-amber-400 mx-auto transition" />
                  <div className="mt-1 text-xs font-semibold text-slate-300">
                    Arrastra tus documentos PDF aquí o <span className="text-amber-400 underline">haz clic para examinar</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Justificantes bancarios, facturas de abono, albaranes firmados, correos probatorios
                  </div>
                </div>

                {/* Selected PDF List */}
                {answerAttachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Documentos PDF listos para adjuntar ({answerAttachments.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {answerAttachments.map(att => (
                        <div
                          key={att.id}
                          className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-300 shrink-0 font-bold text-[9px]">
                              PDF
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-200 truncate text-[11px]" title={att.name}>
                                {att.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {(att.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {att.dataUrl && (
                              <a
                                href={att.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                                title="Previsualizar PDF"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => removeAnswerAttachment(att.id)}
                              className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                              title="Quitar archivo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setAnsweringLawsuit(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDefendantAnswerSubmit}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Presentando contestación...'
                    : answerType === 'cambiaria_pago_ahora'
                    ? `Pagar ${formatNumber(answeringLawsuit.claimedAmount)} € y archivar autos`
                    : 'Firmar y presentar contestación'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DICTAR SENTENCIA JUDICIAL (PROFESOR / JUEZ) */}
      {rulingLawsuit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gavel className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Dictar sentencia / resolución judicial</h3>
                  <p className="text-[11px] text-amber-400 font-semibold">Magistrado-juez del Juzgado de 1ª Instancia</p>
                </div>
              </div>
              <button onClick={() => setRulingLawsuit(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div><strong>Autos:</strong> {rulingLawsuit.caseNumber}</div>
                <div><strong>Actor:</strong> {rulingLawsuit.plaintiffName}</div>
                <div><strong>Demandado:</strong> {rulingLawsuit.defendantName}</div>
                <div><strong>Cuantía:</strong> {formatNumber(rulingLawsuit.totalClaimAmount || rulingLawsuit.claimedAmount)} €</div>
              </div>

              {/* Attachments review for the Judge (Plaintiff) */}
              {rulingLawsuit.attachments && rulingLawsuit.attachments.length > 0 && (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Pruebas del actor ({rulingLawsuit.attachments.length} archivos PDF):</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {rulingLawsuit.attachments.map((att, idx) => (
                      <div key={att.id || idx} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                        <span className="truncate text-slate-200">{idx + 1}. {att.name} ({(att.size / 1024).toFixed(1)} KB)</span>
                        {att.dataUrl && (
                          <a
                            href={att.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold shrink-0 flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Abrir PDF</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review of Defendant's Answer & PDF Attachments if presented */}
              {rulingLawsuit.defendantAnswered ? (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-emerald-500/40 space-y-2">
                  <div className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Contestación formal del demandado:</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {rulingLawsuit.defendantAnswerDate ? new Date(rulingLawsuit.defendantAnswerDate).toLocaleDateString('es-ES') : ''}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="font-bold text-slate-200">Alegaciones: </span>
                    {rulingLawsuit.defendantAnswerFacts || 'Sin alegaciones de texto adicionales.'}
                  </div>
                  {rulingLawsuit.defendantAnswerAttachments && rulingLawsuit.defendantAnswerAttachments.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        <span>Pruebas aportadas por el demandado:</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {rulingLawsuit.defendantAnswerAttachments.map((att, idx) => (
                          <div key={att.id || idx} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                            <span className="truncate text-slate-200">{att.name} ({(att.size / 1024).toFixed(1)} KB)</span>
                            {att.dataUrl && (
                              <a
                                href={att.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold shrink-0 flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Abrir PDF</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-amber-300/80 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>La parte demandada aún no ha formulado contestación o se encuentra dentro del plazo legal.</span>
                </div>
              )}
            </div>

            <form onSubmit={handleJudgeRuling} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">Fallo judicial:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition ${rulingType === 'estimatoria' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input
                      type="radio"
                      name="ruling"
                      value="estimatoria"
                      checked={rulingType === 'estimatoria'}
                      onChange={() => {
                        setRulingType('estimatoria');
                        setRulingComments('Estimada íntegramente la demanda con expresa imposición de costas.');
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold block text-emerald-400">Sentencia estimatoria</span>
                      <span className="text-[11px] text-slate-300 font-normal">
                        Ejecutar cobro forzoso al demandado por {formatNumber(rulingLawsuit.totalClaimAmount || rulingLawsuit.claimedAmount)} € en favor del actor.
                      </span>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition ${rulingType === 'desestimatoria' ? 'bg-rose-950/40 border-rose-500/50 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    <input
                      type="radio"
                      name="ruling"
                      value="desestimatoria"
                      checked={rulingType === 'desestimatoria'}
                      onChange={() => {
                        setRulingType('desestimatoria');
                        setRulingComments('Desestimada íntegramente la demanda con expresa condena en costas a la parte actora.');
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold block text-rose-400">Desestimar demanda</span>
                      <span className="text-[11px] text-slate-300 font-normal">
                        Condena en costas al demandante por {formatNumber(rulingLawsuit.defendantLawyerFeeTotal || Number(((rulingLawsuit.claimedAmount * 0.15) * 1.21).toFixed(2)))} € (15% + IVA) abonadas al demandado.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Informative breakdown banner */}
              {rulingType === 'desestimatoria' && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1 text-amber-300">
                    <Scale className="w-3.5 h-3.5" />
                    <span>Principio del vencimiento objetivo (art. 394 LEC):</span>
                  </div>
                  <p className="text-[11px] text-amber-100/90 leading-relaxed">
                    Al desestimar la demanda, el demandante (<strong>{rulingLawsuit.plaintiffName}</strong>) pagará automáticamente a la parte demandada (<strong>{rulingLawsuit.defendantName}</strong>) las costas procesales causadas por importe de <strong>{formatNumber(rulingLawsuit.defendantLawyerFeeTotal || Number(((rulingLawsuit.claimedAmount * 0.15) * 1.21).toFixed(2)))} €</strong> (15% del principal reclamado + 21% IVA).
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Motivación y comentarios del magistrado:</label>
                <textarea
                  rows={3}
                  value={rulingComments}
                  onChange={e => setRulingComments(e.target.value)}
                  placeholder="Fundamentación jurídica de la resolución..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRulingLawsuit(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Dictando...' : 'Firmar y dictar sentencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
