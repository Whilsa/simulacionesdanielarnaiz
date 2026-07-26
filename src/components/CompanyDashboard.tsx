/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, PropertyAcquisition, PaymentObligation, BankLoan, MachineryAcquisition, HiredEmployee, PayrollRecord, TaxObligation } from '../types.js';
import { 
  Briefcase, Landmark, Building2, ShieldCheck, ArrowLeft, RefreshCw, 
  Euro, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Layers, CreditCard, Receipt,
  ChevronRight, ExternalLink, X, Info, Calculator, Wrench, Factory, Users, DollarSign, UserCheck, Download
} from 'lucide-react';
import DocumentViewerModal, { DocumentViewerData } from './DocumentViewerModal.js';
import LoanAmortizationTable from './LoanAmortizationTable.js';
import Footer from './Footer.js';

interface CompanyDashboardProps {
  currentUser: User;
  onBackToHub: () => void;
  onGoToBank?: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

interface CompanyDataResponse {
  company: {
    id: string;
    name: string;
    username: string;
    accountNumber: string;
    balance: number;
    role: string;
  };
  summary: {
    bankBalance: number;
    ownedPropertiesCount: number;
    rentedPropertiesCount: number;
    totalRealEstateAssetsValue: number;
    totalLandValue: number;
    totalBuildingValue: number;
    annualBuildingDepreciation: number;
    totalMachineryAssetsValue?: number;
    machineryCount?: number;
    totalObligationsPendingAmount?: number;
    totalLoansPendingAmount?: number;
    totalLoansPendingPrincipal?: number;
    totalPendingTaxAmount?: number;
    totalPendingObligations: number;
    totalMonthlyRentCommitments: number;
    activeLoansCount?: number;
    hiredEmployeesCount?: number;
  };
  acquisitions: PropertyAcquisition[];
  obligations: PaymentObligation[];
  loans?: BankLoan[];
  machineryAcquisitions?: MachineryAcquisition[];
  hiredEmployees?: HiredEmployee[];
  payrollRecords?: PayrollRecord[];
  taxObligations?: TaxObligation[];
}

export default function CompanyDashboard({ currentUser, onBackToHub, onGoToBank, onUserBalanceUpdated }: CompanyDashboardProps) {
  const [data, setData] = useState<CompanyDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [payingObligationId, setPayingObligationId] = useState<string | null>(null);
  const [payingTaxId, setPayingTaxId] = useState<string | null>(null);
  const [updatingEmpId, setUpdatingEmpId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'owned' | 'rented' | 'machinery' | 'employees' | 'obligations' | 'loans'>('owned');
  const [activeDocumentModal, setActiveDocumentModal] = useState<DocumentViewerData | null>(null);
  
  // Modal for detailed breakdown of debts by operation origin
  const [showDebtDetailsModal, setShowDebtDetailsModal] = useState(false);
  const [debtFilterOrigin, setDebtFilterOrigin] = useState<'all' | 'loans' | 'obligations'>('all');
  const [selectedLoanForTable, setSelectedLoanForTable] = useState<BankLoan | null>(null);
  const [selectedPropertyForPayments, setSelectedPropertyForPayments] = useState<PropertyAcquisition | null>(null);

  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/${currentUser.id}`);
      if (!res.ok) throw new Error('Error al cargar la información patrimonial');
      const json = await res.json();
      setData(json);
      if (json.company?.balance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(json.company.balance);
      }
    } catch (err: any) {
      setError(err.message || 'Error de servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyData();
  }, [currentUser.id]);

  const handleDownloadPayrollDetail = (periodName: string, employees: HiredEmployee[]) => {
    if (!employees || employees.length === 0) return;

    let totalGrossSum = 0;
    let totalIRPFSum = 0;
    let totalSSEmpSum = 0;
    let totalNetSum = 0;
    let totalSSCompSum = 0;

    const curNow = new Date();
    const curY = curNow.getFullYear();
    const curM = curNow.getMonth() + 1;

    const empLines = employees.map((emp, i) => {
      let isFirstMonth = false;
      let hireDay = 1;
      if (emp.hireDate) {
        const parts = emp.hireDate.split('T')[0].split('-');
        const hy = parseInt(parts[0], 10);
        const hm = parseInt(parts[1], 10);
        hireDay = parseInt(parts[2], 10);
        isFirstMonth = (hy === curY && hm === curM);
      }
      const daysInMonth = new Date(curY, curM, 0).getDate();
      const daysWorked = isFirstMonth ? Math.max(1, daysInMonth - hireDay + 1) : daysInMonth;
      const gross = isFirstMonth ? Math.round(((emp.grossSalaryMonthly / daysInMonth) * daysWorked) * 100) / 100 : emp.grossSalaryMonthly;
      const irpf = Math.round(gross * 0.17 * 100) / 100;
      const ssEmp = Math.round(gross * 0.0648 * 100) / 100;
      const net = Math.round((gross - irpf - ssEmp) * 100) / 100;
      const ssComp = Math.round(gross * 0.75 * 100) / 100;

      totalGrossSum += gross;
      totalIRPFSum += irpf;
      totalSSEmpSum += ssEmp;
      totalNetSum += net;
      totalSSCompSum += ssComp;

      return `${i + 1}. ${emp.employeeName} (Edad: ${emp.age} años)
   Fecha de contratación: ${emp.hireDate ? emp.hireDate.split('T')[0] : 'N/A'}
   Días computados en mes: ${daysWorked} días ${isFirstMonth ? '(Proporcional primer mes)' : '(100% Mes completo)'}
   Sueldo bruto: ${gross.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
   Retención IRPF (17%): ${irpf.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
   Seguridad Social empleado (6,48%): ${ssEmp.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
   Sueldo líquido / neto a cobrar: ${net.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
   Aportación Seguridad Social empresa (75%): ${ssComp.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;
    }).join('\n\n');

    const textContent = `===================================================================
DETALLE Y RESUMEN DE NÓMINAS DE LA EMPRESA
===================================================================
Empresa: ${currentUser.name}
Cuenta IBAN: ${currentUser.accountNumber}
Periodo: ${periodName}
Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}

-------------------------------------------------------------------
DESGLOSE POR EMPLEADO:
-------------------------------------------------------------------
${empLines}

-------------------------------------------------------------------
RESUMEN TOTAL DE LA EMPRESA (${employees.length} empleados):
-------------------------------------------------------------------
Total sueldos brutos: ${totalGrossSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
Total IRPF a retener e ingresar en Hacienda (AEAT): ${totalIRPFSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
Total Seguridad Social a retener empleados (TGSS): ${totalSSEmpSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
Total sueldos líquidos a abonar a los empleados: ${totalNetSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
Total gasto en Seguridad Social a cargo de la empresa (75%): ${totalSSCompSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
Gasto total de personal para la empresa: ${(totalGrossSum + totalSSCompSum).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
===================================================================`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Detalle_Nominas_${currentUser.name.replace(/\s+/g, '_')}_${periodName.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getUpcoming24MonthsPayments = () => {
    if (!data) return [];
    const now = new Date();
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 24);

    const items: Array<{
      id: string;
      concept: string;
      origin: string;
      amount: number;
      dueDate: string;
      status: 'pendiente' | 'pagado' | 'vencido';
    }> = [];

    // 1. Payment obligations (Pagarés, letras, alquileres, maquinaria)
    (data.obligations || []).forEach(ob => {
      const d = new Date(ob.dueDate);
      if (d <= maxDate) {
        let concept = `${ob.type === 'pagare' ? 'Pagaré' : ob.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota de alquiler'} (${ob.installmentNumber || 1}/${ob.totalInstallments || 12}): ${ob.propertyTitle}`;
        if (ob.type === 'alquiler' || ob.type === 'cuota_alquiler') {
          concept = `Cuota de alquiler n.º ${ob.installmentNumber || 1} de ${ob.propertyTitle}`;
        } else if (ob.type === 'compra' || ob.type === 'compra_inmueble') {
          concept = `Pago aplazado de compra de ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 12})`;
        } else if (ob.type === 'maquinaria' || (ob.propertyTitle && (ob.propertyTitle.toLowerCase().includes('línea') || ob.propertyTitle.toLowerCase().includes('maquina') || ob.propertyTitle.toLowerCase().includes('máquina')))) {
          concept = `Pago aplazado de la máquina ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 24})`;
        }

        items.push({
          id: ob.id,
          concept,
          origin: ob.type === 'pagare' ? 'Pagaré comercial' : ob.type === 'letra_cambio' ? 'Letra de cambio' : 'Alquiler de inmueble',
          amount: ob.amount,
          dueDate: ob.dueDate,
          status: ob.status
        });
      }
    });

    // 2. Tax and Social Security obligations
    (data.taxObligations || []).forEach(tax => {
      const d = new Date(tax.dueDate);
      if (d <= maxDate) {
        const isIRPF = tax.type === 'irpf';
        const origin = (isIRPF || tax.agency === 'AEAT') ? 'Hacienda Pública (AEAT)' : 'Seguridad Social (TGSS)';
        items.push({
          id: tax.id,
          concept: tax.concept || (isIRPF ? 'Retenciones IRPF de nóminas (17%)' : 'Seguridad Social'),
          origin,
          amount: tax.amount,
          dueDate: tax.dueDate,
          status: tax.status
        });
      }
    });

    // 3. Bank Loan amortization schedules (for active loans)
    (data.loans || []).filter(l => l.status === 'active').forEach(loan => {
      (loan.schedule || []).forEach(row => {
        const d = new Date(row.dueDate);
        if (d <= maxDate && !row.paid) {
          const installmentNum = row.period || (row as any).installmentNumber || 1;
          items.push({
            id: `loan-${loan.id}-${installmentNum}`,
            concept: `Cuota ${installmentNum}/${loan.termMonths} de préstamo hipotecario (${loan.collateral?.propertyTitle || 'Garantía inmobiliaria'})`,
            origin: 'Préstamo hipotecario',
            amount: row.payment,
            dueDate: row.dueDate,
            status: 'pendiente'
          });
        }
      });
    });

    // 4. Upcoming monthly net payrolls, Seguridad Social (TGSS on 20th of next month, separated) and IRPF (AEAT on 15th of month following quarter)
    const studentEmps = data.hiredEmployees || [];
    if (studentEmps.length > 0) {
      const getGrossForMonth = (tMonth: number, tYear: number) => {
        let gSum = 0;
        studentEmps.forEach(e => {
          if (!e.hireDate) {
            gSum += e.grossSalaryMonthly;
          } else {
            const parts = e.hireDate.split('T')[0].split('-');
            const hYear = parseInt(parts[0], 10);
            const hMonth = parseInt(parts[1], 10);
            const hDay = parseInt(parts[2], 10);

            if (tYear < hYear || (tYear === hYear && tMonth < hMonth)) {
              return; // Not hired yet
            }
            if (hYear === tYear && hMonth === tMonth) {
              const daysInMonth = new Date(tYear, tMonth, 0).getDate();
              const daysWorked = Math.max(1, daysInMonth - hDay + 1);
              gSum += (e.grossSalaryMonthly / daysInMonth) * daysWorked;
            } else {
              gSum += e.grossSalaryMonthly;
            }
          }
        });
        return Math.round(gSum * 100) / 100;
      };

      // Map to aggregate quarterly IRPF: key "YEAR-Q", value: total IRPF
      const quarterlyIRPFMap: { [key: string]: { amount: number; dueDate: Date; qNum: number; targetYear: number } } = {};

      for (let m = 0; m < 24; m++) {
        const refDate = new Date(now.getFullYear(), now.getMonth() + m, 1, 9, 0, 0);
        const targetYear = refDate.getFullYear();
        const targetMonth = refDate.getMonth() + 1; // 1-based

        const pDate = new Date(targetYear, targetMonth, 1, 9, 0, 0); // 1st of month following targetMonth
        const ssDueDate = new Date(targetYear, targetMonth, 20, 9, 0, 0); // 20th of month following targetMonth

        let monthGross = 0;
        let empIndex = 0;

        studentEmps.forEach(e => {
          empIndex++;
          let eGross = 0;

          if (!e.hireDate) {
            eGross = e.grossSalaryMonthly;
          } else {
            const parts = e.hireDate.split('T')[0].split('-');
            const hireYear = parseInt(parts[0], 10);
            const hireMonth = parseInt(parts[1], 10);
            const hireDay = parseInt(parts[2], 10);

            if (targetYear < hireYear || (targetYear === hireYear && targetMonth < hireMonth)) {
              // Not hired yet
              return;
            }
            if (hireYear === targetYear && hireMonth === targetMonth) {
              const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
              const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
              eGross = (e.grossSalaryMonthly / daysInMonth) * daysWorked;
            } else {
              eGross = e.grossSalaryMonthly;
            }
          }

          monthGross += eGross;

          const eIRPF = Math.round(eGross * 0.17 * 100) / 100;
          const eSSEmp = Math.round(eGross * 0.0648 * 100) / 100;
          const eNet = Math.round((eGross - eIRPF - eSSEmp) * 100) / 100;

          // 4a. Individual Net Payroll per employee on Day 1 of following month
          if (pDate >= now && pDate <= maxDate && eNet > 0) {
            items.push({
              id: `payroll-net-${e.id || empIndex}-${targetYear}-${targetMonth}`,
              concept: `Nómina neta - ${e.employeeName || e.name || 'Empleado'} (Mes ${targetMonth}/${targetYear})`,
              origin: 'Nóminas de personal',
              amount: eNet,
              dueDate: pDate.toISOString(),
              status: 'pendiente'
            });
          }
        });

        monthGross = Math.round(monthGross * 100) / 100;

        if (monthGross > 0) {
          const monthSSEmp = Math.round(monthGross * 0.0648 * 100) / 100;
          const monthSSComp = Math.round(monthGross * 0.75 * 100) / 100; // 75%

          // 4b. TGSS SS tax payments due on 20th of following month - SEPARATED (Empleado 6,48% / Empresa 75%)
          if (ssDueDate >= now && ssDueDate <= maxDate) {
            const followingMonth = ssDueDate.getMonth(); // 0-indexed
            const followingYear = ssDueDate.getFullYear();

            const hasSsEmpInDb = (data.taxObligations || []).some(t => 
              (t.type === 'ss_employee' || t.type === 'ss') && 
              new Date(t.dueDate).getFullYear() === followingYear && 
              new Date(t.dueDate).getMonth() === followingMonth
            );

            const hasSsCompInDb = (data.taxObligations || []).some(t => 
              t.type === 'ss_company' && 
              new Date(t.dueDate).getFullYear() === followingYear && 
              new Date(t.dueDate).getMonth() === followingMonth
            );

            if (!hasSsEmpInDb && monthSSEmp > 0) {
              items.push({
                id: `payroll-ss-emp-${m}`,
                concept: `Cuotas Seguridad Social Trabajador (6,48%) Mes ${targetMonth}/${targetYear}`,
                origin: 'Seguridad Social (TGSS)',
                amount: monthSSEmp,
                dueDate: ssDueDate.toISOString(),
                status: 'pendiente'
              });
            }

            if (!hasSsCompInDb && monthSSComp > 0) {
              items.push({
                id: `payroll-ss-comp-${m}`,
                concept: `Aportación patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`,
                origin: 'Seguridad Social (TGSS)',
                amount: monthSSComp,
                dueDate: ssDueDate.toISOString(),
                status: 'pendiente'
              });
            }
          }

          // 4c. Quarterly AEAT IRPF accumulator - Due on 15th of first month of following quarter
          let qNum = 1;
          let irpfDueDate: Date;
          if (targetMonth >= 10) {
            qNum = 4;
            irpfDueDate = new Date(targetYear + 1, 0, 15, 9, 0, 0); // Jan 15 next year
          } else if (targetMonth >= 7) {
            qNum = 3;
            irpfDueDate = new Date(targetYear, 9, 15, 9, 0, 0); // Oct 15
          } else if (targetMonth >= 4) {
            qNum = 2;
            irpfDueDate = new Date(targetYear, 6, 15, 9, 0, 0); // Jul 15
          } else {
            qNum = 1;
            irpfDueDate = new Date(targetYear, 3, 15, 9, 0, 0); // Apr 15
          }

          const qKey = `IRPF-Q${qNum}-${targetYear}`;

          if (!quarterlyIRPFMap[qKey]) {
            const qGross = getGrossForMonth((qNum - 1) * 3 + 1, targetYear) +
                           getGrossForMonth((qNum - 1) * 3 + 2, targetYear) +
                           getGrossForMonth((qNum - 1) * 3 + 3, targetYear);
            const qIRPFAmount = Math.round(qGross * 0.17 * 100) / 100;
            quarterlyIRPFMap[qKey] = { amount: qIRPFAmount, dueDate: irpfDueDate, qNum, targetYear };
          }
        }
      }

      // Add accumulated quarterly IRPF items
      Object.entries(quarterlyIRPFMap).forEach(([qKey, qData], idx) => {
        if (qData.dueDate >= now && qData.dueDate <= maxDate && qData.amount > 0) {
          const dueYear = qData.dueDate.getFullYear();
          const dueMonth = qData.dueDate.getMonth();

          const hasIrpfInDb = (data.taxObligations || []).some(t => 
            t.type === 'irpf' && 
            new Date(t.dueDate).getFullYear() === dueYear && 
            new Date(t.dueDate).getMonth() === dueMonth
          );

          if (!hasIrpfInDb) {
            items.push({
              id: `payroll-irpf-quarterly-${idx}-${qKey}`,
              concept: `Retenciones IRPF de nóminas (17%) Trimestre Q${qData.qNum} ${qData.targetYear}`,
              origin: 'Hacienda Pública (AEAT)',
              amount: qData.amount,
              dueDate: qData.dueDate.toISOString(),
              status: 'pendiente'
            });
          }
        }
      });
    }

    items.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return items;
  };

  const handlePayObligation = async (obligationId: string) => {
    setPayingObligationId(obligationId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/obligations/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obligationId,
          studentId: currentUser.id
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al procesar el pago');

      setSuccessMsg(json.message);
      fetchCompanyData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPayingObligationId(null);
    }
  };

  const handlePayTaxObligation = async (taxId: string) => {
    setPayingTaxId(taxId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/taxes/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxId,
          studentId: currentUser.id
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al liquidar el impuesto/SS');

      setSuccessMsg(json.message);
      fetchCompanyData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPayingTaxId(null);
    }
  };

  const handleAssignEmployeeMachineryShift = async (employeeId: string, machineryId?: string, shift?: number) => {
    setUpdatingEmpId(employeeId);
    setError(null);
    try {
      const res = await fetch(`/api/student/employees/${employeeId}/assign-machinery`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineryId, shift })
      });
      if (!res.ok) throw new Error('Error al actualizar asignación del empleado');
      fetchCompanyData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingEmpId(null);
    }
  };

  const handleDownloadPayrollCsv = () => {
    if (!data || !data.hiredEmployees || data.hiredEmployees.length === 0) return;

    const currentMonthStr = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const hiredList = data.hiredEmployees;

    const headers = [
      'Empleado',
      'Edad',
      'Fecha Contratación',
      'Maquinaria Asignada',
      'Turno',
      'Sueldo Bruto (€)',
      'IRPF Retenido 17% (€)',
      'SS Empleado 6,48% (€)',
      'Sueldo Neto (€)',
      'SS Empresa 75% (€)',
      'Coste Total Empresa (€)'
    ];

    let csvContent = `DETALLE DE NÓMINAS DEL MES ACTUAL (${currentMonthStr.toUpperCase()})\n`;
    csvContent += `Empresa: ${currentUser.name}\n`;
    csvContent += `CIF / NIF: ${currentUser.nifCif || 'B-99887766'}\n`;
    csvContent += `Fecha Generación: ${new Date().toLocaleDateString('es-ES')}\n\n`;

    csvContent += headers.join(';') + '\n';

    let totalGross = 0;
    let totalIrpf = 0;
    let totalSsEmp = 0;
    let totalNet = 0;
    let totalSsComp = 0;
    let totalCost = 0;

    hiredList.forEach(e => {
      const gross = e.grossSalaryMonthly;
      const irpf = Math.round(gross * 0.17 * 100) / 100;
      const ssEmp = Math.round(gross * 0.0648 * 100) / 100;
      const net = Math.round((gross - irpf - ssEmp) * 100) / 100;
      const ssComp = Math.round(gross * 0.75 * 100) / 100;
      const cost = Math.round((gross + ssComp) * 100) / 100;

      totalGross += gross;
      totalIrpf += irpf;
      totalSsEmp += ssEmp;
      totalNet += net;
      totalSsComp += ssComp;
      totalCost += cost;

      const mac = data.machineryAcquisitions?.find(m => m.id === e.assignedMachineryId);
      const macTitle = mac ? `${mac.title || mac.lineTitle} (${mac.installationNaveTitle})` : 'Sin asignar';
      const shiftText = e.shift === 1 ? 'Turno Mañana' : e.shift === 2 ? 'Turno Tarde' : e.shift === 3 ? 'Turno Noche' : 'Por defecto';

      const row = [
        `"${e.employeeName}"`,
        e.age,
        `"${new Date(e.hireDate).toLocaleDateString('es-ES')}"`,
        `"${macTitle}"`,
        `"${shiftText}"`,
        gross.toFixed(2),
        irpf.toFixed(2),
        ssEmp.toFixed(2),
        net.toFixed(2),
        ssComp.toFixed(2),
        cost.toFixed(2)
      ];
      csvContent += row.join(';') + '\n';
    });

    // Add totals row
    csvContent += '\n';
    const totalsRow = [
      '"TOTALES PLANTILLA"',
      '""',
      '""',
      '""',
      '""',
      totalGross.toFixed(2),
      totalIrpf.toFixed(2),
      totalSsEmp.toFixed(2),
      totalNet.toFixed(2),
      totalSsComp.toFixed(2),
      totalCost.toFixed(2)
    ];
    csvContent += totalsRow.join(';') + '\n';

    // Trigger download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `detalle_nominas_${currentUser.username}_${new Date().toISOString().slice(0, 7)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
              title="Volver al menú principal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight line-clamp-1">{currentUser.name}</h1>
                <p className="text-[11px] text-slate-400">Estado Patrimonial y Contable de la Empresa</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-right">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Cuenta Bancaria IBAN</span>
              <span className="text-xs font-mono font-bold text-slate-200">{currentUser.accountNumber}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs underline text-red-600 hover:text-red-900 cursor-pointer">Cerrar</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-xs underline text-emerald-600 hover:text-emerald-900 cursor-pointer">Cerrar</button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Cargando estado financiero de la empresa...</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-slate-500">No se encontraron datos de la empresa.</div>
        ) : (
          <>
            {/* Balance Overview Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Bank Balance */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">Saldo en Cuenta Bancaria</span>
                    <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                      <Landmark className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {data.summary.bankBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Tesorería disponible en el Banco Simulado</span>
                </div>
                {onGoToBank && (
                  <div className="mt-4 pt-2 border-t border-slate-100">
                    <button
                      onClick={onGoToBank}
                      className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      <span>Acceder al Banco</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Total Real Estate Value */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Activo Inmobiliario</span>
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {data.summary.totalRealEstateAssetsValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
                <span className="text-[10px] text-blue-700 font-medium mt-1 block">
                  {data.summary.ownedPropertiesCount} Inmueble(s) en Propiedad
                </span>
              </div>

              {/* Land vs Building Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Suelo vs Construcción</span>
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Terreno (No Amort.):</span>
                    <span className="font-bold text-slate-900">{data.summary.totalLandValue.toLocaleString('es-ES')} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Construcción (2%/año):</span>
                    <span className="font-bold text-slate-900">{data.summary.totalBuildingValue.toLocaleString('es-ES')} €</span>
                  </div>
                </div>
              </div>

              {/* Obligations & Commitments */}
              <div 
                onClick={() => setShowDebtDetailsModal(true)}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-red-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between"
                title="Haz clic para ver el desglose completo de deudas por operación origen"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-red-700 transition-colors">Deudas / Pagarés Pendientes</span>
                      <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                        Ver Detalle
                      </span>
                    </div>
                    <div className="p-2 bg-red-50 group-hover:bg-red-100 rounded-xl text-red-600 transition-colors">
                      <CreditCard className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-red-700">
                    {data.summary.totalPendingObligations.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between items-center">
                    <span>Pagarés / Letras:</span>
                    <span className="font-bold text-slate-800">
                      {(data.summary.totalObligationsPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Préstamos Hipotecarios:</span>
                    <span className="font-bold text-slate-800">
                      {(data.summary.totalLoansPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between text-red-600 font-bold text-[11px] group-hover:translate-x-0.5 transition-transform">
                    <span>Desglose por operación origen</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 mb-6 gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('owned')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'owned'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Inmuebles en propiedad ({data.acquisitions.filter(a => a.operation === 'compra').length})</span>
              </button>

              <button
                onClick={() => setActiveTab('rented')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'rented'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Inmuebles en alquiler ({data.acquisitions.filter(a => a.operation === 'alquiler').length})</span>
              </button>

              <button
                onClick={() => setActiveTab('machinery')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'machinery'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Maquinaria ({data.machineryAcquisitions?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('employees')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'employees'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Mis empleados contratados ({data.hiredEmployees?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('obligations')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'obligations'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>
                  Próximos pagos ({getUpcoming24MonthsPayments().length})
                </span>
              </button>

              <button
                onClick={() => setActiveTab('loans')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'loans'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>
                  Préstamos ({data.loans?.filter(l => l.status === 'active').length || 0})
                </span>
              </button>
            </div>

            {/* TAB 1: OWNED PROPERTIES */}
            {activeTab === 'owned' && (
              <div className="space-y-4">
                {data.acquisitions.filter(a => a.operation === 'compra').length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no posee ningún inmueble comercial o industrial en propiedad. Puedes adquirir naves, almacenes o locales desde el Portal Inmobiliario.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Inmueble</th>
                            <th className="p-3.5">Ubicación</th>
                            <th className="p-3.5">Superficie</th>
                            <th className="p-3.5">Precio Base</th>
                            <th className="p-3.5">IVA (21%)</th>
                            <th className="p-3.5">Desglose Suelo / Edificación</th>
                            <th className="p-3.5">Modalidad Pago</th>
                            <th className="p-3.5 text-right">Documento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.acquisitions.filter(a => a.operation === 'compra').map(acq => {
                            const landVal = (acq.basePrice * acq.landPercentage) / 100;
                            const buildVal = acq.basePrice - landVal;

                            return (
                              <tr key={acq.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                                      <Building2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">{acq.propertyTitle}</span>
                                      <span className="text-[10px] text-slate-400">Comprado el {new Date(acq.purchaseDate).toLocaleDateString('es-ES')}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-600">{acq.location}</td>
                                <td className="p-3.5 font-bold">{acq.surfaceM2} m²</td>
                                <td className="p-3.5 font-bold text-slate-900">{acq.basePrice.toLocaleString('es-ES')} €</td>
                                <td className="p-3.5 text-slate-600">{acq.ivaAmount.toLocaleString('es-ES')} €</td>
                                <td className="p-3.5">
                                  <div className="text-[11px] space-y-0.5">
                                    <span className="block text-slate-700">
                                      Suelo ({acq.landPercentage}%): <strong>{landVal.toLocaleString('es-ES')} €</strong>
                                    </span>
                                    <span className="block text-slate-500">
                                      Edificación ({100 - acq.landPercentage}%): <strong>{buildVal.toLocaleString('es-ES')} €</strong>
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    acq.paymentMethod === 'contado'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {acq.paymentMethod === 'contado' ? 'Al Contado' : 'Pago Aplazado'}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => setSelectedPropertyForPayments(acq)}
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver historial y desglose de pagos realizados y pendientes"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-emerald-300" />
                                    <span>Detalle de Pagos</span>
                                  </button>
                                  <button
                                    onClick={() => setActiveDocumentModal({ type: 'property_invoice', acquisition: acq })}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Ver Factura</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: RENTED PROPERTIES */}
            {activeTab === 'rented' && (
              <div className="space-y-4">
                {data.acquisitions.filter(a => a.operation === 'alquiler').length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    No dispones de contratos de alquiler vigentes.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Inmueble</th>
                            <th className="p-3.5">Ubicación</th>
                            <th className="p-3.5">Superficie</th>
                            <th className="p-3.5">Renta base mensual</th>
                            <th className="p-3.5">IVA (21%)</th>
                            <th className="p-3.5">Fianza pagada</th>
                            <th className="p-3.5">Modalidad de pago</th>
                            <th className="p-3.5 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.acquisitions.filter(a => a.operation === 'alquiler').map(acq => {
                            const baseRent = acq.basePrice || (acq.monthlyRent ? acq.monthlyRent / 1.21 : 0);
                            const ivaRent = acq.monthlyRent ? acq.monthlyRent - baseRent : baseRent * 0.21;
                            const deposit = acq.depositPaid || (baseRent * 2);

                            return (
                              <tr key={acq.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                                      <Building2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">{acq.propertyTitle}</span>
                                      <span className="text-[10px] text-slate-400">Arrendado desde {new Date(acq.purchaseDate).toLocaleDateString('es-ES')}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-600">{acq.location}</td>
                                <td className="p-3.5 font-bold">{acq.surfaceM2} m²</td>
                                <td className="p-3.5 font-bold text-slate-900">{baseRent.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mes</td>
                                <td className="p-3.5 text-slate-600">{ivaRent.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mes</td>
                                <td className="p-3.5 font-bold text-amber-900">{deposit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                <td className="p-3.5">
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                    Domiciliación bancaria
                                  </span>
                                </td>
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => setSelectedPropertyForPayments(acq)}
                                    className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver historial y desglose de pagos realizados y pendientes por fechas, vencimiento y estado"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-indigo-300" />
                                    <span>Detalle de pagos</span>
                                  </button>
                                  <button
                                    onClick={() => setActiveDocumentModal({ type: 'property_invoice', acquisition: acq })}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Ver factura / contrato</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MACHINERY */}
            {activeTab === 'machinery' && (
              <div className="space-y-4">
                {(!data.machineryAcquisitions || data.machineryAcquisitions.length === 0) ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no dispone de maquinaria industrial. Puedes adquirir líneas de producción desde la sección de Maquinaria.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Maquinaria</th>
                            <th className="p-3.5">Ubicación instalación</th>
                            <th className="p-3.5">Capacidad producción</th>
                            <th className="p-3.5">Inversión base</th>
                            <th className="p-3.5">IVA (21%)</th>
                            <th className="p-3.5">Estado montaje</th>
                            <th className="p-3.5">Modalidad de pago</th>
                            <th className="p-3.5 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.machineryAcquisitions.map(mac => {
                            const isAssembly = mac.status === 'montaje';
                            const baseVal = mac.basePrice || mac.totalPrice / 1.21;
                            const ivaVal = mac.ivaAmount || mac.totalPrice - baseVal;

                            return (
                              <tr key={mac.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                                      <Wrench className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">{mac.title}</span>
                                      <span className="text-[10px] text-amber-800 font-semibold">{mac.optionTitle}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  {mac.installationNaveTitle} ({mac.installationSurfaceM2} m²)
                                </td>
                                <td className="p-3.5 font-bold font-mono text-amber-900">
                                  {mac.productionCapacityUnitsPerHour} unid / hora
                                </td>
                                <td className="p-3.5 font-bold text-slate-900">
                                  {baseVal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  {ivaVal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                    isAssembly ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  }`}>
                                    {isAssembly ? 'En montaje' : 'Operativa'}
                                  </span>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    mac.paymentMethod === 'contado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {mac.paymentMethod === 'contado' ? 'Al contado' : 'Pago aplazado'}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => setSelectedPropertyForPayments(mac as any)}
                                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver detalle de pagos a realizar por fechas, vencimiento y estado"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Detalle de pagos</span>
                                  </button>
                                  <button
                                    onClick={() => setActiveDocumentModal({ type: 'machinery_invoice', machineryAcquisition: mac })}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Ver factura</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: HIRED EMPLOYEES & PAYROLL BREAKDOWN */}
            {activeTab === 'employees' && (
              <div className="space-y-6">
                {(() => {
                  const hiredList = data.hiredEmployees || [];
                  const curNow = new Date();
                  const curYear = curNow.getFullYear();
                  const curMonth = curNow.getMonth() + 1;

                  const totalGrossMonthly = hiredList.reduce((sum, e) => {
                    if (!e.hireDate) return sum + e.grossSalaryMonthly;
                    const parts = e.hireDate.split('T')[0].split('-');
                    const hireYear = parseInt(parts[0], 10);
                    const hireMonth = parseInt(parts[1], 10);
                    const hireDay = parseInt(parts[2], 10);

                    if (curYear < hireYear || (curYear === hireYear && curMonth < hireMonth)) {
                      return sum; // Future hire -> not active in current month
                    }
                    if (hireYear === curYear && hireMonth === curMonth) {
                      const daysInMonth = new Date(curYear, curMonth, 0).getDate();
                      const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
                      return sum + Math.round(((e.grossSalaryMonthly / daysInMonth) * daysWorked) * 100) / 100;
                    }
                    return sum + e.grossSalaryMonthly;
                  }, 0);

                  const totalIRPFWithholding = Math.round(totalGrossMonthly * 0.17 * 100) / 100;
                  const totalEmployeeSS = Math.round(totalGrossMonthly * 0.0648 * 100) / 100;
                  const totalNetSalaries = Math.round((totalGrossMonthly - totalIRPFWithholding - totalEmployeeSS) * 100) / 100;
                  const totalCompanySS = Math.round(totalGrossMonthly * 0.75 * 100) / 100;
                  const totalCompanyStaffExpense = Math.round((totalGrossMonthly + totalCompanySS) * 100) / 100;

                  return (
                    <div className="space-y-6">
                      {/* TOP SUMMARY CARDS FOR PAYROLL AND TAXES */}
                      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              <Users className="w-5 h-5 text-blue-600" />
                              <span>Resumen de Masa Salarial y Cotizaciones Sociales ({curNow.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })})</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Plantilla total: <strong>{hiredList.length} empleados contratados</strong> • Pago de salarios el día 1 del mes siguiente
                            </p>
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                            <button
                              onClick={handleDownloadPayrollCsv}
                              disabled={hiredList.length === 0}
                              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                              title="Descargar detalle completo de las nóminas del mes actual"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Descargar nóminas (CSV)</span>
                            </button>
                            <span className="text-xs bg-blue-50 text-blue-900 px-3 py-1 rounded-full font-bold border border-blue-200">
                              Gastos Corrientes de Personal
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          {/* Card 1: Sueldo Bruto Total */}
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                              Sueldo Bruto Total Mes
                            </span>
                            <div className="text-lg font-black text-slate-900">
                              {totalGrossMonthly.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block font-medium">Suma devengada este mes</span>
                          </div>

                          {/* Card 2: Total IRPF a Retener */}
                          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block mb-1">
                              IRPF a Retener (17%)
                            </span>
                            <div className="text-lg font-black text-amber-900">
                              {totalIRPFWithholding.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </div>
                            <span className="text-[10px] text-amber-800/80 mt-1 block font-medium">A ingresar en Hacienda (AEAT)</span>
                          </div>

                          {/* Card 3: Seguridad Social Empleado */}
                          <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 block mb-1">
                              SS Empleado (6,48%)
                            </span>
                            <div className="text-lg font-black text-indigo-900">
                              {totalEmployeeSS.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </div>
                            <span className="text-[10px] text-indigo-800/80 mt-1 block font-medium">A ingresar en TGSS</span>
                          </div>

                          {/* Card 4: Seguridad Social Empresa */}
                          <div className="bg-violet-50/80 border border-violet-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-800 block mb-1">
                              SS Empresa (75%)
                            </span>
                            <div className="text-lg font-black text-violet-900">
                              {totalCompanySS.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </div>
                            <span className="text-[10px] text-violet-800/80 mt-1 block font-medium">Gasto patronal en TGSS</span>
                          </div>

                          {/* Card 5: Gasto Total Empresa */}
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block mb-1">
                              Gasto Total Empresa
                            </span>
                            <div className="text-lg font-black text-emerald-950">
                              {totalCompanyStaffExpense.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </div>
                            <span className="text-[10px] text-emerald-800/80 mt-1 block font-medium">
                              Sueldo Neto: {totalNetSalaries.toLocaleString('es-ES')} €
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* MACHINERY SHIFT COVERAGE SUMMARY */}
                      {data.machineryAcquisitions && data.machineryAcquisitions.length > 0 && (
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <Wrench className="w-4 h-4 text-amber-600" />
                              <span>Cobertura de Operarios por Máquina y Turno</span>
                            </h3>
                            <span className="text-xs text-slate-500 font-medium">Requisito: 5 operarios / turno / máquina</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {data.machineryAcquisitions.map(m => {
                              const assignedToThisMachine = hiredList.filter(e => e.assignedMachineryId === m.id);
                              const countMorning = assignedToThisMachine.filter(e => e.shift === 1).length;
                              const countAfternoon = assignedToThisMachine.filter(e => e.shift === 2).length;
                              const countNight = assignedToThisMachine.filter(e => e.shift === 3).length;

                              return (
                                <div key={m.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs">
                                  <div className="font-bold text-slate-900 text-sm mb-1">{m.title || m.lineTitle}</div>
                                  <p className="text-[11px] text-slate-500 mb-3">Ubicación: {m.installationNaveTitle}</p>

                                  <div className="grid grid-cols-3 gap-2">
                                    <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${
                                      countMorning >= 5 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}>
                                      <span className="font-bold text-[10px] uppercase tracking-wider block">Turno Mañana</span>
                                      <span className="text-base font-extrabold my-0.5">{countMorning} / 5</span>
                                      <span className="text-[9px] font-semibold">{countMorning >= 5 ? '✅ Cubierto' : `Faltan ${5 - countMorning}`}</span>
                                    </div>

                                    <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${
                                      countAfternoon >= 5 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}>
                                      <span className="font-bold text-[10px] uppercase tracking-wider block">Turno Tarde</span>
                                      <span className="text-base font-extrabold my-0.5">{countAfternoon} / 5</span>
                                      <span className="text-[9px] font-semibold">{countAfternoon >= 5 ? '✅ Cubierto' : `Faltan ${5 - countAfternoon}`}</span>
                                    </div>

                                    <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${
                                      countNight >= 5 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}>
                                      <span className="font-bold text-[10px] uppercase tracking-wider block">Turno Noche</span>
                                      <span className="text-base font-extrabold my-0.5">{countNight} / 5</span>
                                      <span className="text-[9px] font-semibold">{countNight >= 5 ? '✅ Cubierto' : `Faltan ${5 - countNight}`}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* LIST OF HIRED EMPLOYEES CARDS */}
                      {hiredList.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
                          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <h3 className="text-lg font-bold text-slate-800">Aún no tienes empleados contratados</h3>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Accede a la sección Foro de Empleo para contratar operarios e incorporarlos a la plantilla de tu empresa.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {hiredList.map(emp => {
                            let hireYear = curYear;
                            let hireMonth = curMonth;
                            let hireDay = 1;
                            if (emp.hireDate) {
                              const parts = emp.hireDate.split('T')[0].split('-');
                              hireYear = parseInt(parts[0], 10);
                              hireMonth = parseInt(parts[1], 10);
                              hireDay = parseInt(parts[2], 10);
                            }
                            const isFirstMonth = (hireYear === curYear && hireMonth === curMonth);
                            const daysInMonth = new Date(curYear, curMonth, 0).getDate();
                            const workedDays = isFirstMonth ? Math.max(1, daysInMonth - hireDay + 1) : daysInMonth;
                            
                            const grossForMonth = isFirstMonth 
                              ? Math.round(((emp.grossSalaryMonthly / daysInMonth) * workedDays) * 100) / 100
                              : emp.grossSalaryMonthly;

                            const irpfForMonth = Math.round(grossForMonth * 0.17 * 100) / 100;
                            const ssEmpForMonth = Math.round(grossForMonth * 0.0648 * 100) / 100;
                            const netForMonth = Math.round((grossForMonth - irpfForMonth - ssEmpForMonth) * 100) / 100;
                            const ssCompanyForMonth = Math.round(grossForMonth * 0.75 * 100) / 100;

                            return (
                              <div key={emp.id} className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center gap-3 mb-3">
                                    <img
                                      src={emp.avatarUrl}
                                      alt={emp.employeeName}
                                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                                    />
                                    <div>
                                      <h4 className="font-bold text-slate-900 text-sm">{emp.employeeName}</h4>
                                      <span className="text-[11px] text-slate-500 block">
                                        Alta: <strong className="font-mono">{emp.hireDate ? emp.hireDate.split('T')[0] : 'N/A'}</strong>
                                      </span>
                                    </div>
                                  </div>

                                  {isFirstMonth ? (
                                    <div className="mb-3 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center justify-between font-medium">
                                      <span>Mes de alta (Incompleto):</span>
                                      <span className="font-bold font-mono">{workedDays}/{daysInMonth} días</span>
                                    </div>
                                  ) : (
                                    <div className="mb-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 flex items-center justify-between font-medium">
                                      <span>Mes completo:</span>
                                      <span className="font-bold font-mono">100% Salario ({daysInMonth} días)</span>
                                    </div>
                                  )}

                                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4 text-xs space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Sueldo Bruto (Mes):</span>
                                      <strong className="text-slate-900 font-mono">{grossForMonth.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</strong>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">IRPF Retenido (17%):</span>
                                      <span className="text-amber-800 font-semibold font-mono">{irpfForMonth.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">SS Empleado (6,48%):</span>
                                      <span className="text-indigo-800 font-semibold font-mono">{ssEmpForMonth.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                                      <span className="text-slate-700">Sueldo Neto a Percibir:</span>
                                      <span className="text-emerald-700 font-mono">{netForMonth.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </div>
                                  </div>

                                  {/* Machinery & Shift Assignment Controls */}
                                  <div className="space-y-2.5 mb-4">
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                      Asignación de Maquinaria
                                    </label>
                                    <select
                                      value={emp.assignedMachineryId || ''}
                                      disabled={updatingEmpId === emp.id}
                                      onChange={e => handleAssignEmployeeMachineryShift(emp.id, e.target.value, emp.shift || 1)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                                    >
                                      <option value="">-- Sin máquina asignada --</option>
                                      {(data.machineryAcquisitions || []).map(m => (
                                        <option key={m.id} value={m.id}>
                                          {m.title || m.lineTitle} ({m.installationNaveTitle})
                                        </option>
                                      ))}
                                    </select>

                                    {emp.assignedMachineryId && (
                                      <div className="flex items-center justify-between pt-1">
                                        <span className="text-xs text-slate-500 font-medium">Turno Asignado:</span>
                                        <div className="flex gap-1">
                                          {[
                                            { shiftNum: 1, label: 'Mañana' },
                                            { shiftNum: 2, label: 'Tarde' },
                                            { shiftNum: 3, label: 'Noche' }
                                          ].map(({ shiftNum, label }) => (
                                            <button
                                              key={shiftNum}
                                              disabled={updatingEmpId === emp.id}
                                              onClick={() => handleAssignEmployeeMachineryShift(emp.id, emp.assignedMachineryId!, shiftNum)}
                                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                                emp.shift === shiftNum
                                                  ? 'bg-blue-600 text-white border-blue-600'
                                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                              }`}
                                            >
                                              {label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* PDF PAYSLIP BUTTON */}
                                <div className="pt-3 border-t border-slate-100">
                                  <button
                                    onClick={() => setActiveDocumentModal({
                                      type: 'payroll_payslip',
                                      hiredEmployee: emp,
                                      studentName: currentUser.name || data?.company?.name || 'Alumno',
                                      employeeName: emp.employeeName,
                                      periodMonth: curNow.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                                      workedDays,
                                      totalMonthDays: daysInMonth,
                                      proportionalGross: grossForMonth,
                                      irpfAmount: irpfForMonth,
                                      ssEmployeeAmount: ssEmpForMonth,
                                      netSalary: netForMonth,
                                      ssCompanyAmount: ssCompanyForMonth,
                                      totalCompanyCost: grossForMonth + ssCompanyForMonth
                                    })}
                                    className="w-full py-2 px-3 bg-slate-900 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-blue-300" />
                                    <span>Ver / Imprimir Nómina (PDF)</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB 5: UPCOMING PAYMENTS (PRÓXIMOS PAGOS) FOR THE NEXT 24 MONTHS */}
            {activeTab === 'obligations' && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-600" />
                        <span>Próximos pagos</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Relación cronológica ordenada por fecha de vencimiento de todos los importes a pagar en los próximos 24 meses (alquileres, adquisiciones de inmuebles o maquinaria, nóminas, Seguridad Social, Hacienda Pública y préstamos).
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold bg-purple-50 text-purple-900 border border-purple-200 px-3 py-1 rounded-full self-start sm:self-auto">
                      Proyección 24 meses: {getUpcoming24MonthsPayments().length} pagos
                    </span>
                  </div>

                  {getUpcoming24MonthsPayments().length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No hay pagos programados para los próximos 24 meses.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Fecha de vencimiento</th>
                            <th className="p-3.5">Concepto</th>
                            <th className="p-3.5">Origen</th>
                            <th className="p-3.5 text-right">Importe (€)</th>
                            <th className="p-3.5">Estado</th>
                            <th className="p-3.5 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {getUpcoming24MonthsPayments().map(item => {
                            const isPaid = item.status === 'pagado';
                            const isOverdue = item.status === 'vencido' || (!isPaid && new Date(item.dueDate) <= new Date());

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5 text-slate-900 font-mono font-bold">
                                  {new Date(item.dueDate).toLocaleDateString('es-ES')}
                                </td>
                                <td className="p-3.5 text-slate-900 font-semibold">{item.concept}</td>
                                <td className="p-3.5 text-slate-600">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-medium border border-slate-200">
                                    {item.origin}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right font-black text-slate-900 text-sm">
                                  {item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="p-3.5">
                                  {isPaid ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Pagado</span>
                                    </span>
                                  ) : isOverdue ? (
                                    <span className="inline-flex items-center gap-1 text-rose-800 bg-rose-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Vencido</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      <Clock className="w-3 h-3" />
                                      <span>Pendiente de vencimiento</span>
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 text-right">
                                  {(!isPaid && isOverdue && !item.id.startsWith('payroll-') && !item.id.startsWith('loan-')) && (
                                    <button
                                      disabled={payingObligationId === item.id || payingTaxId === item.id}
                                      onClick={() => {
                                        if (item.origin.includes('AEAT') || item.origin.includes('TGSS')) {
                                          handlePayTaxObligation(item.id);
                                        } else {
                                          handlePayObligation(item.id);
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] transition shadow-xs cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <span>Pagar</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: BANK LOANS & MORTGAGES (PRÉSTAMOS) */}
            {activeTab === 'loans' && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Landmark className="w-5 h-5 text-emerald-600" />
                        <span>Préstamos</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Detalle de préstamos bancarios e hipotecas activas concedidos para la financiación de bienes inmuebles.
                      </p>
                    </div>
                  </div>

                  {(!data.loans || data.loans.filter(l => l.status === 'active').length === 0) ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No existen préstamos ni hipotecas activas en este momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.loans.filter(l => l.status === 'active').map(loan => {
                        const unpaidRows = (loan.schedule || []).filter(r => !r.paid);
                        const unpaidSum = unpaidRows.reduce((acc, r) => acc + r.payment, 0);
                        const unpaidPrincipal = unpaidRows.reduce((acc, r) => acc + r.principal, 0);

                        return (
                          <div key={loan.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors">
                            <div>
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="inline-block text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 mb-1">
                                    Préstamo hipotecario
                                  </span>
                                  <h4 className="text-sm font-black text-slate-900 line-clamp-1">
                                    {loan.collateral.propertyTitle || 'Garantía inmobiliaria'}
                                  </h4>
                                </div>
                                <span className="text-xs font-mono font-bold text-slate-500">
                                  Ref: #{loan.id.slice(0, 8)}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-y border-slate-200/80 py-3 my-2">
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital otorgado</span>
                                  <span className="font-extrabold text-slate-800">{loan.offeredAmount.toLocaleString('es-ES')} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuotas pendientes</span>
                                  <span className="font-extrabold text-rose-700">{unpaidSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital vivo (principal)</span>
                                  <span className="font-extrabold text-slate-800">{unpaidPrincipal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuota mensual</span>
                                  <span className="font-extrabold text-slate-900">{loan.monthlyPayment.toLocaleString('es-ES')} €/mes</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>Plazo: {loan.termMonths} meses • {loan.annualInterestRate}% interés</span>
                                <span>{unpaidRows.length} cuotas restantes</span>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedLoanForTable(loan)}
                              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Ver cuadro de amortización completo</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />

      {/* DETAILED DEBT BREAKDOWN MODAL BY OPERATION ORIGIN */}
      {showDebtDetailsModal && data && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600/20 text-red-400 rounded-2xl border border-red-500/30">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Detalle de Deudas por Operación Origen</h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Simulador de Daniel Arnaiz Boluda • Contabilidad y Gestión Patrimonial
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDebtDetailsModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-900">
                  <span className="text-[10px] font-extrabold uppercase text-red-600 block mb-1">Deuda Total Pendiente</span>
                  <div className="text-xl font-black text-red-700">
                    {data.summary.totalPendingObligations.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-red-600/80 mt-1 block">
                    Pagarés + Préstamos Bancarios
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">Préstamos Hipotecarios</span>
                  <div className="text-xl font-black text-emerald-800">
                    {(data.summary.totalLoansPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-emerald-700/80 mt-1 block">
                    {data.summary.activeLoansCount || 0} operación(es) con Banco Simulado
                  </span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900">
                  <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">Pagarés / Letras de Cambio</span>
                  <div className="text-xl font-black text-amber-900">
                    {(data.summary.totalObligationsPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-amber-800/80 mt-1 block">
                    {data.obligations.filter(o => o.status === 'pendiente').length} cuota(s) por vencer
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setDebtFilterOrigin('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    debtFilterOrigin === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todas las Deudas
                </button>
                <button
                  onClick={() => setDebtFilterOrigin('loans')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === 'loans'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Préstamos Bancarios ({(data.loans || []).length})</span>
                </button>
                <button
                  onClick={() => setDebtFilterOrigin('obligations')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === 'obligations'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Pagarés y Letras ({data.obligations.filter(o => o.status === 'pendiente' && o.type !== 'cuota_alquiler').length})</span>
                </button>
              </div>

              {/* LIST BY OPERATION ORIGIN */}
              <div className="space-y-6">
                {/* ORIGIN 1: BANK LOANS */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'loans') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>Operación Origen: Financiación Hipotecaria Bancaria</span>
                      </h3>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        Banco Simulado
                      </span>
                    </div>

                    {(!data.loans || data.loans.length === 0) ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen préstamos bancarios o hipotecarios concedidos para esta empresa.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {data.loans.map(loan => {
                          const unpaidRows = (loan.schedule || []).filter(r => !r.paid);
                          const unpaidSum = unpaidRows.reduce((acc, r) => acc + r.payment, 0);
                          const unpaidPrincipal = unpaidRows.reduce((acc, r) => acc + r.principal, 0);
                          const paidCount = loan.termMonths - unpaidRows.length;

                          return (
                            <div key={loan.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      Préstamo Bancario
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">Ref: #{loan.id}</span>
                                  </div>
                                  <h4 className="text-base font-black text-slate-900 mt-1">
                                    {loan.collateral.propertyTitle || 'Garantía Inmobiliaria'}
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Superficie: {loan.collateral.surfaceM2 || '—'} m² • Valor de Tasación: {loan.collateral.appraisalValue.toLocaleString('es-ES')} €
                                  </p>
                                </div>

                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Deuda Pendiente en Cuotas</span>
                                  <div className="text-lg font-black text-red-700">
                                    {unpaidSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Otorgado</span>
                                  <span className="font-extrabold text-slate-900">{loan.offeredAmount.toLocaleString('es-ES')} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Vivo Pendiente</span>
                                  <span className="font-extrabold text-slate-900">{unpaidPrincipal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuota Mensual</span>
                                  <span className="font-extrabold text-slate-900">{loan.monthlyPayment.toLocaleString('es-ES')} €/mes</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Interés y Plazo</span>
                                  <span className="font-extrabold text-slate-900">{loan.annualInterestRate}% • {paidCount}/{loan.termMonths} pagadas</span>
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => {
                                    setShowDebtDetailsModal(false);
                                    setSelectedLoanForTable(loan);
                                  }}
                                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-2"
                                >
                                  <Calculator className="w-4 h-4 text-emerald-400" />
                                  <span>Ver Cuadro de Amortización Completo</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ORIGIN 2: PROMISSORY NOTES & BILLS OF EXCHANGE */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'obligations') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-amber-600" />
                        <span>Operación origen: compras</span>
                      </h3>
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                        Efectos Mercantiles
                      </span>
                    </div>

                    {data.obligations.filter(o => o.type !== 'cuota_alquiler').length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen pagarés ni letras de cambio pendientes de vencimiento.
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                              <th className="p-3">Instrumento</th>
                              <th className="p-3">Inmueble Origen</th>
                              <th className="p-3">Nº Cuota</th>
                              <th className="p-3">Importe</th>
                              <th className="p-3">Vencimiento</th>
                              <th className="p-3">Estado</th>
                              <th className="p-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {[...data.obligations]
                              .filter(o => o.type !== 'cuota_alquiler')
                              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                              .map(ob => {
                              const isPaid = ob.status === 'pagado';

                              return (
                                <tr key={ob.id} className="hover:bg-slate-50 transition">
                                  <td className="p-3 font-bold text-slate-800">
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] uppercase font-bold">
                                      {ob.type === 'pagare' ? 'Pagaré' : 'Letra de Cambio'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-900 font-bold">{ob.propertyTitle}</td>
                                  <td className="p-3 text-slate-600">
                                    Cuota {ob.installmentNumber || 1} / {ob.totalInstallments || 12}
                                  </td>
                                  <td className="p-3 font-black text-slate-900 text-sm">
                                    {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="p-3 font-mono text-slate-700">
                                    {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                  </td>
                                  <td className="p-3">
                                    {isPaid ? (
                                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pagado
                                      </span>
                                    ) : (
                                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right space-x-1.5">
                                    
                                    {(!isPaid && (new Date(ob.dueDate) <= new Date() || ob.status === 'vencido')) && (
                                      <button
                                        disabled={payingObligationId === ob.id}
                                        onClick={() => handlePayObligation(ob.id)}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                      >
                                        {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                        <span>Pagar</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ORIGIN 3: RENT COMMITMENTS */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'rent') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span>Operación origen: alquileres</span>
                      </h3>
                      <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                        Alquileres
                      </span>
                    </div>

                    {data.obligations.filter(o => o.type === 'cuota_alquiler').length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen recibos de alquiler pendientes de abono.
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                              <th className="p-3">Inmueble Alquilado</th>
                              <th className="p-3">Nº Cuota</th>
                              <th className="p-3">Importe Mensual</th>
                              <th className="p-3">Vencimiento</th>
                              <th className="p-3">Estado</th>
                              <th className="p-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {[...data.obligations]
                              .filter(o => o.type === 'cuota_alquiler')
                              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                              .map(ob => {
                              const isPaid = ob.status === 'pagado';

                              return (
                                <tr key={ob.id} className="hover:bg-slate-50 transition">
                                  <td className="p-3 text-slate-900 font-bold">{ob.propertyTitle}</td>
                                  <td className="p-3 text-slate-600">
                                    Cuota {ob.installmentNumber || 1} / {ob.totalInstallments || 12}
                                  </td>
                                  <td className="p-3 font-black text-slate-900 text-sm">
                                    {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="p-3 font-mono text-slate-700">
                                    {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                  </td>
                                  <td className="p-3">
                                    {isPaid ? (
                                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pagado
                                      </span>
                                    ) : (
                                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right space-x-1.5">
                                    
                                    {(!isPaid && (new Date(ob.dueDate) <= new Date() || ob.status === 'vencido')) && (
                                      <button
                                        disabled={payingObligationId === ob.id}
                                        onClick={() => handlePayObligation(ob.id)}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                      >
                                        {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                        <span>Pagar</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                * Las cuotas de alquiler son gastos corrientes pagados por adelantado y no figuran como deudas financieras.
              </span>
              <button
                onClick={() => setShowDebtDetailsModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROPERTY AND MACHINERY PAYMENTS BREAKDOWN MODAL */}
      {selectedPropertyForPayments && data && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            {(() => {
              const item = selectedPropertyForPayments as any;
              const isMachinery = !!item.title && !item.propertyTitle;
              const itemTitle = item.propertyTitle || item.title || 'Detalle de elemento';
              const itemSubtitle = isMachinery 
                ? `${item.optionTitle || 'Línea de producción'} • Instalado en ${item.installationNaveTitle || 'Nave Industrial'}`
                : `${item.location || 'Ubicación no especificada'} • ${item.operation === 'compra' ? 'Inmueble en propiedad' : 'Contrato de arrendamiento'}`;

              return (
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-2xl border ${
                      isMachinery 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {isMachinery ? <Wrench className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white">{itemTitle}</h2>
                      <p className="text-xs text-slate-400 font-medium">{itemSubtitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPropertyForPayments(null)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              );
            })()}

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50 text-xs">
              {(() => {
                const item = selectedPropertyForPayments as any;
                const propObs = data.obligations.filter(o => 
                  (item.id && (o.propertyId === item.id || o.acquisitionId === item.id)) ||
                  (item.propertyId && o.propertyId === item.propertyId) ||
                  (item.propertyTitle && o.propertyTitle === item.propertyTitle) ||
                  (item.title && o.propertyTitle === item.title) ||
                  (item.optionTitle && o.propertyTitle === item.optionTitle)
                );
                const paidObs = propObs.filter(o => o.status === 'pagado');
                const pendingObs = propObs.filter(o => o.status === 'pendiente' || o.status === 'vencido');

                const totalPaid = paidObs.reduce((acc, o) => acc + o.amount, 0) + (item.paymentMethod === 'contado' ? (item.totalPrice || item.basePrice || 0) : 0);
                const totalPending = pendingObs.reduce((acc, o) => acc + o.amount, 0);

                const isMachinery = !!item.title && !item.propertyTitle;

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Importe / Inversión</span>
                        <div className="text-lg font-black text-slate-900">
                          {item.operation === 'alquiler'
                            ? `${(item.monthlyRent || item.totalPrice || 0).toLocaleString('es-ES')} €/mes`
                            : `${(item.totalPrice || item.basePrice || 0).toLocaleString('es-ES')} €`}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          {item.operation === 'alquiler' ? 'Renta mensual de alquiler' : 'Inversión total de adquisición'}
                        </span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">Pagos realizados</span>
                        <div className="text-lg font-black text-emerald-800">
                          {totalPaid.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </div>
                        <span className="text-[10px] text-emerald-700 mt-0.5 block">
                          {item.paymentMethod === 'contado' ? '100% abonado al contado' : `${paidObs.length} cuota(s) abonadas`}
                        </span>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">Pagos pendientes</span>
                        <div className="text-lg font-black text-amber-900">
                          {totalPending.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </div>
                        <span className="text-[10px] text-amber-800 mt-0.5 block">
                          {pendingObs.length} cuota(s) pendientes
                        </span>
                      </div>
                    </div>

                    {/* Installments Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="p-3.5 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
                        <span>{isMachinery ? 'Historial y plan de pagarés de la maquinaria' : 'Historial y plan de pagos del inmueble'}</span>
                        <span className="text-[11px] font-normal text-slate-500">{propObs.length} registros</span>
                      </div>

                      {propObs.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">
                          {item.paymentMethod === 'contado' 
                            ? 'Abonado en su totalidad al contado en la fecha de la transacción.' 
                            : 'No hay cuotas ni pagarés pendientes registrados para este elemento.'}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                <th className="p-3">Concepto / Nº cuota</th>
                                <th className="p-3">Importe (€)</th>
                                <th className="p-3">Vencimiento</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3 text-right">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-xs">
                              {propObs.map((ob) => {
                                const isPaid = ob.status === 'pagado';
                                return (
                                  <tr key={ob.id} className="hover:bg-slate-50/80 transition">
                                    <td className="p-3">
                                      <span className="font-bold text-slate-800 block">
                                        {ob.type === 'cuota_alquiler' ? 'Renta de alquiler' : ob.type === 'pagare' ? 'Pagaré' : 'Letra de cambio'}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Cuota {ob.installmentNumber || 1} de {ob.totalInstallments || 1}
                                      </span>
                                    </td>
                                    <td className="p-3 font-bold text-slate-900 font-mono">
                                      {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </td>
                                    <td className="p-3 text-slate-600 font-mono">
                                      {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                    </td>
                                    <td className="p-3">
                                      {isPaid ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>Pagado</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                          <Clock className="w-3 h-3" />
                                          <span>Pendiente</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right space-x-2">
                                      {(!isPaid && (new Date(ob.dueDate) <= new Date() || ob.status === "vencido")) && (
                                        <button
                                          disabled={payingObligationId === ob.id}
                                          onClick={() => handlePayObligation(ob.id)}
                                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                        >
                                          {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                          <span>Pagar</span>
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedPropertyForPayments(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cerrar detalle de pagos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAN AMORTIZATION SCHEDULE MODAL */}
      {selectedLoanForTable && (
        <LoanAmortizationTable
          loan={selectedLoanForTable}
          onClose={() => setSelectedLoanForTable(null)}
        />
      )}

      {/* DOCUMENT VIEWER MODAL */}
      {activeDocumentModal && (
        <DocumentViewerModal
          data={activeDocumentModal}
          onClose={() => setActiveDocumentModal(null)}
        />
      )}
    </div>
  );
}
