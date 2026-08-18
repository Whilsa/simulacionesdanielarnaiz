/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  User,
  PropertyAcquisition,
  PaymentObligation,
  BankLoan,
  MachineryAcquisition,
  PurchasedVehicle,
  HiredEmployee,
  PayrollRecord,
  TaxObligation,
  ElectricityContract,
  ElectricityBill,
  NaveFloorPlan,
  TelecomContract,
  TelecomInvoice,
  OfficePurchaseOrder,
  RawMaterialOrder,
  RawMaterialInventory,
  RawMaterialNaveInventory,
} from "../types.js";
import {
  Briefcase,
  Landmark,
  Building2,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Euro,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Layers,
  CreditCard,
  Receipt,
  ChevronRight,
  ExternalLink,
  X,
  Info,
  Calculator,
  Wrench,
  Factory,
  Users,
  DollarSign,
  UserCheck,
  Download,
  Zap,
  LayoutGrid,
  PhoneCall,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Package,
  Boxes,
} from "lucide-react";
import DocumentViewerModal, {
  DocumentViewerData,
} from "./DocumentViewerModal.js";
import LoanAmortizationTable from "./LoanAmortizationTable.js";
import Footer from "./Footer.js";
import { NaveFloorPlanViewer } from "./NaveFloorPlanViewer.js";
import { ElectricitySupplyCard } from "./ElectricitySupplyCard.js";
import { ElectricityAssetTab } from "./ElectricityAssetTab.js";
import { TelecomInvoiceModal } from "./TelecomInvoiceModal.js";
import { OfficeInvoiceModal } from "./OfficeInvoiceModal.js";
import { formatNumber } from "../lib/formatters.js";
import { OFFICE_STORE_CATALOG } from "../lib/officeStoreData.js";
import { resolveImageUrl, SVG_FALLBACK } from "../lib/imageAssets.js";

interface CompanyDashboardProps {
  currentUser: User;
  initialTab?:
    | "owned"
    | "rented"
    | "machinery"
    | "employees"
    | "obligations"
    | "loans"
    | "energia"
    | "telecom"
    | "muebles_informatica"
    | "inventory";
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
  purchasedVehicles?: PurchasedVehicle[];
  hiredEmployees?: HiredEmployee[];
  payrollRecords?: PayrollRecord[];
  taxObligations?: TaxObligation[];
}

export default function CompanyDashboard({
  currentUser,
  initialTab = "owned",
  onBackToHub,
  onGoToBank,
  onUserBalanceUpdated,
}: CompanyDashboardProps) {
  const [data, setData] = useState<CompanyDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [payingObligationId, setPayingObligationId] = useState<string | null>(
    null,
  );
  const [payingTaxId, setPayingTaxId] = useState<string | null>(null);
  const [updatingEmpId, setUpdatingEmpId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    | "owned"
    | "rented"
    | "machinery"
    | "vehicles"
    | "employees"
    | "obligations"
    | "loans"
    | "energia"
    | "telecom"
    | "muebles_informatica"
    | "inventory"
  >(initialTab);

  const handleAssignVehicleWarehouse = async (
    vehicleId: string,
    warehouseIndex?: number,
    propertyId?: string,
    propertyTitle?: string,
    warehouseName?: string,
  ) => {
    try {
      const res = await fetch(
        `/api/student/vehicles/${vehicleId}/assign-warehouse`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouseIndex,
            propertyId,
            propertyTitle,
            warehouseName,
          }),
        },
      );
      const result = await res.json();
      if (result.success) {
        fetchCompanyData(true);
      }
    } catch (err) {
      console.error("Error assigning vehicle warehouse:", err);
    }
  };
  const [activeDocumentModal, setActiveDocumentModal] =
    useState<DocumentViewerData | null>(null);

  // Raw Materials & Inventory State
  const [inventoryData, setInventoryData] = useState<{
    rawMaterials?: { [key: string]: number };
    producedGoods?: { [key: string]: number };
    inventory?: RawMaterialInventory;
    machineryStatuses?: any[];
  } | null>(null);
  const [userOrders, setUserOrders] = useState<RawMaterialOrder[]>([]);

  // Inventory Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<'alumno' | 'nave'>('alumno');
  const [fromNaveId, setFromNaveId] = useState<string>('');
  const [toNaveId, setToNaveId] = useState<string>('');
  const [studentsList, setStudentsList] = useState<
    Array<{
      id: string;
      name: string;
      username: string;
      level: number;
      warehouses?: Array<{ id: string; title: string; type: string; address: string; hasForklift?: boolean }>;
    }>
  >([]);
  const [transferRecipientId, setTransferRecipientId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<{
    id: string;
    name: string;
    username: string;
    level: number;
    warehouses?: Array<{ id: string; title: string; type: string; address: string; hasForklift?: boolean }>;
  } | null>(null);
  const [transferDestinationNaveId, setTransferDestinationNaveId] = useState("");
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [transferItemKey, setTransferItemKey] = useState(
    "destornilladores_hierro",
  );
  const [transferQuantity, setTransferQuantity] = useState<number | string>(
    100,
  );
  const [transferTransportMethod, setTransferTransportMethod] = useState<
    "propio" | "exterior"
  >("exterior");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const fetchStudentsList = async () => {
    try {
      const res = await fetch("/api/students-list");
      const data = await res.json();
      if (data.students) {
        setStudentsList(
          data.students.filter((s: any) => s.id !== currentUser.id),
        );
      }
    } catch (e) {
      console.error("Error cargando lista de alumnos:", e);
    }
  };

  const [isUpdatingRodMode, setIsUpdatingRodMode] = useState(false);

  const handleSetRodProductionMode = async (mode: 'estrella' | 'plana') => {
    try {
      setIsUpdatingRodMode(true);
      const res = await fetch('/api/raw-materials/rod-production-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentUser.id, mode }),
      });
      const data = await res.json();
      if (data.success) {
        setInventoryData((prev: any) => ({
          ...prev,
          inventory: data.inventory || prev?.inventory,
          rawMaterials: data.rawMaterials || prev?.rawMaterials,
          producedGoods: data.producedGoods || prev?.producedGoods,
        }));
      }
    } catch (e) {
      console.error('Error al cambiar modo de producción de varillas:', e);
    } finally {
      setIsUpdatingRodMode(false);
    }
  };

  const handleOpenTransferModal = (initialFromNaveId?: string, mode?: "alumno" | "nave") => {
    fetchStudentsList();
    setRecipientSearch("");
    setSelectedRecipient(null);
    setShowRecipientDropdown(false);
    setTransferRecipientId("");
    setTransferMode(mode || "alumno");

    const userNaves = (data?.acquisitions || []).filter(a =>
      ['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
      (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
      (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
      (a.propertyTitle || a.title || '').toLowerCase().includes('almacen')
    );

    if (userNaves.length > 0) {
      const selectedFrom = (initialFromNaveId && userNaves.some(n => n.id === initialFromNaveId))
        ? initialFromNaveId
        : userNaves[0].id;
      setFromNaveId(selectedFrom);
      const availableToNaves = userNaves.filter(n => n.id !== selectedFrom);
      if (availableToNaves.length > 0) {
        setToNaveId(availableToNaves[0].id);
      } else {
        setToNaveId('');
      }
    } else {
      setFromNaveId('');
      setToNaveId('');
    }

    if (currentUser.level === 1) {
      setTransferItemKey("ironKg");
    } else {
      setTransferItemKey("destornilladores_punta_estrella");
    }
    setIsTransferModalOpen(true);
    setTransferError(null);
    setTransferSuccess(null);
  };

  const handleExecuteTransfer = async () => {
    setTransferError(null);
    setTransferSuccess(null);

    const qty = Number(transferQuantity);
    if (isNaN(qty) || qty <= 0) {
      setTransferError("Por favor introduce una cantidad válida mayor a 0.");
      return;
    }

    setIsTransferring(true);
    try {
      let res;
      if (transferMode === 'nave') {
        if (!fromNaveId || !toNaveId) {
          setTransferError("Por favor selecciona la nave de origen y la nave de destino.");
          setIsTransferring(false);
          return;
        }
        if (fromNaveId === toNaveId) {
          setTransferError("La nave de origen y la nave de destino deben ser diferentes.");
          setIsTransferring(false);
          return;
        }

        res = await fetch("/api/inventory/transfer-nave-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: currentUser.id,
            fromNaveId,
            toNaveId,
            itemKey: transferItemKey,
            quantity: qty,
            transportMethod: transferTransportMethod,
          }),
        });
      } else {
        if (!transferRecipientId) {
          setTransferError("Por favor selecciona el alumno destinatario.");
          setIsTransferring(false);
          return;
        }

        res = await fetch("/api/inventory/transfer-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: currentUser.id,
            recipientId: transferRecipientId,
            fromNaveId: fromNaveId || undefined,
            destinationNaveId: transferDestinationNaveId || undefined,
            itemKey: transferItemKey,
            quantity: qty,
            transportMethod: transferTransportMethod,
          }),
        });
      }

      const result = await res.json();
      if (res.ok && result.success) {
        setTransferSuccess(result.message);
        fetchInventoryData();
        fetchCompanyData(true);
        if (typeof result.newBalance === "number") {
          onUserBalanceUpdated?.(result.newBalance);
        }
        setTimeout(() => {
          setIsTransferModalOpen(false);
          setTransferSuccess(null);
        }, 1800);
      } else {
        setTransferError(
          result.error || "Error procesando el traslado de existencias.",
        );
      }
    } catch (err) {
      setTransferError("Error de red al realizar el traslado de existencias.");
    } finally {
      setIsTransferring(false);
    }
  };

  const fetchInventoryData = async () => {
    try {
      const [res, ordersRes] = await Promise.all([
        fetch(`/api/raw-materials/inventory?studentId=${currentUser.id}`),
        fetch(`/api/raw-materials/orders?studentId=${currentUser.id}`),
      ]);
      if (res.ok) {
        const json = await res.json();
        setInventoryData(json);
      }
      if (ordersRes.ok) {
        const ordersJson = await ordersRes.json();
        if (ordersJson.orders) {
          setUserOrders(ordersJson.orders);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Modal for detailed breakdown of debts by operation origin
  const [showDebtDetailsModal, setShowDebtDetailsModal] = useState(false);
  const [showMachineryInfoModal, setShowMachineryInfoModal] = useState(false);
  const [debtFilterOrigin, setDebtFilterOrigin] = useState<
    "all" | "loans" | "obligations"
  >("all");
  const [selectedLoanForTable, setSelectedLoanForTable] =
    useState<BankLoan | null>(null);
  const [selectedPropertyForPayments, setSelectedPropertyForPayments] =
    useState<PropertyAcquisition | null>(null);

  // Electricity & Floor Plan State
  const [selectedNaveForFloorPlan, setSelectedNaveForFloorPlan] =
    useState<PropertyAcquisition | null>(null);
  const [electricityContracts, setElectricityContracts] = useState<
    ElectricityContract[]
  >([]);
  const [electricityContract, setElectricityContract] = useState<
    ElectricityContract | undefined
  >(undefined);
  const [electricityBills, setElectricityBills] = useState<ElectricityBill[]>(
    [],
  );
  const [naveFloorPlans, setNaveFloorPlans] = useState<NaveFloorPlan[]>([]);

  // Machinery Relocation State
  const [relocateModalMachinery, setRelocateModalMachinery] =
    useState<MachineryAcquisition | null>(null);
  const [targetRelocateNaveId, setTargetRelocateNaveId] = useState<string>("");
  const [relocateError, setRelocateError] = useState<string | null>(null);
  const [relocateSuccess, setRelocateSuccess] = useState<string | null>(null);
  const [isRelocatingSubmitting, setIsRelocatingSubmitting] = useState(false);

  const handleConfirmRelocation = async () => {
    if (!relocateModalMachinery || !targetRelocateNaveId) return;
    setIsRelocatingSubmitting(true);
    setRelocateError(null);
    setRelocateSuccess(null);

    try {
      const res = await fetch(
        `/api/student/machinery/${relocateModalMachinery.id}/relocate`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetNaveId: targetRelocateNaveId,
            studentId: currentUser.id,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok || !result.success) {
        setRelocateError(
          result.error || "No se pudo iniciar el traslado de la maquinaria.",
        );
      } else {
        setRelocateSuccess(result.message);
        await fetchCompanyData();
        setTimeout(() => {
          setRelocateModalMachinery(null);
          setRelocateSuccess(null);
        }, 2500);
      }
    } catch (err: any) {
      setRelocateError(err.message || "Error al comunicar con el servidor.");
    } finally {
      setIsRelocatingSubmitting(false);
    }
  };

  // Telecom & Office Store State
  const [telecomContracts, setTelecomContracts] = useState<TelecomContract[]>(
    [],
  );
  const [telecomInvoices, setTelecomInvoices] = useState<TelecomInvoice[]>([]);
  const [officeOrders, setOfficeOrders] = useState<OfficePurchaseOrder[]>([]);
  const [selectedTelecomInvoiceModal, setSelectedTelecomInvoiceModal] =
    useState<TelecomInvoice | null>(null);
  const [selectedOfficeOrderModal, setSelectedOfficeOrderModal] =
    useState<OfficePurchaseOrder | null>(null);

  const fetchTelecomAndOfficeData = async () => {
    try {
      const [tcRes, tiRes, ordRes] = await Promise.all([
        fetch(`/api/telecom/contracts?studentId=${currentUser.id}`),
        fetch(`/api/telecom/invoices?studentId=${currentUser.id}`),
        fetch(`/api/office-store/orders?studentId=${currentUser.id}`),
      ]);
      if (
        tcRes.ok &&
        tcRes.headers.get("content-type")?.includes("application/json")
      ) {
        const tcData = await tcRes.json();
        setTelecomContracts(tcData.contracts || []);
      }
      if (
        tiRes.ok &&
        tiRes.headers.get("content-type")?.includes("application/json")
      ) {
        const tiData = await tiRes.json();
        setTelecomInvoices(tiData.invoices || []);
      }
      if (
        ordRes.ok &&
        ordRes.headers.get("content-type")?.includes("application/json")
      ) {
        const ordData = await ordRes.json();
        setOfficeOrders(ordData.orders || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchElectricityData = async () => {
    try {
      const [cRes, bRes, fRes] = await Promise.all([
        fetch(`/api/electricity/contracts?studentId=${currentUser.id}`),
        fetch(`/api/electricity/bills?studentId=${currentUser.id}`),
        fetch(`/api/electricity/floor-plans?studentId=${currentUser.id}`),
      ]);
      if (
        cRes.ok &&
        cRes.headers.get("content-type")?.includes("application/json")
      ) {
        const cJson = await cRes.json();
        const contracts = cJson.contracts || [];
        setElectricityContracts(contracts);
        if (contracts.length > 0) {
          setElectricityContract(contracts[0]);
        }
      }
      if (
        bRes.ok &&
        bRes.headers.get("content-type")?.includes("application/json")
      ) {
        const bJson = await bRes.json();
        setElectricityBills(bJson.bills || []);
      }
      if (
        fRes.ok &&
        fRes.headers.get("content-type")?.includes("application/json")
      ) {
        const fJson = await fRes.json();
        setNaveFloorPlans(fJson.floorPlans || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCompanyData = async (isSilent = false) => {
    if (!isSilent && !data) {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/company/${currentUser.id}`);
      if (!res.ok)
        throw new Error("Error al cargar la información patrimonial");
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta del servidor no válida (no es JSON)");
      }
      const json = await res.json();
      setData(json);
      if (json.company?.balance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(json.company.balance);
      }
    } catch (err: any) {
      setError(err.message || "Error de servidor");
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCompanyData();
    fetchElectricityData();
    fetchTelecomAndOfficeData();
    fetchInventoryData();
  }, [currentUser.id]);

  const handleSaveFloorPlan = async (plan: Partial<NaveFloorPlan>) => {
    const res = await fetch("/api/electricity/floor-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, studentId: currentUser.id }),
    });
    if (res.ok) {
      await fetchElectricityData();
    }
  };

  const handleContractElectricity = async (
    propertyId: string,
    propertyTitle: string,
    powerKw: number,
  ) => {
    const res = await fetch("/api/electricity/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: currentUser.id,
        propertyId,
        propertyTitle,
        contractedPowerKw: powerKw,
      }),
    });
    if (res.ok) {
      await fetchElectricityData();
      await fetchCompanyData();
    }
  };

  const handleDownloadPayrollDetail = (
    periodName: string,
    employees: HiredEmployee[],
  ) => {
    if (!employees || employees.length === 0) return;

    let totalGrossSum = 0;
    let totalIRPFSum = 0;
    let totalSSEmpSum = 0;
    let totalNetSum = 0;
    let totalSSCompSum = 0;

    const curNow = new Date();
    const curY = curNow.getFullYear();
    const curM = curNow.getMonth() + 1;

    const empLines = employees
      .map((emp, i) => {
        let isFirstMonth = false;
        let hireDay = 1;
        if (emp.hireDate) {
          const parts = emp.hireDate.split("T")[0].split("-");
          const hy = parseInt(parts[0], 10);
          const hm = parseInt(parts[1], 10);
          hireDay = parseInt(parts[2], 10);
          isFirstMonth = hy === curY && hm === curM;
        }
        const daysInMonth = new Date(curY, curM, 0).getDate();
        const daysWorked = isFirstMonth
          ? Math.max(1, daysInMonth - hireDay + 1)
          : daysInMonth;
        const gross = isFirstMonth
          ? Math.round(
              (emp.grossSalaryMonthly / daysInMonth) * daysWorked * 100,
            ) / 100
          : emp.grossSalaryMonthly;
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
   Fecha de contratación: ${emp.hireDate ? emp.hireDate.split("T")[0] : "N/A"}
   Días computados en mes: ${daysWorked} días ${isFirstMonth ? "(Proporcional primer mes)" : "(100% Mes completo)"}
   Sueldo bruto: ${formatNumber(gross)} €
   Retención IRPF (17%): ${formatNumber(irpf)} €
   Seguridad Social empleado (6,48%): ${formatNumber(ssEmp)} €
   Sueldo líquido / neto a cobrar: ${formatNumber(net)} €
   Aportación Seguridad Social empresa (75%): ${formatNumber(ssComp)} €`;
      })
      .join("\n\n");

    const textContent = `===================================================================
DETALLE Y RESUMEN DE NÓMINAS DE LA EMPRESA
===================================================================
Empresa: ${currentUser.name}
Cuenta IBAN: ${currentUser.accountNumber}
Periodo: ${periodName}
Fecha de emisión: ${new Date().toLocaleDateString("es-ES")}

-------------------------------------------------------------------
DESGLOSE POR EMPLEADO:
-------------------------------------------------------------------
${empLines}

-------------------------------------------------------------------
RESUMEN TOTAL DE LA EMPRESA (${employees.length} empleados):
-------------------------------------------------------------------
Total sueldos brutos: ${formatNumber(totalGrossSum)} €
Total IRPF a retener e ingresar en Hacienda (AEAT): ${formatNumber(totalIRPFSum)} €
Total Seguridad Social a retener empleados (TGSS): ${formatNumber(totalSSEmpSum)} €
Total sueldos líquidos a abonar a los empleados: ${formatNumber(totalNetSum)} €
Total gasto en Seguridad Social a cargo de la empresa (75%): ${formatNumber(totalSSCompSum)} €
Gasto total de personal para la empresa: ${formatNumber(totalGrossSum + totalSSCompSum)} €
===================================================================`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Detalle_Nominas_${currentUser.name.replace(/\s+/g, "_")}_${periodName.replace(/\s+/g, "_")}.txt`;
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
      status: "pendiente" | "pagado" | "vencido";
    }> = [];

    // 1. Payment obligations (Pagarés, letras, alquileres, maquinaria)
    (data.obligations || []).forEach((ob) => {
      const d = new Date(ob.dueDate);
      if (d <= maxDate) {
        let concept = `${ob.type === "pagare" ? "Pagaré" : ob.type === "letra_cambio" ? "Letra de cambio" : "Cuota de alquiler"} (${ob.installmentNumber || 1}/${ob.totalInstallments || 12}): ${ob.propertyTitle}`;
        if (ob.type === "alquiler" || ob.type === "cuota_alquiler") {
          concept = `Cuota de alquiler n.º ${ob.installmentNumber || 1} de ${ob.propertyTitle}`;
        } else if (ob.type === "compra" || ob.type === "compra_inmueble") {
          concept = `Pago aplazado de compra de ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 12})`;
        } else if (
          ob.type === "maquinaria" ||
          (ob.propertyTitle &&
            (ob.propertyTitle.toLowerCase().includes("línea") ||
              ob.propertyTitle.toLowerCase().includes("maquina") ||
              ob.propertyTitle.toLowerCase().includes("máquina")))
        ) {
          concept = `Pago aplazado de la máquina ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 24})`;
        }

        items.push({
          id: ob.id,
          concept,
          origin:
            ob.type === "pagare"
              ? "Pagaré comercial"
              : ob.type === "letra_cambio"
                ? "Letra de cambio"
                : "Alquiler de inmueble",
          amount: ob.amount,
          dueDate: ob.dueDate,
          status: ob.status,
        });
      }
    });

    // 2. Tax and Social Security obligations
    (data.taxObligations || []).forEach((tax) => {
      const d = new Date(tax.dueDate);
      if (d <= maxDate) {
        const isIRPF = tax.type === "irpf";
        const origin =
          isIRPF || tax.agency === "AEAT"
            ? "Hacienda Pública (AEAT)"
            : "Seguridad Social (TGSS)";
        items.push({
          id: tax.id,
          concept:
            tax.concept ||
            (isIRPF ? "Retenciones IRPF de nóminas (17%)" : "Seguridad Social"),
          origin,
          amount: tax.amount,
          dueDate: tax.dueDate,
          status: tax.status,
        });
      }
    });

    // 3. Bank Loan amortization schedules (for active loans)
    (data.loans || [])
      .filter((l) => l.status === "active")
      .forEach((loan) => {
        (loan.schedule || []).forEach((row) => {
          const d = new Date(row.dueDate);
          if (d <= maxDate && !row.paid) {
            const installmentNum =
              row.period || (row as any).installmentNumber || 1;
            items.push({
              id: `loan-${loan.id}-${installmentNum}`,
              concept: `Cuota ${installmentNum}/${loan.termMonths} de préstamo hipotecario (${loan.collateral?.propertyTitle || "Garantía inmobiliaria"})`,
              origin: "Préstamo hipotecario",
              amount: row.payment,
              dueDate: row.dueDate,
              status: "pendiente",
            });
          }
        });
      });

    // 4. Upcoming monthly net payrolls, Seguridad Social (TGSS on 20th of next month, separated) and IRPF (AEAT on 15th of month following quarter)
    const studentEmps = data.hiredEmployees || [];
    if (studentEmps.length > 0) {
      const getGrossForMonth = (tMonth: number, tYear: number) => {
        let gSum = 0;
        studentEmps.forEach((e) => {
          if (!e.hireDate) {
            gSum += e.grossSalaryMonthly;
          } else {
            const parts = e.hireDate.split("T")[0].split("-");
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
      const quarterlyIRPFMap: {
        [key: string]: {
          amount: number;
          dueDate: Date;
          qNum: number;
          targetYear: number;
        };
      } = {};

      for (let m = 0; m < 24; m++) {
        const refDate = new Date(
          now.getFullYear(),
          now.getMonth() + m,
          1,
          9,
          0,
          0,
        );
        const targetYear = refDate.getFullYear();
        const targetMonth = refDate.getMonth() + 1; // 1-based

        const pDate = new Date(targetYear, targetMonth, 1, 9, 0, 0); // 1st of month following targetMonth
        const ssDueDate = new Date(targetYear, targetMonth, 20, 9, 0, 0); // 20th of month following targetMonth

        let monthGross = 0;
        let empIndex = 0;

        studentEmps.forEach((e) => {
          empIndex++;
          let eGross = 0;

          if (!e.hireDate) {
            eGross = e.grossSalaryMonthly;
          } else {
            const parts = e.hireDate.split("T")[0].split("-");
            const hireYear = parseInt(parts[0], 10);
            const hireMonth = parseInt(parts[1], 10);
            const hireDay = parseInt(parts[2], 10);

            if (
              targetYear < hireYear ||
              (targetYear === hireYear && targetMonth < hireMonth)
            ) {
              // Not hired yet
              return;
            }
            if (hireYear === targetYear && hireMonth === targetMonth) {
              const daysInMonth = new Date(
                targetYear,
                targetMonth,
                0,
              ).getDate();
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
              concept: `Nómina neta - ${e.employeeName || e.name || "Empleado"} (Mes ${targetMonth}/${targetYear})`,
              origin: "Nóminas de personal",
              amount: eNet,
              dueDate: pDate.toISOString(),
              status: "pendiente",
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

            const hasSsEmpInDb = (data.taxObligations || []).some(
              (t) =>
                (t.type === "ss_employee" || t.type === "ss") &&
                new Date(t.dueDate).getFullYear() === followingYear &&
                new Date(t.dueDate).getMonth() === followingMonth,
            );

            const hasSsCompInDb = (data.taxObligations || []).some(
              (t) =>
                t.type === "ss_company" &&
                new Date(t.dueDate).getFullYear() === followingYear &&
                new Date(t.dueDate).getMonth() === followingMonth,
            );

            if (!hasSsEmpInDb && monthSSEmp > 0) {
              items.push({
                id: `payroll-ss-emp-${m}`,
                concept: `Cuotas Seguridad Social Trabajador (6,48%) Mes ${targetMonth}/${targetYear}`,
                origin: "Seguridad Social (TGSS)",
                amount: monthSSEmp,
                dueDate: ssDueDate.toISOString(),
                status: "pendiente",
              });
            }

            if (!hasSsCompInDb && monthSSComp > 0) {
              items.push({
                id: `payroll-ss-comp-${m}`,
                concept: `Aportación patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`,
                origin: "Seguridad Social (TGSS)",
                amount: monthSSComp,
                dueDate: ssDueDate.toISOString(),
                status: "pendiente",
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
            const qGross =
              getGrossForMonth((qNum - 1) * 3 + 1, targetYear) +
              getGrossForMonth((qNum - 1) * 3 + 2, targetYear) +
              getGrossForMonth((qNum - 1) * 3 + 3, targetYear);
            const qIRPFAmount = Math.round(qGross * 0.17 * 100) / 100;
            quarterlyIRPFMap[qKey] = {
              amount: qIRPFAmount,
              dueDate: irpfDueDate,
              qNum,
              targetYear,
            };
          }
        }
      }

      // Add accumulated quarterly IRPF items
      Object.entries(quarterlyIRPFMap).forEach(([qKey, qData], idx) => {
        if (
          qData.dueDate >= now &&
          qData.dueDate <= maxDate &&
          qData.amount > 0
        ) {
          const dueYear = qData.dueDate.getFullYear();
          const dueMonth = qData.dueDate.getMonth();

          const hasIrpfInDb = (data.taxObligations || []).some(
            (t) =>
              t.type === "irpf" &&
              new Date(t.dueDate).getFullYear() === dueYear &&
              new Date(t.dueDate).getMonth() === dueMonth,
          );

          if (!hasIrpfInDb) {
            items.push({
              id: `payroll-irpf-quarterly-${idx}-${qKey}`,
              concept: `Retenciones IRPF de nóminas (17%) Trimestre Q${qData.qNum} ${qData.targetYear}`,
              origin: "Hacienda Pública (AEAT)",
              amount: qData.amount,
              dueDate: qData.dueDate.toISOString(),
              status: "pendiente",
            });
          }
        }
      });
    }

    items.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    return items;
  };

  const handlePayObligation = async (obligationId: string) => {
    setPayingObligationId(obligationId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/obligations/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId,
          studentId: currentUser.id,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al procesar el pago");

      setSuccessMsg(json.message);
      fetchCompanyData(true);
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
      const res = await fetch("/api/taxes/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxId,
          studentId: currentUser.id,
        }),
      });

      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "Error al liquidar el impuesto/SS");

      setSuccessMsg(json.message);
      fetchCompanyData(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPayingTaxId(null);
    }
  };

  const handleAssignEmployeeMachineryShift = async (
    employeeId: string,
    machineryId?: string,
    shift?: number,
  ) => {
    setUpdatingEmpId(employeeId);
    setError(null);

    // Optimistically update local state so UI updates instantly without unmounting/scrolling
    setData((prev) => {
      if (!prev || !prev.hiredEmployees) return prev;
      return {
        ...prev,
        hiredEmployees: prev.hiredEmployees.map((emp) =>
          emp.id === employeeId
            ? { ...emp, assignedMachineryId: machineryId, shift: shift || 1 }
            : emp
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/student/employees/${employeeId}/assign-machinery`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineryId, shift }),
        },
      );
      if (!res.ok)
        throw new Error("Error al actualizar asignación del empleado");
      fetchCompanyData(true);
    } catch (err: any) {
      setError(err.message);
      fetchCompanyData(true);
    } finally {
      setUpdatingEmpId(null);
    }
  };

  const handleAssignEmployeeVehicle = async (
    employeeId: string,
    vehicleId?: string,
    warehouseIndex?: number,
    shift?: number,
  ) => {
    setUpdatingEmpId(employeeId);
    setError(null);

    // Optimistically update local state so UI updates instantly without unmounting/scrolling
    setData((prev) => {
      if (!prev || !prev.hiredEmployees) return prev;
      return {
        ...prev,
        hiredEmployees: prev.hiredEmployees.map((emp) =>
          emp.id === employeeId
            ? {
                ...emp,
                assignedVehicleId: vehicleId,
                assignedWarehouseIndex: warehouseIndex,
                shift: shift || 1,
              }
            : emp
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/student/employees/${employeeId}/assign-vehicle`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleId, warehouseIndex, shift }),
        },
      );
      if (!res.ok)
        throw new Error("Error al actualizar asignación del empleado");
      fetchCompanyData(true);
    } catch (err: any) {
      setError(err.message);
      fetchCompanyData(true);
    } finally {
      setUpdatingEmpId(null);
    }
  };

  const handleAutoAssignMachineryShift = (
    machineryId: string,
    shift: number,
  ) => {
    if (updatingEmpId || !data || !data.hiredEmployees) return;
    const unassigned =
      data.hiredEmployees.find(
        (e) =>
          (e.role === "operario" || !e.role) &&
          !e.assignedMachineryId &&
          !e.assignedWarehouseIndex,
      ) ||
      data.hiredEmployees.find(
        (e) => !e.assignedMachineryId && !e.assignedWarehouseIndex,
      );
    if (unassigned) {
      handleAssignEmployeeMachineryShift(unassigned.id, machineryId, shift);
    }
  };

  const handleAutoAssignWarehouseShift = (
    warehouseIndex: number,
    shift: number,
  ) => {
    if (updatingEmpId || !data || !data.hiredEmployees) return;
    const unassigned =
      data.hiredEmployees.find(
        (e) =>
          (e.role === "carretillero" || e.role === "camionero" || (e.role as string) === "conductor") &&
          !e.assignedWarehouseIndex &&
          !e.assignedMachineryId,
      ) ||
      data.hiredEmployees.find(
        (e) => !e.assignedWarehouseIndex && !e.assignedMachineryId,
      );
    if (unassigned) {
      handleAssignEmployeeVehicle(
        unassigned.id,
        unassigned.assignedVehicleId,
        warehouseIndex,
        shift,
      );
    }
  };

  const handleDownloadPayrollCsv = () => {
    if (!data || !data.hiredEmployees || data.hiredEmployees.length === 0)
      return;

    const currentMonthStr = new Date().toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
    const hiredList = data.hiredEmployees;

    const headers = [
      "Empleado",
      "Edad",
      "Fecha Contratación",
      "Maquinaria Asignada",
      "Turno",
      "Sueldo Bruto (€)",
      "IRPF Retenido 17% (€)",
      "SS Empleado 6,48% (€)",
      "Sueldo Neto (€)",
      "SS Empresa 75% (€)",
      "Coste Total Empresa (€)",
    ];

    let csvContent = `DETALLE DE NÓMINAS DEL MES ACTUAL (${currentMonthStr.toUpperCase()})\n`;
    csvContent += `Empresa: ${currentUser.name}\n`;
    csvContent += `CIF / NIF: ${currentUser.nifCif || "B-99887766"}\n`;
    csvContent += `Fecha Generación: ${new Date().toLocaleDateString("es-ES")}\n\n`;

    csvContent += headers.join(";") + "\n";

    let totalGross = 0;
    let totalIrpf = 0;
    let totalSsEmp = 0;
    let totalNet = 0;
    let totalSsComp = 0;
    let totalCost = 0;

    hiredList.forEach((e) => {
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

      const mac = data.machineryAcquisitions?.find(
        (m) => m.id === e.assignedMachineryId,
      );
      const macTitle = mac
        ? `${mac.title || mac.lineTitle} (${mac.installationNaveTitle})`
        : "Sin asignar";
      const shiftText =
        e.shift === 1
          ? "Turno Mañana"
          : e.shift === 2
            ? "Turno Tarde"
            : e.shift === 3
              ? "Turno Noche"
              : "Por defecto";

      const row = [
        `"${e.employeeName}"`,
        e.age,
        `"${new Date(e.hireDate).toLocaleDateString("es-ES")}"`,
        `"${macTitle}"`,
        `"${shiftText}"`,
        formatNumber(gross),
        formatNumber(irpf),
        formatNumber(ssEmp),
        formatNumber(net),
        formatNumber(ssComp),
        formatNumber(cost),
      ];
      csvContent += row.join(";") + "\n";
    });

    // Add totals row
    csvContent += "\n";
    const totalsRow = [
      '"TOTALES PLANTILLA"',
      '""',
      '""',
      '""',
      '""',
      formatNumber(totalGross),
      formatNumber(totalIrpf),
      formatNumber(totalSsEmp),
      formatNumber(totalNet),
      formatNumber(totalSsComp),
      formatNumber(totalCost),
    ];
    csvContent += totalsRow.join(";") + "\n";

    // Trigger download
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `detalle_nominas_${currentUser.username}_${new Date().toISOString().slice(0, 7)}.csv`,
    );
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
                <h1 className="text-base font-bold text-white tracking-tight line-clamp-1">
                  {currentUser.name}
                </h1>
                <p className="text-[11px] text-slate-400">
                  Estado Patrimonial y Contable de la Empresa
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-right">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                Cuenta Bancaria IBAN
              </span>
              <span className="text-xs font-mono font-bold text-slate-200">
                {currentUser.accountNumber}
              </span>
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
            <button
              onClick={() => setError(null)}
              className="text-xs underline text-red-600 hover:text-red-900 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-xs underline text-emerald-600 hover:text-emerald-900 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              Cargando estado financiero de la empresa...
            </p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No se encontraron datos de la empresa.
          </div>
        ) : (
          <>
            {/* Balance Overview Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Bank Balance */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">
                      Saldo en Cuenta Bancaria
                    </span>
                    <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                      <Landmark className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {formatNumber(data.summary.bankBalance)} €
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Tesorería disponible en el Banco Simulado
                  </span>
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
                  <span className="text-xs font-semibold text-slate-500">
                    Activo Inmobiliario
                  </span>
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {formatNumber(data.summary.totalRealEstateAssetsValue)} €
                </div>
                <span className="text-[10px] text-blue-700 font-medium mt-1 block">
                  {data.summary.ownedPropertiesCount} Inmueble(s) en Propiedad
                </span>
              </div>

              {/* Land vs Building Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">
                    Suelo vs Construcción
                  </span>
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Terreno (No Amort.):</span>
                    <span className="font-bold text-slate-900">
                      {formatNumber(data.summary.totalLandValue)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Construcción (2%/año):
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatNumber(data.summary.totalBuildingValue)} €
                    </span>
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
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-red-700 transition-colors">
                        Deudas / Pagarés Pendientes
                      </span>
                      <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                        Ver Detalle
                      </span>
                    </div>
                    <div className="p-2 bg-red-50 group-hover:bg-red-100 rounded-xl text-red-600 transition-colors">
                      <CreditCard className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-red-700">
                    {formatNumber(data.summary.totalPendingObligations)} €
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between items-center">
                    <span>Pagarés / Letras:</span>
                    <span className="font-bold text-slate-800">
                      {formatNumber(
                        data.summary.totalObligationsPendingAmount || 0,
                      )}{" "}
                      €
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Préstamos Hipotecarios:</span>
                    <span className="font-bold text-slate-800">
                      {formatNumber(data.summary.totalLoansPendingAmount || 0)}{" "}
                      €
                    </span>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between text-red-600 font-bold text-[11px] group-hover:translate-x-0.5 transition-transform">
                    <span>Desglose por operación origen</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs - Modern Executive Pill Deck Layout */}
            <div className="bg-slate-100/90 border border-slate-200/90 p-2 rounded-2xl shadow-xs mb-6">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  {
                    id: "owned" as const,
                    label: "Inmuebles Propiedad",
                    count: data.acquisitions.filter((a) => a.operation === "compra").length,
                    icon: Building2,
                    badgeColor: "bg-emerald-100 text-emerald-800",
                  },
                  {
                    id: "rented" as const,
                    label: "Inmuebles Alquiler",
                    count: data.acquisitions.filter((a) => a.operation === "alquiler").length,
                    icon: FileText,
                    badgeColor: "bg-indigo-100 text-indigo-800",
                  },
                  {
                    id: "machinery" as const,
                    label: "Maquinaria",
                    count: data.machineryAcquisitions?.length || 0,
                    icon: Wrench,
                    badgeColor: "bg-amber-100 text-amber-800",
                  },
                  {
                    id: "vehicles" as const,
                    label: "Vehículos",
                    count: data.purchasedVehicles?.length || 0,
                    icon: Truck,
                    badgeColor: "bg-blue-100 text-blue-800",
                  },
                  {
                    id: "inventory" as const,
                    label: "Existencias",
                    count: null,
                    icon: Boxes,
                    badgeColor: "bg-emerald-100 text-emerald-800",
                  },
                  {
                    id: "employees" as const,
                    label: "Empleados",
                    count: data.hiredEmployees?.length || 0,
                    icon: Users,
                    badgeColor: "bg-blue-100 text-blue-800",
                  },
                  {
                    id: "loans" as const,
                    label: "Préstamos",
                    count: data.loans?.filter((l) => l.status === "active").length || 0,
                    icon: Landmark,
                    badgeColor: "bg-slate-200 text-slate-800",
                  },
                  ...(electricityContract
                    ? [
                        {
                          id: "energia" as const,
                          label: "Energía / Luz",
                          count: `${electricityContract.contractedPowerKw} kW`,
                          icon: Zap,
                          badgeColor: "bg-amber-100 text-amber-800",
                        },
                      ]
                    : []),
                  {
                    id: "telecom" as const,
                    label: "Teléfono / Internet",
                    count: telecomContracts.length,
                    icon: PhoneCall,
                    badgeColor: "bg-blue-100 text-blue-800",
                  },
                  {
                    id: "muebles_informatica" as const,
                    label: "Muebles / Informática",
                    count: officeOrders.length,
                    icon: ShoppingBag,
                    badgeColor: "bg-amber-100 text-amber-800",
                  },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  const IconComponent = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-2 group ${
                        isActive
                          ? "bg-slate-900 text-white shadow-md ring-1 ring-slate-900/10 scale-[1.01]"
                          : "bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/80 shadow-2xs"
                      }`}
                    >
                      <div
                        className={`p-1 rounded-lg transition-colors ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600 group-hover:bg-slate-200/70"
                        }`}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <span>{tab.label}</span>
                      {tab.count !== null && tab.count !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
                            isActive
                              ? "bg-white/20 text-white"
                              : `${tab.badgeColor} border border-black/5`
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAB 1: OWNED PROPERTIES */}
            {activeTab === "owned" && (
              <div className="space-y-4">
                {data.acquisitions.filter((a) => a.operation === "compra")
                  .length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no posee ningún inmueble comercial o
                    industrial en propiedad. Puedes adquirir naves, almacenes o
                    locales desde el Portal Inmobiliario.
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
                            <th className="p-3.5">
                              Desglose Suelo / Edificación
                            </th>
                            <th className="p-3.5">Modalidad Pago</th>
                            <th className="p-3.5 text-right">
                              Acciones y Documentos
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.acquisitions
                            .filter((a) => a.operation === "compra")
                            .map((acq) => {
                              const landVal =
                                (acq.basePrice * acq.landPercentage) / 100;
                              const buildVal = acq.basePrice - landVal;
                              const isNave =
                                acq.propertyType === "nave_industrial" ||
                                acq.propertyType === "almacen" ||
                                acq.propertyType === "almacén" ||
                                acq.propertyType === "almacen_logistico" ||
                                acq.type === "nave_industrial" ||
                                acq.type === "almacen" ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("nave") ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("almacén") ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("almacen");

                              return (
                                <tr
                                  key={acq.id}
                                  className="hover:bg-slate-50/80 transition"
                                >
                                  <td className="p-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                                        <Building2 className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="font-bold text-slate-900 block">
                                          {acq.propertyTitle}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          Comprado el{" "}
                                          {new Date(
                                            acq.purchaseDate,
                                          ).toLocaleDateString("es-ES")}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3.5 text-slate-600">
                                    {acq.location}
                                  </td>
                                  <td className="p-3.5 font-bold">
                                    {acq.surfaceM2} m²
                                  </td>
                                  <td className="p-3.5 font-bold text-slate-900">
                                    {formatNumber(acq.basePrice)} €
                                  </td>
                                  <td className="p-3.5 text-slate-600">
                                    {formatNumber(acq.ivaAmount)} €
                                  </td>
                                  <td className="p-3.5">
                                    <div className="text-[11px] space-y-0.5">
                                      <span className="block text-slate-700">
                                        Suelo ({acq.landPercentage}%):{" "}
                                        <strong>
                                          {formatNumber(landVal)} €
                                        </strong>
                                      </span>
                                      <span className="block text-slate-500">
                                        Edificación ({100 - acq.landPercentage}
                                        %):{" "}
                                        <strong>
                                          {formatNumber(buildVal)} €
                                        </strong>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-3.5">
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                        acq.paymentMethod === "contado"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {acq.paymentMethod === "contado"
                                        ? "Al Contado"
                                        : "Pago Aplazado"}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-right space-x-2">
                                    {isNave && (
                                      <button
                                        onClick={() =>
                                          setSelectedNaveForFloorPlan(acq)
                                        }
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                        title="Ver y distribuir la superficie entre almacén y oficinas"
                                      >
                                        <LayoutGrid className="w-3.5 h-3.5 text-blue-200" />
                                        <span>Plano de Distribución</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        setSelectedPropertyForPayments(acq)
                                      }
                                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                      title="Ver historial y desglose de pagos realizados y pendientes"
                                    >
                                      <CreditCard className="w-3.5 h-3.5 text-emerald-300" />
                                      <span>Detalle de Pagos</span>
                                    </button>
                                    <button
                                      onClick={() =>
                                        setActiveDocumentModal({
                                          type: "property_invoice",
                                          acquisition: acq,
                                        })
                                      }
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
            {activeTab === "rented" && (
              <div className="space-y-4">
                {data.acquisitions.filter((a) => a.operation === "alquiler")
                  .length === 0 ? (
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
                          {data.acquisitions
                            .filter((a) => a.operation === "alquiler")
                            .map((acq) => {
                              const baseRent =
                                acq.basePrice ||
                                (acq.monthlyRent ? acq.monthlyRent / 1.21 : 0);
                              const ivaRent = acq.monthlyRent
                                ? acq.monthlyRent - baseRent
                                : baseRent * 0.21;
                              const deposit = acq.depositPaid || baseRent * 2;
                              const isNave =
                                acq.propertyType === "nave_industrial" ||
                                acq.propertyType === "almacen" ||
                                acq.propertyType === "almacén" ||
                                acq.propertyType === "almacen_logistico" ||
                                acq.type === "nave_industrial" ||
                                acq.type === "almacen" ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("nave") ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("almacén") ||
                                acq.propertyTitle
                                  ?.toLowerCase()
                                  .includes("almacen");

                              return (
                                <tr
                                  key={acq.id}
                                  className="hover:bg-slate-50/80 transition"
                                >
                                  <td className="p-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                                        <Building2 className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="font-bold text-slate-900 block">
                                          {acq.propertyTitle}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          Arrendado desde{" "}
                                          {new Date(
                                            acq.purchaseDate,
                                          ).toLocaleDateString("es-ES")}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3.5 text-slate-600">
                                    {acq.location}
                                  </td>
                                  <td className="p-3.5 font-bold">
                                    {acq.surfaceM2} m²
                                  </td>
                                  <td className="p-3.5 font-bold text-slate-900">
                                    {formatNumber(baseRent)} €/mes
                                  </td>
                                  <td className="p-3.5 text-slate-600">
                                    {formatNumber(ivaRent)} €/mes
                                  </td>
                                  <td className="p-3.5 font-bold text-amber-900">
                                    {formatNumber(deposit)} €
                                  </td>
                                  <td className="p-3.5">
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                      Domiciliación bancaria
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-right space-x-2">
                                    {isNave && (
                                      <button
                                        onClick={() =>
                                          setSelectedNaveForFloorPlan(acq)
                                        }
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                        title="Ver y distribuir la superficie entre almacén y oficinas"
                                      >
                                        <LayoutGrid className="w-3.5 h-3.5 text-blue-200" />
                                        <span>Plano de Distribución</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        setSelectedPropertyForPayments(acq)
                                      }
                                      className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                      title="Ver historial y desglose de pagos realizados y pendientes por fechas, vencimiento y estado"
                                    >
                                      <CreditCard className="w-3.5 h-3.5 text-indigo-300" />
                                      <span>Detalle de pagos</span>
                                    </button>
                                    <button
                                      onClick={() =>
                                        setActiveDocumentModal({
                                          type: "property_invoice",
                                          acquisition: acq,
                                        })
                                      }
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

            {/* TAB 7: ENERGIA / LUZ */}
            {activeTab === "energia" && (
              <div className="space-y-6">
                <ElectricitySupplyCard
                  acquisitions={data.acquisitions}
                  machinery={data.machineryAcquisitions || []}
                  employees={data.hiredEmployees || []}
                  floorPlans={naveFloorPlans}
                  contracts={electricityContracts}
                  currentContract={electricityContract}
                  onContractSupply={handleContractElectricity}
                />

                <ElectricityAssetTab
                  acquisitions={data.acquisitions}
                  machinery={data.machineryAcquisitions || []}
                  contract={electricityContract}
                  contracts={electricityContracts}
                  bills={electricityBills}
                  studentName={currentUser.name}
                  onOpenContractCard={() => {}}
                />
              </div>
            )}

            {/* TAB 3: MACHINERY */}
            {activeTab === "machinery" && (
              <div className="space-y-4">
                {!data.machineryAcquisitions ||
                data.machineryAcquisitions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no dispone de maquinaria industrial. Puedes
                    adquirir líneas de producción desde la sección de
                    Maquinaria.
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
                            <th className="p-3.5">
                              <div className="flex items-center gap-1.5">
                                <span>Estado maquinaria</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowMachineryInfoModal(true)
                                  }
                                  className="p-1 hover:bg-slate-200 rounded-full text-slate-500 hover:text-amber-700 transition cursor-pointer"
                                  title="Ver definición de estados de la maquinaria"
                                >
                                  <Info className="w-3.5 h-3.5 text-amber-600" />
                                </button>
                              </div>
                            </th>
                            <th className="p-3.5">Modalidad de pago</th>
                            <th className="p-3.5 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.machineryAcquisitions.map((mac) => {
                            const isPendingEnergy =
                              mac.status === "pendiente_energia";
                            const isAssembly = mac.status === "montaje";
                            const baseVal =
                              mac.basePrice || mac.totalPrice / 1.21;
                            const ivaVal =
                              mac.ivaAmount || mac.totalPrice - baseVal;

                            return (
                              <tr
                                key={mac.id}
                                className="hover:bg-slate-50/80 transition"
                              >
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                                      <Wrench className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">
                                        {mac.title}
                                      </span>
                                      <span className="text-[10px] text-amber-800 font-semibold">
                                        {mac.optionTitle}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  {mac.installationNaveTitle} (
                                  {mac.installationSurfaceM2} m²)
                                </td>
                                <td className="p-3.5 font-bold font-mono text-amber-900">
                                  {mac.productionCapacityUnitsPerHour} unid /
                                  hora
                                </td>
                                <td className="p-3.5 font-bold text-slate-900">
                                  {formatNumber(baseVal)} €
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  {formatNumber(ivaVal)} €
                                </td>
                                <td className="p-3.5">
                                  {(() => {
                                    if (isPendingEnergy) {
                                      return (
                                        <div className="flex flex-col gap-1 items-start">
                                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-rose-600" />
                                            Montaje pausado (Falta Luz)
                                          </span>
                                          <button
                                            onClick={() =>
                                              setActiveTab("energia")
                                            }
                                            className="text-[10px] text-amber-700 font-bold hover:underline cursor-pointer"
                                          >
                                            Contratar Luz (
                                            {mac.requiredPowerKW || 35} kW)
                                          </button>
                                        </div>
                                      );
                                    }

                                    if (isAssembly) {
                                      return (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                          En montaje (8 horas)
                                        </span>
                                      );
                                    }

                                    // Mounted! Calculate operational requirements & producing shifts
                                    const assignedOperators = (
                                      data.hiredEmployees || []
                                    ).filter(
                                      (e) => e.assignedMachineryId
                                        ? (String(e.assignedMachineryId) === String(mac.id) || String(e.assignedMachineryId) === String(mac.machineryId))
                                        : Boolean(e.assignedMachineryTitle && (e.assignedMachineryTitle === mac.title || e.assignedMachineryTitle === mac.lineTitle))
                                    );
                                    const mOp = assignedOperators.filter(
                                      (e) => (Number(e.shift) || 1) === 1,
                                    ).length;
                                    const aOp = assignedOperators.filter(
                                      (e) => Number(e.shift) === 2,
                                    ).length;
                                    const nOp = assignedOperators.filter(
                                      (e) => Number(e.shift) === 3,
                                    ).length;

                                    const totalRawKg =
                                      (inventoryData?.rawMaterials
                                        ?.fragmentos_hierro_kg || 0) +
                                      (inventoryData?.rawMaterials
                                        ?.fragmentos_metal_kg || 0) +
                                      (inventoryData?.rawMaterials
                                        ?.pellets_plastico_kg || 0) +
                                      (inventoryData?.rawMaterials
                                        ?.pegamento_epoxi_kg || 0);
                                    const hasRawMaterials = totalRawKg > 0;

                                    const ownedForklifts = (
                                      data.purchasedVehicles || []
                                    ).filter(
                                      (v) =>
                                        v.vehicleType ===
                                        "carretilla_elevadora",
                                    ).length;
                                    const hasForklifts = ownedForklifts >= 1;

                                    const hasElectricity =
                                      (electricityContracts &&
                                        electricityContracts.some(
                                          (e) => e.status === "active",
                                        )) ||
                                      Boolean(electricityContract);

                                    const shift1Producing =
                                      mOp >= 2 &&
                                      hasForklifts &&
                                      hasRawMaterials &&
                                      hasElectricity;
                                    const shift2Producing =
                                      aOp >= 2 &&
                                      hasForklifts &&
                                      hasRawMaterials &&
                                      hasElectricity;
                                    const shift3Producing =
                                      nOp >= 2 &&
                                      hasForklifts &&
                                      hasRawMaterials &&
                                      hasElectricity;

                                    const producingShifts: {
                                      shiftNum: number;
                                      name: string;
                                    }[] = [];
                                    if (shift1Producing)
                                      producingShifts.push({
                                        shiftNum: 1,
                                        name: "Turno 1 (Mañana)",
                                      });
                                    if (shift2Producing)
                                      producingShifts.push({
                                        shiftNum: 2,
                                        name: "Turno 2 (Tarde)",
                                      });
                                    if (shift3Producing)
                                      producingShifts.push({
                                        shiftNum: 3,
                                        name: "Turno 3 (Noche)",
                                      });

                                    if (producingShifts.length > 0) {
                                      return (
                                        <div className="flex flex-col gap-1 items-start">
                                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                            Operativa - Encendida
                                          </span>
                                          <div className="text-[10px] text-slate-700 space-y-0.5 mt-0.5">
                                            <p className="font-bold text-emerald-800">
                                              Produciendo (Lunes a Viernes):
                                            </p>
                                            {producingShifts.map((ps) => (
                                              <p
                                                key={ps.shiftNum}
                                                className="flex items-center gap-1 text-slate-700 font-semibold"
                                              >
                                                <span className="text-emerald-600 font-bold">
                                                  •
                                                </span>{" "}
                                                {ps.name}
                                              </p>
                                            ))}
                                            <p className="text-[9px] text-slate-500 font-medium italic pt-0.5">
                                              Parada técnica obligatoria los fines de semana (Sáb-Dom).
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    }

                                    const missingReasons: string[] = [];
                                    if (!hasElectricity) {
                                      missingReasons.push(
                                        "Falta contrato de luz activo",
                                      );
                                    }
                                    if (!hasForklifts) {
                                      missingReasons.push(
                                        "Falta carretilla elevadora (mín. 1 en la nave)",
                                      );
                                    }
                                    if (!hasRawMaterials) {
                                      missingReasons.push(
                                        "Falta materia prima almacenada",
                                      );
                                    }
                                    if (mOp < 2 && aOp < 2 && nOp < 2) {
                                      missingReasons.push(
                                        "Faltan operarios (mín. 2 por turno)",
                                      );
                                    } else {
                                      if (mOp > 0 && mOp < 2)
                                        missingReasons.push(
                                          `Turno 1: ${mOp}/2 operarios`,
                                        );
                                      if (aOp > 0 && aOp < 2)
                                        missingReasons.push(
                                          `Turno 2: ${aOp}/2 operarios`,
                                        );
                                      if (nOp > 0 && nOp < 2)
                                        missingReasons.push(
                                          `Turno 3: ${nOp}/2 operarios`,
                                        );
                                    }

                                    return (
                                      <div className="flex flex-col gap-1 items-start">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-200 text-slate-800 border border-slate-300 inline-flex items-center gap-1">
                                          Operativa - Apagada
                                        </span>
                                        <div className="text-[10px] text-slate-500 space-y-0.5 mt-0.5">
                                          {missingReasons.map((reason, idx) => (
                                            <p
                                              key={idx}
                                              className="flex items-center gap-1 text-rose-700 font-medium"
                                            >
                                              <span>•</span> {reason}
                                            </p>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="p-3.5">
                                  <span
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                      mac.paymentMethod === "contado"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {mac.paymentMethod === "contado"
                                      ? "Al contado"
                                      : "Pago aplazado"}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => {
                                      setRelocateModalMachinery(mac);
                                      setTargetRelocateNaveId("");
                                      setRelocateError(null);
                                      setRelocateSuccess(null);
                                    }}
                                    disabled={Boolean(
                                      mac.relocationStatus &&
                                      mac.relocationStatus !== "completed",
                                    )}
                                    className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Cambiar o trasladar esta máquina a otra nave industrial"
                                  >
                                    <Truck className="w-3.5 h-3.5 text-indigo-300" />
                                    <span>Cambiar / Trasladar de Nave</span>
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSelectedPropertyForPayments(mac as any)
                                    }
                                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver detalle de pagos a realizar por fechas, vencimiento y estado"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Detalle de pagos</span>
                                  </button>
                                  <button
                                    onClick={() =>
                                      setActiveDocumentModal({
                                        type: "machinery_invoice",
                                        machineryAcquisition: mac,
                                      })
                                    }
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver factura oficial de la compra anterior de la maquinaria"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Factura Compra</span>
                                  </button>
                                  {(mac.relocationInvoices?.length > 0 ||
                                    mac.relocationInvoice) && (
                                    <button
                                      onClick={() =>
                                        setActiveDocumentModal({
                                          type: "machinery_relocation_invoice",
                                          machineryAcquisition: mac,
                                          relocationInvoice:
                                            mac.relocationInvoices?.[0] ||
                                            mac.relocationInvoice,
                                        })
                                      }
                                      className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                      title="Ver y descargar factura oficial del servicio de traslado, transporte y montaje"
                                    >
                                      <Truck className="w-3.5 h-3.5 text-indigo-300" />
                                      <span>Factura Traslado</span>
                                    </button>
                                  )}
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

            {/* TAB INVENTORY: ALMACÉN Y ESTADO DE PRODUCCIÓN / MERCADERÍAS */}
            {activeTab === "inventory" &&
              (() => {
                const studentLevel = currentUser.level || 1;
                const isLevel1 = studentLevel === 1;

                // Calculate delivered orders purchased by student in Mercado
                const deliveredBoughtOrders = userOrders.filter(
                  (o) =>
                    o.studentId === currentUser.id &&
                    ["entregado", "finalizado", "facturado"].includes(o.status),
                );

                // Calculate Destornilladores con Punta Estrella and Destornilladores con Punta Plana
                let destornilladoresEstrella = 0;
                let destornilladoresPlana = 0;

                if (inventoryData?.producedGoods) {
                  destornilladoresEstrella =
                    inventoryData.producedGoods.destornilladores_punta_estrella ??
                    inventoryData.producedGoods.destornilladores_hierro ??
                    0;
                  destornilladoresPlana =
                    inventoryData.producedGoods.destornilladores_punta_plana ??
                    inventoryData.producedGoods.destornilladores_metal ??
                    0;
                  if (
                    inventoryData.producedGoods.producedScrewdriversUnits &&
                    destornilladoresEstrella === 0 &&
                    destornilladoresPlana === 0
                  ) {
                    destornilladoresEstrella =
                      inventoryData.producedGoods.producedScrewdriversUnits;
                  }
                } else {
                  deliveredBoughtOrders.forEach((ord) => {
                    if (ord.items && ord.items.length > 0) {
                      ord.items.forEach((it) => {
                        const titleLower = (
                          it.materialTitle || ""
                        ).toLowerCase();
                        if (
                          titleLower.includes("plana") ||
                          titleLower.includes("metal") ||
                          it.materialType === "metal"
                        ) {
                          destornilladoresPlana += it.quantity || 0;
                        } else {
                          destornilladoresEstrella += it.quantity || 0;
                        }
                      });
                    } else {
                      const titleLower = (
                        ord.materialTitle || ""
                      ).toLowerCase();
                      if (
                        titleLower.includes("plana") ||
                        titleLower.includes("metal") ||
                        ord.materialType === "metal"
                      ) {
                        destornilladoresPlana += ord.quantity || 0;
                      } else {
                        destornilladoresEstrella += ord.quantity || 0;
                      }
                    }
                  });
                }

                const destornilladoresHierro = destornilladoresEstrella;
                const destornilladoresMetal = destornilladoresPlana;

                const warehouseProperties = (data?.acquisitions || []).filter((a) => {
                  const pType = (a.propertyType || a.type || "").toLowerCase();
                  const title = (a.propertyTitle || a.title || "").toLowerCase();
                  return (
                    ["nave_industrial", "almacen", "almacen_logistico", "industrial", "warehouse"].includes(pType) ||
                    title.includes("nave") ||
                    title.includes("almacen") ||
                    title.includes("almacén")
                  );
                });

                return (
                  <div className="space-y-6">
                    {/* Top Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md">
                      <div>
                        <h3 className="text-lg font-bold font-display flex items-center gap-2">
                          <Boxes className="w-5 h-5 text-emerald-400" />
                          <span>
                            {isLevel1
                              ? "Almacenes de Materia Prima y Productos Terminados"
                              : "Almacén de Mercaderías y Gestión de Stock"}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-300 mt-1">
                          {isLevel1
                            ? "El inventario de materias primas se consume y los productos terminados se fabrican automáticamente por hora de simulación en función de los turnos de la maquinaria operativa."
                            : "Consulta tu stock de mercaderías adquiridas en el Mercado y el historial de recepciones de mercancía."}
                        </p>
                      </div>
                      <button
                        onClick={() => fetchInventoryData()}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer self-start sm:self-auto"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Actualizar Stock</span>
                      </button>
                    </div>

                    {/* Section 1: Materia Prima Almacenada (SOLO NIVEL 1) */}
                    {isLevel1 && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Package className="w-4 h-4 text-amber-600" />
                          <span>
                            Materia Prima en Almacén (Inputs de Fabricación)
                          </span>
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-slate-500">
                              Fragmentos de Hierro
                            </p>
                            <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                              {formatNumber(
                                inventoryData?.rawMaterials
                                  ?.fragmentos_hierro_kg ??
                                  inventoryData?.inventory?.ironKg ??
                                  0,
                                2
                              )}{" "}
                              <span className="text-xs text-slate-500">kg</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Pallets de 1.000 kg
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-slate-500">
                              Pellets de Plástico
                            </p>
                            <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                              {formatNumber(
                                inventoryData?.rawMaterials
                                  ?.pellets_plastico_kg ??
                                  inventoryData?.inventory?.plasticKg ??
                                  0,
                                2
                              )}{" "}
                              <span className="text-xs text-slate-500">kg</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Sacos de 25 kg (40/palet)
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-slate-500">
                              Pegamento Epoxi
                            </p>
                            <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                              {formatNumber(
                                inventoryData?.rawMaterials
                                  ?.pegamento_epoxi_kg ??
                                  inventoryData?.inventory?.epoxiKg ??
                                  0,
                                2
                              )}{" "}
                              <span className="text-xs text-slate-500">kg</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Latas de 5 kg
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 2: Productos Fabricados / Mercaderías */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Factory className="w-4 h-4 text-emerald-600" />
                          <span>
                            {isLevel1 ? "Productos fabricados" : "Mercaderías"}
                          </span>
                        </h4>

                        <button
                          onClick={handleOpenTransferModal}
                          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow transition-all self-start sm:self-auto"
                        >
                          <Truck className="w-4 h-4" />
                          <span>Enviar Existencias a otro Alumno</span>
                        </button>
                      </div>

                      {isLevel1 ? (
                        (() => {
                          const currentRodMode =
                            inventoryData?.producedGoods?.rodProductionMode ??
                            inventoryData?.inventory?.rodProductionMode ??
                            null;
                          const isProducingEstrella = currentRodMode === "estrella";
                          const isProducingPlana = currentRodMode === "plana";

                          const starRods =
                            inventoryData?.producedGoods?.varillas_punta_estrella ??
                            inventoryData?.producedGoods?.varillas_hierro_punta ??
                            inventoryData?.inventory?.producedStarRodsUnits ??
                            inventoryData?.inventory?.producedIronRodsUnits ??
                            0;

                          const flatRods =
                            inventoryData?.producedGoods?.varillas_punta_plana ??
                            inventoryData?.producedGoods?.varillas_metal_punta ??
                            inventoryData?.inventory?.producedFlatRodsUnits ??
                            inventoryData?.inventory?.producedMetalRodsUnits ??
                            0;

                          const line1OpCount = (data?.machineryAcquisitions || []).filter(
                            (m) => m.category === "metal_hierro" && m.status === "operativa" && (!m.relocationStatus || m.relocationStatus === "completed")
                          ).length || 1;

                          const line2OpCount = (data?.machineryAcquisitions || []).filter(
                            (m) => (m.category === "plastico_montaje" || m.category === "plastico_ensamblaje") && m.status === "operativa" && (!m.relocationStatus || m.relocationStatus === "completed")
                          ).length || 1;

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* Varillas con Punta Estrella */}
                              <div className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${
                                isProducingEstrella
                                  ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/40"
                                  : "bg-slate-50/60 border-slate-200"
                              }`}>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-amber-950 uppercase">
                                      Varillas con Punta Estrella
                                    </p>
                                    {isProducingEstrella && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300 uppercase animate-pulse">
                                        Activo
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-2xl font-black font-mono text-amber-700 mt-1">
                                    {formatNumber(starRods, 0)}{" "}
                                    <span className="text-xs font-normal text-amber-800">
                                      unidades
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-600 mt-2">
                                    • Producción: 100 u/hora por máquina en Línea 1
                                    {line1OpCount > 1 ? ` (Capacidad Total: ${line1OpCount * 100} u/h con ${line1OpCount} máquinas).` : "."}
                                    <br />• Consumo: 49,5g de fragmentos de hierro por varilla.
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleSetRodProductionMode("estrella")}
                                  disabled={isUpdatingRodMode}
                                  className={`mt-4 w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                                    isProducingEstrella
                                      ? "bg-amber-600 hover:bg-amber-700 text-white border border-amber-700 shadow-md ring-2 ring-amber-400/50"
                                      : "bg-white hover:bg-amber-100/70 text-slate-700 border border-slate-300"
                                  }`}
                                >
                                  {isProducingEstrella ? (
                                    <>
                                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                      <span>Produciendo</span>
                                    </>
                                  ) : (
                                    <span>Producir</span>
                                  )}
                                </button>
                              </div>

                              {/* Varillas con Punta Plana */}
                              <div className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${
                                isProducingPlana
                                  ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/40"
                                  : "bg-slate-50/60 border-slate-200"
                              }`}>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-emerald-950 uppercase">
                                      Varillas con Punta Plana
                                    </p>
                                    {isProducingPlana && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900 border border-emerald-300 uppercase animate-pulse">
                                        Activo
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-2xl font-black font-mono text-emerald-700 mt-1">
                                    {formatNumber(flatRods, 0)}{" "}
                                    <span className="text-xs font-normal text-emerald-800">
                                      unidades
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-600 mt-2">
                                    • Producción: 100 u/hora por máquina en Línea 1
                                    {line1OpCount > 1 ? ` (Capacidad Total: ${line1OpCount * 100} u/h con ${line1OpCount} máquinas).` : "."}
                                    <br />• Consumo: 49,5g de fragmentos de hierro por varilla.
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleSetRodProductionMode("plana")}
                                  disabled={isUpdatingRodMode}
                                  className={`mt-4 w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                                    isProducingPlana
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-md ring-2 ring-emerald-400/50"
                                      : "bg-white hover:bg-emerald-100/70 text-slate-700 border border-slate-300"
                                  }`}
                                >
                                  {isProducingPlana ? (
                                    <>
                                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                      <span>Produciendo</span>
                                    </>
                                  ) : (
                                    <span>Producir</span>
                                  )}
                                </button>
                              </div>

                              {/* Destornilladores con Punta Estrella */}
                              <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 flex flex-col justify-between">
                                <div>
                                  <p className="text-xs font-bold text-indigo-900 uppercase">
                                    Destornilladores con Punta Estrella
                                  </p>
                                  <p className="text-2xl font-black font-mono text-indigo-700 mt-1">
                                    {formatNumber(destornilladoresEstrella, 0)}{" "}
                                    <span className="text-xs font-normal text-indigo-800">
                                      unidades
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-600 mt-2">
                                    • Producción: 120 u/hora por máquina en Línea 2
                                    {line2OpCount > 1 ? ` (Capacidad Total: ${line2OpCount * 120} u/h con ${line2OpCount} máquinas).` : "."}
                                    <br />• Consumo: 1 varilla punta estrella + 27,5g plástico + 0,5g epoxi.
                                  </p>
                                </div>
                              </div>

                              {/* Destornilladores con Punta Plana */}
                              <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex flex-col justify-between">
                                <div>
                                  <p className="text-xs font-bold text-blue-900 uppercase">
                                    Destornilladores con Punta Plana
                                  </p>
                                  <p className="text-2xl font-black font-mono text-blue-700 mt-1">
                                    {formatNumber(destornilladoresPlana, 0)}{" "}
                                    <span className="text-xs font-normal text-blue-800">
                                      unidades
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-600 mt-2">
                                    • Producción: 120 u/hora por máquina en Línea 2
                                    {line2OpCount > 1 ? ` (Capacidad Total: ${line2OpCount * 120} u/h con ${line2OpCount} máquinas).` : "."}
                                    <br />• Consumo: 1 varilla punta plana + 27,5g plástico + 0,5g epoxi.
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        /* NIVEL 2 Y 3: MERCADERÍAS */
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                                  Destornilladores con Punta Estrella
                                </p>
                                <p className="text-3xl font-black font-mono text-emerald-700 mt-2">
                                  {formatNumber(destornilladoresEstrella, 0)}{" "}
                                  <span className="text-sm font-semibold text-emerald-800">
                                    unidades
                                  </span>
                                </p>
                              </div>
                              <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                                Mercadería Comercial
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-3 border-t border-emerald-200/60 pt-2">
                              Adquiridos en el Mercado y recibidos en almacén
                              para comercialización.
                            </p>
                          </div>

                          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                                  Destornilladores con Punta Plana
                                </p>
                                <p className="text-3xl font-black font-mono text-blue-700 mt-2">
                                  {formatNumber(destornilladoresPlana, 0)}{" "}
                                  <span className="text-sm font-semibold text-blue-800">
                                    unidades
                                  </span>
                                </p>
                              </div>
                              <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 border border-blue-300 uppercase">
                                Mercadería Comercial
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-3 border-t border-blue-200/60 pt-2">
                              Adquiridos en el Mercado y recibidos en almacén
                              para comercialización.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Section 3: Desglose Específico de Existencias por Inmueble con Almacén */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <span>Desglose de Existencias por Inmueble con Almacén</span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">
                            Detalle del inventario almacenado de forma independiente en cada una de tus naves industriales y almacenes con control de ocupación volumétrica y paletización.
                          </p>
                        </div>

                        {warehouseProperties.length > 1 && (
                          <button
                            onClick={() => handleOpenTransferModal(undefined, "nave")}
                            className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl transition-all self-start sm:self-auto cursor-pointer"
                          >
                            <Truck className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Trasladar Entre Almacenes</span>
                          </button>
                        )}
                      </div>

                      {/* Standards & Palletization Ratio Banner */}
                      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl border border-indigo-800/60 shadow-sm space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold">
                              <Layers className="w-4 h-4 text-indigo-400" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                              Estándares de Almacenamiento, Paletización y Capacidad
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/60 px-2.5 py-0.5 rounded-full border border-indigo-700/50">
                            Regla: 25 Palets / 30 m²
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">📐 Capacidad por Superficie</span>
                            <span className="font-bold text-emerald-400 text-[13px]">25 palets / 30 m²</span>
                            <span className="text-[10px] text-slate-300 block mt-0.5">0,833 palets por cada m² de zona de almacén.</span>
                          </div>
                          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">⚖️ Fragmentos de Hierro / Metal</span>
                            <span className="font-bold text-amber-400 text-[13px]">1.000 kg / palet</span>
                            <span className="text-[10px] text-slate-300 block mt-0.5">1 palet europeo de fragmentos = 1.000 kg.</span>
                          </div>
                          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">📦 Pellets de Plástico</span>
                            <span className="font-bold text-blue-400 text-[13px]">1.000 kg / palet</span>
                            <span className="text-[10px] text-slate-300 block mt-0.5">40 sacos de 25 kg = 1.000 kg por palet.</span>
                          </div>
                          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">🔩 Destornilladores / Varillas</span>
                            <span className="font-bold text-indigo-400 text-[13px]">10.000 u. / palet</span>
                            <span className="text-[10px] text-slate-300 block mt-0.5">Capacidad de 10.000 unidades por palet.</span>
                          </div>
                        </div>
                      </div>

                      {warehouseProperties.length === 0 ? (
                        /* No user warehouse property registered yet - Show default warehouse card */
                        (() => {
                          const defaultInv = inventoryData?.inventory?.naveInventories?.['default_nave'] || inventoryData?.inventory;
                          const dIron = defaultInv?.ironKg || 0;
                          const dPlastic = defaultInv?.plasticKg || 0;
                          const dEpoxi = defaultInv?.epoxiKg || 0;
                          const dStarRods = defaultInv?.producedStarRodsUnits ?? defaultInv?.producedIronRodsUnits ?? 0;
                          const dFlatRods = defaultInv?.producedFlatRodsUnits ?? defaultInv?.producedMetalRodsUnits ?? 0;
                          const dStarScrewdrivers = defaultInv?.starScrewdriversUnits ?? defaultInv?.ironScrewdriversUnits ?? 0;
                          const dFlatScrewdrivers = defaultInv?.flatScrewdriversUnits ?? defaultInv?.metalScrewdriversUnits ?? 0;

                          const dTotalWeight = dIron + dPlastic + dEpoxi;
                          const dTotalUnits = (isLevel1 ? dStarRods + dFlatRods : 0) + dStarScrewdrivers + dFlatScrewdrivers;

                          const storageM2 = 65;
                          const maxPallets = Math.max(1, Math.floor((storageM2 / 30) * 25));

                          const ironPallets = dIron / 1000;
                          const plasticPallets = dPlastic / 1000;
                          const epoxiPallets = dEpoxi / 1000;
                          const rawMaterialsPallets = ironPallets + plasticPallets + epoxiPallets;

                          const rodsPallets = (isLevel1 ? dStarRods + dFlatRods : 0) / 10000;
                          const screwdriversPallets = (dStarScrewdrivers + dFlatScrewdrivers) / 10000;
                          const finishedGoodsPallets = rodsPallets + screwdriversPallets;

                          const totalOccupiedPallets = rawMaterialsPallets + finishedGoodsPallets;
                          const occupiedPercentage = maxPallets > 0 ? (totalOccupiedPallets / maxPallets) * 100 : 0;
                          const clampedOccupiedPercentage = Math.min(100, Math.max(0, occupiedPercentage));
                          const freePercentage = Math.max(0, 100 - occupiedPercentage);
                          const freePallets = Math.max(0, maxPallets - totalOccupiedPallets);
                          const clampedFreePercentage = Math.max(0, 100 - clampedOccupiedPercentage);

                          return (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold shrink-0">
                                    <Boxes className="w-5 h-5 text-slate-600" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h5 className="font-bold text-slate-900 text-sm">
                                        Almacén Principal por Defecto
                                      </h5>
                                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 uppercase">
                                        Asignación Central
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      Ubicación central asignada para el estocaje de la empresa.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Capacity and Occupancy Bar */}
                              <div className="bg-white border border-slate-200/90 rounded-xl p-4 space-y-3 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Capacidad y Ocupación del Almacén</span>
                                      </span>
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                        Superficie: {storageM2} m²
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      Proporción: <strong>25 palets / 30 m²</strong> ({maxPallets} palets máx. en {storageM2} m²).
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold font-mono flex items-center gap-1.5 ${
                                      occupiedPercentage > 100
                                        ? "bg-rose-50 border-rose-200 text-rose-700"
                                        : occupiedPercentage > 85
                                        ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    }`}>
                                      <span className={`w-2 h-2 rounded-full ${
                                        occupiedPercentage > 100
                                          ? "bg-rose-500 animate-pulse"
                                          : occupiedPercentage > 85
                                          ? "bg-amber-500"
                                          : "bg-indigo-500"
                                      }`} />
                                      <span>Ocupado: {occupiedPercentage.toFixed(1)}%</span>
                                      <span className="text-[10px] text-slate-500 font-normal">({totalOccupiedPallets.toFixed(2)} pal.)</span>
                                    </div>

                                    <div className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold font-mono flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                      <span>Libre: {freePercentage.toFixed(1)}%</span>
                                      <span className="text-[10px] text-emerald-600 font-normal">({freePallets.toFixed(2)} pal.)</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="space-y-1.5">
                                  <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200 shadow-inner">
                                    <div
                                      style={{ width: `${clampedOccupiedPercentage}%` }}
                                      className={`h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white ${
                                        occupiedPercentage > 100
                                          ? "bg-gradient-to-r from-rose-500 to-rose-600"
                                          : occupiedPercentage > 85
                                          ? "bg-gradient-to-r from-amber-500 to-amber-600"
                                          : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                                      }`}
                                      title={`Ocupado: ${occupiedPercentage.toFixed(1)}% (${totalOccupiedPallets.toFixed(2)} palets)`}
                                    >
                                      {clampedOccupiedPercentage >= 15 && (
                                        <span className="px-1 truncate">{occupiedPercentage.toFixed(1)}% Ocupado</span>
                                      )}
                                    </div>

                                    <div
                                      style={{ width: `${clampedFreePercentage}%` }}
                                      className="h-full bg-emerald-500/80 transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white"
                                      title={`Libre: ${freePercentage.toFixed(1)}% (${freePallets.toFixed(2)} palets)`}
                                    >
                                      {clampedFreePercentage >= 15 && (
                                        <span className="px-1 truncate">{freePercentage.toFixed(1)}% Libre</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                                    <span>0 palets (0%)</span>
                                    <span className="font-bold text-slate-700">
                                      Total Ocupado: {totalOccupiedPallets.toFixed(2)} / {maxPallets} palets
                                    </span>
                                    <span>Capacidad Máx: {maxPallets} palets (100%)</span>
                                  </div>
                                </div>

                                {occupiedPercentage > 100 && (
                                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                    <span>
                                      ⚠️ <strong>Exceso de Capacidad:</strong> Superas la capacidad máxima por +{(totalOccupiedPallets - maxPallets).toFixed(2)} palets (+{((occupiedPercentage - 100)).toFixed(1)}%).
                                    </span>
                                  </div>
                                )}

                                {/* Pallet Conversion Breakdown */}
                                <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                    <span className="text-slate-500 block text-[10px]">⚖️ Fragmentos Hierro (1.000 kg/palet)</span>
                                    <span className="font-bold font-mono text-slate-800">
                                      {formatNumber(dIron, 1)} kg → {ironPallets.toFixed(2)} palets
                                    </span>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                    <span className="text-slate-500 block text-[10px]">📦 Pellets Plástico (1.000 kg / 40 sacos)</span>
                                    <span className="font-bold font-mono text-slate-800">
                                      {formatNumber(dPlastic, 1)} kg → {plasticPallets.toFixed(2)} palets
                                    </span>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                    <span className="text-slate-500 block text-[10px]">🧪 Pegamento Epoxi (1.000 kg/palet)</span>
                                    <span className="font-bold font-mono text-slate-800">
                                      {formatNumber(dEpoxi, 1)} kg → {epoxiPallets.toFixed(2)} palets
                                    </span>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                    <span className="text-slate-500 block text-[10px]">🔩 Destornilladores / Varillas (10.000 u./palet)</span>
                                    <span className="font-bold font-mono text-slate-800">
                                      {formatNumber(dTotalUnits, 0)} u. → {finishedGoodsPallets.toFixed(2)} palets
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {/* Inputs / Raw Materials */}
                                {isLevel1 && (
                                  <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                                    <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px] flex items-center gap-1">
                                      <Package className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Materias Primas Almacenadas</span>
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 pt-1 text-slate-800 font-mono text-xs">
                                      <div>
                                        <span className="text-[10px] font-sans text-slate-400 block">Hierro</span>
                                        <span className="font-bold">{formatNumber(dIron, 1)} kg</span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] font-sans text-slate-400 block">Plástico</span>
                                        <span className="font-bold">{formatNumber(dPlastic, 1)} kg</span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] font-sans text-slate-400 block">Epoxi</span>
                                        <span className="font-bold">{formatNumber(dEpoxi, 1)} kg</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Finished Goods */}
                                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                                  <p className="font-bold text-slate-700 uppercase tracking-wide text-[10px] flex items-center gap-1">
                                    <Factory className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{isLevel1 ? "Productos Fabricados" : "Mercaderías"}</span>
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 pt-1 text-slate-800 font-mono text-xs">
                                    {isLevel1 && (
                                      <>
                                        <div>
                                          <span className="text-[10px] font-sans text-slate-400 block">Varillas Estrella</span>
                                          <span className="font-bold text-amber-700">{formatNumber(dStarRods, 0)} u.</span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] font-sans text-slate-400 block">Varillas Plana</span>
                                          <span className="font-bold text-emerald-700">{formatNumber(dFlatRods, 0)} u.</span>
                                        </div>
                                      </>
                                    )}
                                    <div>
                                      <span className="text-[10px] font-sans text-slate-400 block">Destornilladores Estrella</span>
                                      <span className="font-bold text-indigo-700">{formatNumber(dStarScrewdrivers, 0)} u.</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-sans text-slate-400 block">Destornilladores Plana</span>
                                      <span className="font-bold text-blue-700">{formatNumber(dFlatScrewdrivers, 0)} u.</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <span>
                                  <strong>Aviso Inmobiliario:</strong> Para disponer de existencias separadas e independientes por edificio, adquiere o alquila naves industriales o almacenes logísticos desde el Portal Inmobiliario.
                                </span>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        /* User has 1 or more registered warehouse properties */
                        <div className="space-y-4">
                          {warehouseProperties.map((acq) => {
                            const naveInv = inventoryData?.inventory?.naveInventories?.[acq.id] || null;
                            const iron = naveInv?.ironKg || 0;
                            const plastic = naveInv?.plasticKg || 0;
                            const epoxi = naveInv?.epoxiKg || 0;
                            const starRods = naveInv?.producedStarRodsUnits ?? naveInv?.producedIronRodsUnits ?? 0;
                            const flatRods = naveInv?.producedFlatRodsUnits ?? naveInv?.producedMetalRodsUnits ?? 0;
                            const starScrewdrivers = naveInv?.starScrewdriversUnits ?? naveInv?.ironScrewdriversUnits ?? 0;
                            const flatScrewdrivers = naveInv?.flatScrewdriversUnits ?? naveInv?.metalScrewdriversUnits ?? 0;

                            const totalWeight = iron + plastic + epoxi;
                            const totalUnits = (isLevel1 ? starRods + flatRods : 0) + starScrewdrivers + flatScrewdrivers;

                            const propTitle = acq.propertyTitle || acq.title || "Inmueble Almacén";
                            const isOwned = acq.operation === "compra";
                            const pType = (acq.propertyType || acq.type || "").toLowerCase();
                            const isLogisticsWarehouse = pType.includes("almacen") || pType.includes("almacén");
                            const typeLabel = isLogisticsWarehouse ? "Almacén Logístico" : "Nave Industrial";
                            const locationStr = acq.location || acq.municipality || "Polígono Industrial";

                            // Determine storage surface M2
                            let storageM2 = 0;
                            if (isLogisticsWarehouse) {
                              storageM2 = Number(acq.surfaceM2 || acq.m2 || 300);
                            } else {
                              const matchedPlan = (naveFloorPlans || []).find(
                                (p) =>
                                  String(p.acquisitionId) === String(acq.id) ||
                                  String(p.propertyId) === String(acq.id) ||
                                  String(p.propertyId) === String(acq.propertyId) ||
                                  (p.propertyTitle && acq.propertyTitle && p.propertyTitle.trim().toLowerCase() === acq.propertyTitle.trim().toLowerCase())
                              );
                              if (matchedPlan) {
                                const raw = Number(matchedPlan.rawMaterialsStorageM2);
                                const fin = Number(matchedPlan.finishedGoodsStorageM2);
                                const semi = Number(matchedPlan.semiFinishedStorageM2);
                                const totalPlanStorage = (isNaN(raw) ? 0 : raw) + (isNaN(fin) ? 0 : fin) + (isNaN(semi) ? 0 : semi);
                                storageM2 = totalPlanStorage > 0 ? totalPlanStorage : (Number(matchedPlan.storageZoneM2) || 65);
                              } else {
                                storageM2 = 65;
                              }
                            }
                            if (!storageM2 || storageM2 <= 0) {
                              storageM2 = 65;
                            }

                            // Pallet capacities & conversions: 25 pallets per 30 m2 of warehouse
                            const maxPallets = Math.max(1, Math.floor((storageM2 / 30) * 25));

                            const ironPallets = iron / 1000;
                            const plasticPallets = plastic / 1000;
                            const epoxiPallets = epoxi / 1000;
                            const rawMaterialsPallets = ironPallets + plasticPallets + epoxiPallets;

                            const rodsPallets = (isLevel1 ? starRods + flatRods : 0) / 10000;
                            const screwdriversPallets = (starScrewdrivers + flatScrewdrivers) / 10000;
                            const finishedGoodsPallets = rodsPallets + screwdriversPallets;

                            const totalOccupiedPallets = rawMaterialsPallets + finishedGoodsPallets;
                            const occupiedPercentage = maxPallets > 0 ? (totalOccupiedPallets / maxPallets) * 100 : 0;
                            const clampedOccupiedPercentage = Math.min(100, Math.max(0, occupiedPercentage));
                            const freePercentage = Math.max(0, 100 - occupiedPercentage);
                            const freePallets = Math.max(0, maxPallets - totalOccupiedPallets);
                            const clampedFreePercentage = Math.max(0, 100 - clampedOccupiedPercentage);

                            return (
                              <div
                                key={acq.id}
                                className="bg-slate-50 hover:bg-slate-100/70 transition-all border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs"
                              >
                                {/* Header of Property Card */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0 mt-0.5">
                                      <Building2 className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 className="font-bold text-slate-900 text-sm">
                                          {propTitle}
                                        </h5>
                                        <span
                                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase border ${
                                            isOwned
                                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                              : "bg-blue-100 text-blue-800 border-blue-300"
                                          }`}
                                        >
                                          {isOwned ? "En Propiedad" : "Alquiler"}
                                        </span>
                                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300 uppercase">
                                          {typeLabel}
                                        </span>
                                        {(acq.surfaceM2 || acq.m2) && (
                                          <span className="text-[10px] font-mono font-semibold text-slate-500">
                                            {acq.surfaceM2 || acq.m2} m² totales
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                        <span>📍 {locationStr}</span>
                                      </p>
                                    </div>
                                  </div>

                                  {warehouseProperties.length > 1 && (
                                    <button
                                      onClick={() => handleOpenTransferModal(acq.id, "nave")}
                                      className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
                                    >
                                      <Truck className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>Trasladar desde aquí</span>
                                    </button>
                                  )}
                                </div>

                                {/* Capacity & Occupancy Visual Progress Bar */}
                                <div className="bg-white border border-slate-200/90 rounded-xl p-4 space-y-3 shadow-xs">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                          <span>Capacidad y Ocupación del Almacén</span>
                                        </span>
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                          Zona Almacén: {storageM2} m²
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        Proporción estándar: <strong>25 palets por cada 30 m²</strong> de almacén ({maxPallets} palets máx. en {storageM2} m²).
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold font-mono flex items-center gap-1.5 ${
                                        occupiedPercentage > 100
                                          ? "bg-rose-50 border-rose-200 text-rose-700"
                                          : occupiedPercentage > 85
                                          ? "bg-amber-50 border-amber-200 text-amber-700"
                                          : "bg-indigo-50 border-indigo-200 text-indigo-700"
                                      }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                          occupiedPercentage > 100
                                            ? "bg-rose-500 animate-pulse"
                                            : occupiedPercentage > 85
                                            ? "bg-amber-500"
                                            : "bg-indigo-500"
                                        }`} />
                                        <span>Ocupado: {occupiedPercentage.toFixed(1)}%</span>
                                        <span className="text-[10px] text-slate-500 font-normal">({totalOccupiedPallets.toFixed(2)} pal.)</span>
                                      </div>

                                      <div className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold font-mono flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>Libre: {freePercentage.toFixed(1)}%</span>
                                        <span className="text-[10px] text-emerald-600 font-normal">({freePallets.toFixed(2)} pal.)</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Progress Bar */}
                                  <div className="space-y-1.5">
                                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200 shadow-inner">
                                      {/* Occupied Segment */}
                                      <div
                                        style={{ width: `${clampedOccupiedPercentage}%` }}
                                        className={`h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white ${
                                          occupiedPercentage > 100
                                            ? "bg-gradient-to-r from-rose-500 to-rose-600"
                                            : occupiedPercentage > 85
                                            ? "bg-gradient-to-r from-amber-500 to-amber-600"
                                            : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                                        }`}
                                        title={`Ocupado: ${occupiedPercentage.toFixed(1)}% (${totalOccupiedPallets.toFixed(2)} palets)`}
                                      >
                                        {clampedOccupiedPercentage >= 15 && (
                                          <span className="px-1 truncate">{occupiedPercentage.toFixed(1)}% Ocupado</span>
                                        )}
                                      </div>

                                      {/* Free Segment */}
                                      <div
                                        style={{ width: `${clampedFreePercentage}%` }}
                                        className="h-full bg-emerald-500/80 transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white"
                                        title={`Libre: ${freePercentage.toFixed(1)}% (${freePallets.toFixed(2)} palets)`}
                                      >
                                        {clampedFreePercentage >= 15 && (
                                          <span className="px-1 truncate">{freePercentage.toFixed(1)}% Libre</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Sub-bar Pallet Counts */}
                                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                                      <span>0 palets (0%)</span>
                                      <span className="font-bold text-slate-700">
                                        Total Ocupado: {totalOccupiedPallets.toFixed(2)} / {maxPallets} palets
                                      </span>
                                      <span>Capacidad Máx: {maxPallets} palets (100%)</span>
                                    </div>
                                  </div>

                                  {/* Overcapacity Warning if applicable */}
                                  {occupiedPercentage > 100 && (
                                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-1.5">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                      <span>
                                        ⚠️ <strong>Exceso de Capacidad:</strong> Superas la capacidad máxima de este almacén por +{(totalOccupiedPallets - maxPallets).toFixed(2)} palets (+{((occupiedPercentage - 100)).toFixed(1)}%).
                                      </span>
                                    </div>
                                  )}

                                  {/* Detailed Pallet Breakdown & Rules Reminder */}
                                  <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                      <span className="text-slate-500 block text-[10px]">⚖️ Fragmentos Hierro (1.000 kg/palet)</span>
                                      <span className="font-bold font-mono text-slate-800">
                                        {formatNumber(iron, 1)} kg → {ironPallets.toFixed(2)} palets
                                      </span>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                      <span className="text-slate-500 block text-[10px]">📦 Pellets Plástico (1.000 kg / 40 sacos)</span>
                                      <span className="font-bold font-mono text-slate-800">
                                        {formatNumber(plastic, 1)} kg → {plasticPallets.toFixed(2)} palets
                                      </span>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                      <span className="text-slate-500 block text-[10px]">🧪 Pegamento Epoxi (1.000 kg/palet)</span>
                                      <span className="font-bold font-mono text-slate-800">
                                        {formatNumber(epoxi, 1)} kg → {epoxiPallets.toFixed(2)} palets
                                      </span>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                                      <span className="text-slate-500 block text-[10px]">🔩 Destornilladores / Varillas (10.000 u./palet)</span>
                                      <span className="font-bold font-mono text-slate-800">
                                        {formatNumber(totalUnits, 0)} u. → {finishedGoodsPallets.toFixed(2)} palets
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Inventory Items in this Property */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                  {/* Raw Materials / Inputs */}
                                  {isLevel1 && (
                                    <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                        <p className="font-bold text-amber-900 uppercase tracking-wide text-[10px] flex items-center gap-1">
                                          <Package className="w-3.5 h-3.5 text-amber-600" />
                                          <span>Materias Primas (Inputs)</span>
                                        </p>
                                        <span className="text-[10px] font-mono text-slate-400">
                                          Total: {formatNumber(totalWeight, 1)} kg
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-3 gap-2 pt-1 text-slate-800 font-mono text-xs">
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                          <span className="text-[10px] font-sans text-slate-500 block">Hierro</span>
                                          <span className="font-bold text-slate-900">{formatNumber(iron, 1)} kg</span>
                                        </div>
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                          <span className="text-[10px] font-sans text-slate-500 block">Plástico</span>
                                          <span className="font-bold text-slate-900">{formatNumber(plastic, 1)} kg</span>
                                        </div>
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                          <span className="text-[10px] font-sans text-slate-500 block">Epoxi</span>
                                          <span className="font-bold text-slate-900">{formatNumber(epoxi, 1)} kg</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Finished Goods / Mercaderías */}
                                  <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                      <p className="font-bold text-emerald-900 uppercase tracking-wide text-[10px] flex items-center gap-1">
                                        <Factory className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>{isLevel1 ? "Productos Fabricados" : "Mercaderías"}</span>
                                      </p>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        Total: {formatNumber(totalUnits, 0)} u.
                                      </span>
                                    </div>

                                    <div className={`grid ${isLevel1 ? "grid-cols-2" : "grid-cols-2"} gap-2 pt-1 text-slate-800 font-mono text-xs`}>
                                      {isLevel1 && (
                                        <>
                                          <div className="bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                                            <span className="text-[10px] font-sans text-amber-900 block truncate">Varillas Estrella</span>
                                            <span className="font-bold text-amber-700">{formatNumber(starRods, 0)} u.</span>
                                          </div>
                                          <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                                            <span className="text-[10px] font-sans text-emerald-900 block truncate">Varillas Plana</span>
                                            <span className="font-bold text-emerald-700">{formatNumber(flatRods, 0)} u.</span>
                                          </div>
                                        </>
                                      )}
                                      <div className="bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                                        <span className="text-[10px] font-sans text-indigo-900 block truncate">Dest. Estrella</span>
                                        <span className="font-bold text-indigo-700">{formatNumber(starScrewdrivers, 0)} u.</span>
                                      </div>
                                      <div className="bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                                        <span className="text-[10px] font-sans text-blue-900 block truncate">Dest. Plana</span>
                                        <span className="font-bold text-blue-700">{formatNumber(flatScrewdrivers, 0)} u.</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {isLevel1 && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-amber-600" />
                          <span>
                            Rendimiento y Producción Estimada por Turno
                          </span>
                        </h4>

                        {data?.machineryAcquisitions &&
                        data.machineryAcquisitions.length > 0 ? (
                          <div className="space-y-4">
                            {data.machineryAcquisitions.map((mac) => {
                              const locationTitle =
                                mac.installationNaveTitle ||
                                mac.installedAtNaveTitle ||
                                mac.installedNaveTitle ||
                                "Nave Industrial";
                              const isRelocating =
                                mac.relocationStatus &&
                                mac.relocationStatus !== "completed";

                              return (
                                <div
                                  key={mac.id}
                                  className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-slate-900 text-sm">
                                        {mac.lineTitle ||
                                          mac.title ||
                                          mac.machineryTitle}
                                      </p>
                                      {mac.status === "operativa" &&
                                        !isRelocating &&
                                        (() => {
                                          const assignedOperators = (
                                            data.hiredEmployees || []
                                          ).filter(
                                            (e) => e.assignedMachineryId
                                              ? (String(e.assignedMachineryId) === String(mac.id) || String(e.assignedMachineryId) === String(mac.machineryId))
                                              : Boolean(e.assignedMachineryTitle && (e.assignedMachineryTitle === mac.title || e.assignedMachineryTitle === mac.lineTitle))
                                          );
                                          const mOp = assignedOperators.filter(
                                            (e) => (Number(e.shift) || 1) === 1,
                                          ).length;
                                          const aOp = assignedOperators.filter(
                                            (e) => Number(e.shift) === 2,
                                          ).length;
                                          const nOp = assignedOperators.filter(
                                            (e) => Number(e.shift) === 3,
                                          ).length;

                                          const totalRawKg =
                                            (inventoryData?.rawMaterials
                                              ?.fragmentos_hierro_kg || 0) +
                                            (inventoryData?.rawMaterials
                                              ?.fragmentos_metal_kg || 0) +
                                            (inventoryData?.rawMaterials
                                              ?.pellets_plastico_kg || 0) +
                                            (inventoryData?.rawMaterials
                                              ?.pegamento_epoxi_kg || 0);
                                          const hasRawMaterials = totalRawKg > 0;

                                          const ownedForklifts = (
                                            data.purchasedVehicles || []
                                          ).filter(
                                            (v) =>
                                              v.vehicleType ===
                                              "carretilla_elevadora",
                                          ).length;
                                          const hasForklifts = ownedForklifts >= 1;

                                          const hasElectricity =
                                            (electricityContracts &&
                                              electricityContracts.some(
                                                (e) => e.status === "active",
                                              )) ||
                                            Boolean(electricityContract);

                                          const shift1Producing =
                                            mOp >= 2 &&
                                            hasForklifts &&
                                            hasRawMaterials &&
                                            hasElectricity;
                                          const shift2Producing =
                                            aOp >= 2 &&
                                            hasForklifts &&
                                            hasRawMaterials &&
                                            hasElectricity;
                                          const shift3Producing =
                                            nOp >= 2 &&
                                            hasForklifts &&
                                            hasRawMaterials &&
                                            hasElectricity;

                                          const isProducing =
                                            shift1Producing ||
                                            shift2Producing ||
                                            shift3Producing;

                                          if (isProducing) {
                                            return (
                                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />{" "}
                                                Operativa - Encendida
                                              </span>
                                            );
                                          }

                                          return (
                                            <span className="text-[10px] font-bold text-slate-800 bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                              Operativa - Apagada
                                            </span>
                                          );
                                        })()}
                                      {(mac.status === "montaje" ||
                                        mac.status === "en_montaje") &&
                                        !isRelocating && (
                                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                            <Wrench className="w-3 h-3 text-amber-600 animate-spin" />{" "}
                                            En Montaje Inicial
                                          </span>
                                        )}
                                      {mac.relocationStatus ===
                                        "desmontaje" && (
                                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-indigo-600" />{" "}
                                          Desmontaje en curso (4 horas)
                                        </span>
                                      )}
                                      {mac.relocationStatus === "remontaje" && (
                                        <span className="text-[10px] font-bold text-violet-800 bg-violet-100 border border-violet-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                          <Wrench className="w-3 h-3 text-violet-600" />{" "}
                                          Remontaje en destino (4 horas)
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-xs text-slate-600 flex items-center gap-1">
                                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                      <span>
                                        Ubicación actual:{" "}
                                        <strong>{locationTitle}</strong>
                                      </span>
                                    </p>

                                    {isRelocating && (
                                      <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl flex items-center gap-1.5 font-medium">
                                        <Truck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                        <span>
                                          Traslado programado a:{" "}
                                          <strong>
                                            {mac.relocationTargetNaveTitle}
                                          </strong>
                                        </span>
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex flex-col md:items-end gap-2.5 shrink-0">
                                    <div className="text-left md:text-right">
                                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                        Capacidad nominal
                                      </span>
                                      <span className="text-sm font-mono font-extrabold text-slate-900">
                                        {mac.productionCapacityUnitsPerHour ||
                                          360}{" "}
                                        unid / hora
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            No tienes ninguna línea de maquinaria adquirida
                            actualmente.
                          </p>
                        )}
                      </div>
                    )}


                  </div>
                );
              })()}

            {/* TAB 4: HIRED EMPLOYEES & PAYROLL BREAKDOWN */}
            {activeTab === "employees" && (
              <div className="space-y-6">
                {(() => {
                  const hiredList = data.hiredEmployees || [];
                  const curNow = new Date();
                  const curYear = curNow.getFullYear();
                  const curMonth = curNow.getMonth() + 1;

                  const totalGrossMonthly = hiredList.reduce((sum, e) => {
                    if (!e.hireDate) return sum + e.grossSalaryMonthly;
                    const parts = e.hireDate.split("T")[0].split("-");
                    const hireYear = parseInt(parts[0], 10);
                    const hireMonth = parseInt(parts[1], 10);
                    const hireDay = parseInt(parts[2], 10);

                    if (
                      curYear < hireYear ||
                      (curYear === hireYear && curMonth < hireMonth)
                    ) {
                      return sum; // Future hire -> not active in current month
                    }
                    if (hireYear === curYear && hireMonth === curMonth) {
                      const daysInMonth = new Date(
                        curYear,
                        curMonth,
                        0,
                      ).getDate();
                      const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
                      return (
                        sum +
                        Math.round(
                          (e.grossSalaryMonthly / daysInMonth) *
                            daysWorked *
                            100,
                        ) /
                          100
                      );
                    }
                    return sum + e.grossSalaryMonthly;
                  }, 0);

                  const totalIRPFWithholding =
                    Math.round(totalGrossMonthly * 0.17 * 100) / 100;
                  const totalEmployeeSS =
                    Math.round(totalGrossMonthly * 0.0648 * 100) / 100;
                  const totalNetSalaries =
                    Math.round(
                      (totalGrossMonthly -
                        totalIRPFWithholding -
                        totalEmployeeSS) *
                        100,
                    ) / 100;
                  const totalCompanySS =
                    Math.round(totalGrossMonthly * 0.75 * 100) / 100;
                  const totalCompanyStaffExpense =
                    Math.round((totalGrossMonthly + totalCompanySS) * 100) /
                    100;

                  return (
                    <div className="space-y-6">
                      {/* TOP SUMMARY CARDS FOR PAYROLL AND TAXES */}
                      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              <Users className="w-5 h-5 text-blue-600" />
                              <span>
                                Resumen de Masa Salarial y Cotizaciones Sociales
                                (
                                {curNow.toLocaleDateString("es-ES", {
                                  month: "long",
                                  year: "numeric",
                                })}
                                )
                              </span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Plantilla total:{" "}
                              <strong>
                                {hiredList.length} empleados contratados
                              </strong>{" "}
                              • Pago de salarios el día 1 del mes siguiente
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
                              {formatNumber(totalGrossMonthly)} €
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block font-medium">
                              Suma devengada este mes
                            </span>
                          </div>

                          {/* Card 2: Total IRPF a Retener */}
                          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block mb-1">
                              IRPF a Retener (17%)
                            </span>
                            <div className="text-lg font-black text-amber-900">
                              {formatNumber(totalIRPFWithholding)} €
                            </div>
                            <span className="text-[10px] text-amber-800/80 mt-1 block font-medium">
                              A ingresar en Hacienda (AEAT)
                            </span>
                          </div>

                          {/* Card 3: Seguridad Social Empleado */}
                          <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 block mb-1">
                              SS Empleado (6,48%)
                            </span>
                            <div className="text-lg font-black text-indigo-900">
                              {formatNumber(totalEmployeeSS)} €
                            </div>
                            <span className="text-[10px] text-indigo-800/80 mt-1 block font-medium">
                              A ingresar en TGSS
                            </span>
                          </div>

                          {/* Card 4: Seguridad Social Empresa */}
                          <div className="bg-violet-50/80 border border-violet-200/80 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-800 block mb-1">
                              SS Empresa (75%)
                            </span>
                            <div className="text-lg font-black text-violet-900">
                              {formatNumber(totalCompanySS)} €
                            </div>
                            <span className="text-[10px] text-violet-800/80 mt-1 block font-medium">
                              Gasto patronal en TGSS
                            </span>
                          </div>

                          {/* Card 5: Gasto Total Empresa */}
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block mb-1">
                              Gasto Total Empresa
                            </span>
                            <div className="text-lg font-black text-emerald-950">
                              {formatNumber(totalCompanyStaffExpense)} €
                            </div>
                            <span className="text-[10px] text-emerald-800/80 mt-1 block font-medium">
                              Sueldo Neto: {formatNumber(totalNetSalaries)} €
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* SHIFT HOURS INFO BANNER */}
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
                        <div className="flex items-center gap-2.5 font-bold">
                          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            Horarios Oficiales de Turnos de Trabajo (Lunes a Viernes, ambos inclusive):
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                          <span className="bg-white/80 border border-amber-300 px-2.5 py-1 rounded-xl shadow-2xs">
                            ☀️ <strong>Turno Mañana:</strong> 06:00 a 14:00 h
                          </span>
                          <span className="bg-white/80 border border-amber-300 px-2.5 py-1 rounded-xl shadow-2xs">
                            ⛅ <strong>Turno Tarde:</strong> 14:00 a 22:00 h
                          </span>
                          <span className="bg-white/80 border border-amber-300 px-2.5 py-1 rounded-xl shadow-2xs">
                            🌙 <strong>Turno Noche:</strong> 22:00 a 06:00 h
                          </span>
                          <span className="bg-amber-100 border border-amber-400/70 text-amber-900 px-2.5 py-1 rounded-xl shadow-2xs font-bold">
                            🛑 <strong>Fines de semana:</strong> Parada sin producción
                          </span>
                        </div>
                      </div>

                      {/* MACHINERY SHIFT COVERAGE SUMMARY */}
                      {data.machineryAcquisitions &&
                        data.machineryAcquisitions.length > 0 && (
                          <div className="space-y-4">
                            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  <Wrench className="w-4 h-4 text-amber-600" />
                                  <span>
                                    Cobertura de Operarios por Máquina y Turno
                                  </span>
                                </h3>
                                <span className="text-xs text-slate-500 font-medium">
                                  Requisito: 2 operarios / turno / máquina
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {data.machineryAcquisitions.map((m) => {
                                  const assignedToThisMachine =
                                    hiredList.filter(
                                      (e) => e.assignedMachineryId
                                        ? (String(e.assignedMachineryId) === String(m.id) || String(e.assignedMachineryId) === String(m.machineryId))
                                        : Boolean(e.assignedMachineryTitle && (e.assignedMachineryTitle === m.title || e.assignedMachineryTitle === m.lineTitle))
                                    );
                                  const countMorning =
                                    assignedToThisMachine.filter(
                                      (e) => (Number(e.shift) || 1) === 1,
                                    ).length;
                                  const countAfternoon =
                                    assignedToThisMachine.filter(
                                      (e) => Number(e.shift) === 2,
                                    ).length;
                                  const countNight =
                                    assignedToThisMachine.filter(
                                      (e) => Number(e.shift) === 3,
                                    ).length;

                                  return (
                                    <div
                                      key={m.id}
                                      className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs"
                                    >
                                      <div className="font-bold text-slate-900 text-sm mb-1">
                                        {m.title || m.lineTitle}
                                      </div>
                                      <p className="text-[11px] text-slate-500 mb-3">
                                        Ubicación: {m.installationNaveTitle}
                                      </p>

                                      <div className="grid grid-cols-3 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleAutoAssignMachineryShift(m.id, 1)}
                                          title="Haz clic para asignar un empleado sin asignar a este turno"
                                          className={`p-2.5 rounded-xl border flex flex-col items-center text-center cursor-pointer transition hover:scale-[1.03] active:scale-[0.97] hover:shadow-xs group ${
                                            countMorning >= 2
                                              ? "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/80"
                                              : "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80"
                                          }`}
                                        >
                                          <span className="font-bold text-[10px] uppercase tracking-wider block">
                                            Turno Mañana
                                          </span>
                                          <span className="text-[9px] opacity-75 font-semibold block my-0.5">
                                            06:00 - 14:00 h
                                          </span>
                                          <span className="text-base font-extrabold my-0.5">
                                            {countMorning} / 2
                                          </span>
                                          <span className="text-[9px] font-semibold">
                                            {countMorning >= 2
                                              ? "✅ Cubierto"
                                              : `Faltan ${2 - countMorning}`}
                                          </span>
                                          <span className="text-[8px] font-extrabold text-blue-700 opacity-80 group-hover:opacity-100 mt-1 underline">
                                            + Auto-asignar
                                          </span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleAutoAssignMachineryShift(m.id, 2)}
                                          title="Haz clic para asignar un empleado sin asignar a este turno"
                                          className={`p-2.5 rounded-xl border flex flex-col items-center text-center cursor-pointer transition hover:scale-[1.03] active:scale-[0.97] hover:shadow-xs group ${
                                            countAfternoon >= 2
                                              ? "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/80"
                                              : "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80"
                                          }`}
                                        >
                                          <span className="font-bold text-[10px] uppercase tracking-wider block">
                                            Turno Tarde
                                          </span>
                                          <span className="text-[9px] opacity-75 font-semibold block my-0.5">
                                            14:00 - 22:00 h
                                          </span>
                                          <span className="text-base font-extrabold my-0.5">
                                            {countAfternoon} / 2
                                          </span>
                                          <span className="text-[9px] font-semibold">
                                            {countAfternoon >= 2
                                              ? "✅ Cubierto"
                                              : `Faltan ${2 - countAfternoon}`}
                                          </span>
                                          <span className="text-[8px] font-extrabold text-blue-700 opacity-80 group-hover:opacity-100 mt-1 underline">
                                            + Auto-asignar
                                          </span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleAutoAssignMachineryShift(m.id, 3)}
                                          title="Haz clic para asignar un empleado sin asignar a este turno"
                                          className={`p-2.5 rounded-xl border flex flex-col items-center text-center cursor-pointer transition hover:scale-[1.03] active:scale-[0.97] hover:shadow-xs group ${
                                            countNight >= 2
                                              ? "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/80"
                                              : "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80"
                                          }`}
                                        >
                                          <span className="font-bold text-[10px] uppercase tracking-wider block">
                                            Turno Noche
                                          </span>
                                          <span className="text-[9px] opacity-75 font-semibold block my-0.5">
                                            22:00 - 06:00 h
                                          </span>
                                          <span className="text-base font-extrabold my-0.5">
                                            {countNight} / 2
                                          </span>
                                          <span className="text-[9px] font-semibold">
                                            {countNight >= 2
                                              ? "✅ Cubierto"
                                              : `Faltan ${2 - countNight}`}
                                          </span>
                                          <span className="text-[8px] font-extrabold text-blue-700 opacity-80 group-hover:opacity-100 mt-1 underline">
                                            + Auto-asignar
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* FORKLIFT & CARRETILLEROS REQUIREMENTS BY WAREHOUSE */}
                            {(() => {
                              const numMachinery =
                                data.machineryAcquisitions.length;
                              const reqWarehouses = numMachinery === 1 ? 2 : 3;
                              const reqForklifts = reqWarehouses;
                              const ownedForklifts = (
                                data.purchasedVehicles || []
                              ).filter(
                                (v) => v.vehicleType === "carretilla_elevadora",
                              ).length;
                              const carretillerosList = hiredList.filter(
                                (e) => e.role === "carretillero",
                              );

                              return (
                                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                                    <div>
                                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <Truck className="w-4 h-4 text-amber-600" />
                                        <span>
                                          Requisito de Carretilla Elevadora en Nave Industrial
                                        </span>
                                      </h3>
                                      <p className="text-xs text-slate-500 mt-0.5">
                                        Para que la maquinaria funcione y se puedan recibir compras de materias primas en el inmueble, es necesario disponer de al menos 1 carretilla elevadora contrapesada en propiedad.
                                      </p>
                                    </div>
                                    <div
                                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 ${
                                        ownedForklifts >= 1
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                          : "bg-amber-50 border-amber-200 text-amber-900"
                                      }`}
                                    >
                                      Carretilla Elevadora: {ownedForklifts} / 1{" "}
                                      {ownedForklifts >= 1
                                        ? "✅ Adquirida"
                                        : "⚠️ Pendiente de Compra"}
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs flex items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="font-bold text-slate-900">
                                        Estado de Maquinaria de Logística e Inmueble
                                      </div>
                                      <p className="text-[11px] text-slate-500">
                                        {ownedForklifts >= 1 
                                          ? "✓ Dispones de carretilla elevadora asignada a la nave industrial para operativa de almacén y recepción de mercancía."
                                          : "✕ No dispones de carretilla elevadora. Adquiérela en el Concesionario de Vehículos e Industriales para habilitar la nave y las compras."}
                                      </p>
                                    </div>
                                    {ownedForklifts < 1 && (
                                      <button
                                        type="button"
                                        onClick={onBackToHub}
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer transition"
                                      >
                                        Ir al Concesionario
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                      {/* LIST OF HIRED EMPLOYEES CARDS */}
                      {hiredList.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
                          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <h3 className="text-lg font-bold text-slate-800">
                            Aún no tienes empleados contratados
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Accede a la sección Foro de Empleo para contratar
                            operarios e incorporarlos a la plantilla de tu
                            empresa.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {hiredList.map((emp) => {
                            let hireYear = curYear;
                            let hireMonth = curMonth;
                            let hireDay = 1;
                            if (emp.hireDate) {
                              const parts = emp.hireDate
                                .split("T")[0]
                                .split("-");
                              hireYear = parseInt(parts[0], 10);
                              hireMonth = parseInt(parts[1], 10);
                              hireDay = parseInt(parts[2], 10);
                            }
                            const isFirstMonth =
                              hireYear === curYear && hireMonth === curMonth;
                            const daysInMonth = new Date(
                              curYear,
                              curMonth,
                              0,
                            ).getDate();
                            const workedDays = isFirstMonth
                              ? Math.max(1, daysInMonth - hireDay + 1)
                              : daysInMonth;

                            const grossForMonth = isFirstMonth
                              ? Math.round(
                                  (emp.grossSalaryMonthly / daysInMonth) *
                                    workedDays *
                                    100,
                                ) / 100
                              : emp.grossSalaryMonthly;

                            const irpfForMonth =
                              Math.round(grossForMonth * 0.17 * 100) / 100;
                            const ssEmpForMonth =
                              Math.round(grossForMonth * 0.0648 * 100) / 100;
                            const netForMonth =
                              Math.round(
                                (grossForMonth - irpfForMonth - ssEmpForMonth) *
                                  100,
                              ) / 100;
                            const ssCompanyForMonth =
                              Math.round(grossForMonth * 0.75 * 100) / 100;

                            return (
                              <div
                                key={emp.id}
                                className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center gap-3 mb-3">
                                    <img
                                      src={emp.avatarUrl}
                                      alt={emp.employeeName}
                                      referrerPolicy="no-referrer"
                                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                                      onError={(e) => {
                                        const target = e.currentTarget as HTMLImageElement;
                                        if (target.src !== SVG_FALLBACK) target.src = SVG_FALLBACK;
                                      }}
                                    />
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-900 text-sm">
                                          {emp.employeeName}
                                        </h4>
                                        <span
                                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                            emp.role === "camionero"
                                              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                              : emp.role === "carretillero"
                                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                                : "bg-blue-50 text-blue-800 border-blue-200"
                                          }`}
                                        >
                                          {emp.role === "camionero"
                                            ? "Camionero"
                                            : emp.role === "carretillero"
                                              ? "Carretillero"
                                              : "Operario"}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-slate-500 block">
                                        Alta:{" "}
                                        <strong className="font-mono">
                                          {emp.hireDate
                                            ? emp.hireDate.split("T")[0]
                                            : "N/A"}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>

                                  {isFirstMonth ? (
                                    <div className="mb-3 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center justify-between font-medium">
                                      <span>Mes de alta (Incompleto):</span>
                                      <span className="font-bold font-mono">
                                        {workedDays}/{daysInMonth} días
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="mb-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 flex items-center justify-between font-medium">
                                      <span>Mes completo:</span>
                                      <span className="font-bold font-mono">
                                        100% Salario ({daysInMonth} días)
                                      </span>
                                    </div>
                                  )}

                                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4 text-xs space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">
                                        Sueldo Bruto (Mes):
                                      </span>
                                      <strong className="text-slate-900 font-mono">
                                        {formatNumber(grossForMonth)} €
                                      </strong>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">
                                        IRPF Retenido (17%):
                                      </span>
                                      <span className="text-amber-800 font-semibold font-mono">
                                        {formatNumber(irpfForMonth)} €
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">
                                        SS Empleado (6,48%):
                                      </span>
                                      <span className="text-indigo-800 font-semibold font-mono">
                                        {formatNumber(ssEmpForMonth)} €
                                      </span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                                      <span className="text-slate-700">
                                        Sueldo Neto a Percibir:
                                      </span>
                                      <span className="text-emerald-700 font-mono">
                                        {formatNumber(netForMonth)} €
                                      </span>
                                    </div>
                                  </div>

                                  {/* Role Assignment Controls */}
                                  <div className="space-y-2.5 mb-4">
                                    {/* OPERARIO */}
                                    {(!emp.role || emp.role === "operario") && (
                                      <>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                          Asignación de Maquinaria
                                        </label>
                                        <select
                                          value={emp.assignedMachineryId || ""}
                                          disabled={updatingEmpId === emp.id}
                                          onChange={(e) =>
                                            handleAssignEmployeeMachineryShift(
                                              emp.id,
                                              e.target.value,
                                              emp.shift || 1,
                                            )
                                          }
                                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                                        >
                                          <option value="">
                                            -- Sin máquina asignada --
                                          </option>
                                          {(
                                            data.machineryAcquisitions || []
                                          ).map((m) => (
                                            <option key={m.id} value={m.id}>
                                              {m.title || m.lineTitle} (
                                              {m.installationNaveTitle})
                                            </option>
                                          ))}
                                        </select>

                                        {emp.assignedMachineryId && (
                                          <div className="flex items-center justify-between pt-1">
                                            <span className="text-xs text-slate-500 font-medium">
                                              Turno Asignado:
                                            </span>
                                            <div className="flex gap-1">
                                              {[
                                                {
                                                  shiftNum: 1,
                                                  label: "Mañana",
                                                },
                                                { shiftNum: 2, label: "Tarde" },
                                                { shiftNum: 3, label: "Noche" },
                                              ].map(({ shiftNum, label }) => (
                                                <button
                                                  key={shiftNum}
                                                  disabled={
                                                    updatingEmpId === emp.id
                                                  }
                                                  onClick={() =>
                                                    handleAssignEmployeeMachineryShift(
                                                      emp.id,
                                                      emp.assignedMachineryId!,
                                                      shiftNum,
                                                    )
                                                  }
                                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition text-center ${
                                                    emp.shift === shiftNum
                                                      ? "bg-blue-600 text-white border-blue-600"
                                                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                  }`}
                                                >
                                                  <div>{label}</div>
                                                  <div className="text-[8px] opacity-80 font-normal">
                                                    {shiftNum === 1 ? '06:00-14:00' : shiftNum === 2 ? '14:00-22:00' : '22:00-06:00'}
                                                  </div>
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}


                                    {/* CAMIONERO O CARRETILLERO */}
                                    {(emp.role === "camionero" || emp.role === "carretillero" || (emp.role as string) === "conductor") && (
                                      <>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                                          Asignación de Vehículo / Carretilla Elevadora
                                        </label>
                                        <select
                                          value={emp.assignedVehicleId || ""}
                                          disabled={updatingEmpId === emp.id}
                                          onChange={(e) =>
                                            handleAssignEmployeeVehicle(
                                              emp.id,
                                              e.target.value,
                                              emp.assignedWarehouseIndex,
                                              emp.shift || 1,
                                            )
                                          }
                                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                                        >
                                          <option value="">
                                            -- Sin vehículo/carretilla asignado --
                                          </option>
                                          {(data.purchasedVehicles || [])
                                            .filter(
                                              (v) =>
                                                v.vehicleType === "camion_trailer" ||
                                                v.vehicleType === "carretilla_elevadora",
                                            )
                                            .map((v) => (
                                              <option key={v.id} value={v.id}>
                                                {v.vehicleType === "carretilla_elevadora" ? "🚜 " : "🚛 "}
                                                {v.title || v.vehicleTitle} ({v.vehicleType === "carretilla_elevadora" ? "Carretilla Elevadora" : "Camión Tráiler"}) - {v.paymentMethod === "contado" ? "Propiedad" : "Renting"}
                                              </option>
                                            ))}
                                        </select>
                                      </>
                                    )}


                                                                   </div>
                                 </div>

                                 {/* PDF PAYSLIP BUTTON */}
                                <div className="pt-3 border-t border-slate-100">
                                  <button
                                    onClick={() =>
                                      setActiveDocumentModal({
                                        type: "payroll_payslip",
                                        hiredEmployee: emp,
                                        studentName:
                                          currentUser.name ||
                                          data?.company?.name ||
                                          "Alumno",
                                        employeeName: emp.employeeName,
                                        periodMonth: curNow.toLocaleDateString(
                                          "es-ES",
                                          { month: "long", year: "numeric" },
                                        ),
                                        workedDays,
                                        totalMonthDays: daysInMonth,
                                        proportionalGross: grossForMonth,
                                        irpfAmount: irpfForMonth,
                                        ssEmployeeAmount: ssEmpForMonth,
                                        netSalary: netForMonth,
                                        ssCompanyAmount: ssCompanyForMonth,
                                        totalCompanyCost:
                                          grossForMonth + ssCompanyForMonth,
                                      })
                                    }
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

            {activeTab === "obligations" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-600" />
                        <span>Próximos pagos</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Relación cronológica ordenada por fecha de vencimiento
                        de todos los importes a pagar en los próximos 24 meses
                        (alquileres, adquisiciones de inmuebles o maquinaria,
                        nóminas, Seguridad Social, Hacienda Pública y
                        préstamos).
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold bg-purple-50 text-purple-900 border border-purple-200 px-3 py-1 rounded-full self-start sm:self-auto">
                      Proyección 24 meses:{" "}
                      {getUpcoming24MonthsPayments().length} pagos
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
                          {getUpcoming24MonthsPayments().map((item) => {
                            const isPaid = item.status === "pagado";
                            const isOverdue =
                              item.status === "vencido" ||
                              (!isPaid && new Date(item.dueDate) <= new Date());

                            return (
                              <tr
                                key={item.id}
                                className="hover:bg-slate-50/80 transition"
                              >
                                <td className="p-3.5 text-slate-900 font-mono font-bold">
                                  {new Date(item.dueDate).toLocaleDateString(
                                    "es-ES",
                                  )}
                                </td>
                                <td className="p-3.5 text-slate-900 font-semibold">
                                  {item.concept}
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-medium border border-slate-200">
                                    {item.origin}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right font-black text-slate-900 text-sm">
                                  {formatNumber(item.amount)} €
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
                                  {!isPaid &&
                                    isOverdue &&
                                    !item.id.startsWith("payroll-") &&
                                    !item.id.startsWith("loan-") && (
                                      <button
                                        disabled={
                                          payingObligationId === item.id ||
                                          payingTaxId === item.id
                                        }
                                        onClick={() => {
                                          if (
                                            item.origin.includes("AEAT") ||
                                            item.origin.includes("TGSS")
                                          ) {
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
            {activeTab === "loans" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Landmark className="w-5 h-5 text-emerald-600" />
                        <span>Préstamos</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Detalle de préstamos bancarios e hipotecas activas
                        concedidos para la financiación de bienes inmuebles.
                      </p>
                    </div>
                  </div>

                  {!data.loans ||
                  data.loans.filter((l) => l.status === "active").length ===
                    0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No existen préstamos ni hipotecas activas en este momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.loans
                        .filter((l) => l.status === "active")
                        .map((loan) => {
                          const unpaidRows = (loan.schedule || []).filter(
                            (r) => !r.paid,
                          );
                          const unpaidSum = unpaidRows.reduce(
                            (acc, r) => acc + r.payment,
                            0,
                          );
                          const unpaidPrincipal = unpaidRows.reduce(
                            (acc, r) => acc + r.principal,
                            0,
                          );

                          return (
                            <div
                              key={loan.id}
                              className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors"
                            >
                              <div>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <span className="inline-block text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 mb-1">
                                      Préstamo hipotecario
                                    </span>
                                    <h4 className="text-sm font-black text-slate-900 line-clamp-1">
                                      {loan.collateral.propertyTitle ||
                                        "Garantía inmobiliaria"}
                                    </h4>
                                  </div>
                                  <span className="text-xs font-mono font-bold text-slate-500">
                                    Ref: #{loan.id.slice(0, 8)}
                                  </span>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-y border-slate-200/80 py-3 my-2">
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                      Capital otorgado
                                    </span>
                                    <span className="font-extrabold text-slate-800">
                                      {formatNumber(loan.offeredAmount)} €
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                      Cuotas pendientes
                                    </span>
                                    <span className="font-extrabold text-rose-700">
                                      {formatNumber(unpaidSum)} €
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                      Capital vivo (principal)
                                    </span>
                                    <span className="font-extrabold text-slate-800">
                                      {formatNumber(unpaidPrincipal)} €
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                      Cuota mensual
                                    </span>
                                    <span className="font-extrabold text-slate-900">
                                      {formatNumber(loan.monthlyPayment)} €/mes
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span>
                                    Plazo: {loan.termMonths} meses •{" "}
                                    {loan.annualInterestRate}% interés
                                  </span>
                                  <span>
                                    {unpaidRows.length} cuotas restantes
                                  </span>
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
            {/* TAB 8: TELÉFONO E INTERNET */}
            {activeTab === "telecom" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <PhoneCall className="w-5 h-5 text-blue-600" />
                        <span>
                          Servicios de Teléfono e Internet Contratados
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Líneas corporativas, fibra óptica simétrica y
                        centralitas IP con facturación mensual automática el día
                        1 de cada mes.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 px-3 py-1 rounded-full">
                      {telecomContracts.length} servicio(s) activo(s)
                    </span>
                  </div>

                  {telecomContracts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Tu empresa no tiene contratado ningún servicio de teléfono
                      o internet. Puedes contratar planes empresariales desde la
                      tarjeta de Servicios de Teléfono e Internet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {telecomContracts.map((c) => (
                        <div
                          key={c.id}
                          className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-black uppercase rounded-full">
                                {c.provider}
                              </span>
                              <h4 className="font-extrabold text-sm text-slate-900 mt-1">
                                {c.planName}
                              </h4>
                            </div>
                            <span className="text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              Activo
                            </span>
                          </div>

                          <div className="text-xs space-y-1 text-slate-600 border-y border-slate-200/80 py-3">
                            <div className="flex justify-between">
                              <span>Cuota mensual:</span>
                              <span className="font-extrabold text-slate-900">
                                {formatNumber(c.monthlyPrice)} €/mes (+ IVA)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Fecha de contratación:</span>
                              <span className="font-medium text-slate-800">
                                {new Date(c.contractDate).toLocaleDateString(
                                  "es-ES",
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Próxima facturación:</span>
                              <span className="font-bold text-blue-700">
                                1 de cada mes (Cobro automático)
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Telecom Invoices Table */}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Facturas de Telecomunicaciones Emitidas
                    </h4>
                    {telecomInvoices.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No hay facturas emitidas todavía.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="p-3">Nº Factura</th>
                              <th className="p-3">Periodo</th>
                              <th className="p-3">Servicio</th>
                              <th className="p-3 text-right">Total Factura</th>
                              <th className="p-3 text-center">Estado</th>
                              <th className="p-3 text-right">Factura PDF</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-800">
                            {telecomInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-slate-50">
                                <td className="p-3 font-bold text-slate-900">
                                  {inv.invoiceNumber}
                                </td>
                                <td className="p-3 font-medium text-slate-600">
                                  {inv.periodMonth}/{inv.periodYear}
                                </td>
                                <td className="p-3 font-medium">
                                  {inv.planName}
                                </td>
                                <td className="p-3 text-right font-black text-slate-900">
                                  {formatNumber(inv.totalAmount)} €
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                                    Pagado
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() =>
                                      setSelectedTelecomInvoiceModal(inv)
                                    }
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-[11px] rounded-xl transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Descargar / Imprimir PDF</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 10: VEHÍCULOS Y CARRETILLAS */}
            {activeTab === "vehicles" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Truck className="w-5 h-5 text-blue-600" />
                        <span>Flota de Vehículos y Carretillas Compradas</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Gestión de vehículos industriales y carretillas
                        elevadoras. Asigna cada carretilla a un almacén
                        específico para cumplir los requisitos de logística y
                        carga.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 px-3 py-1 rounded-full">
                      {data?.purchasedVehicles?.length || 0} vehículo(s)
                    </span>
                  </div>

                  {!data?.purchasedVehicles ||
                  data.purchasedVehicles.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Tu empresa no ha adquirido vehículos ni carretillas
                      elevadoras todavía. Puedes adquirirlos en el Concesionario
                      de Vehículos.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.purchasedVehicles.map((veh) => {
                        const isForklift =
                          veh.vehicleType === "carretilla_elevadora";
                        const isTruck = veh.vehicleType === "camion_trailer";
                        const isVan = veh.vehicleType === "furgoneta";

                        const assignedEmp = (data.hiredEmployees || []).find(
                          (e) => e.assignedVehicleId === veh.id,
                        );

                        return (
                          <div
                            key={veh.id}
                            className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                                  <Truck className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-900 text-sm">
                                    {veh.vehicleTitle ||
                                      veh.title ||
                                      veh.vehicleType}
                                  </h4>
                                  <p className="text-xs text-slate-500 font-mono">
                                    Matrícula:{" "}
                                    {veh.registrationNumber ||
                                      veh.registration ||
                                      "S/M"}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                  isForklift
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : isTruck
                                      ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                                      : "bg-blue-100 text-blue-800 border border-blue-300"
                                }`}
                              >
                                {isForklift
                                  ? "Carretilla Elevadora"
                                  : isTruck
                                    ? "Camión Tráiler"
                                    : isVan
                                      ? "Furgoneta"
                                      : "Vehículo"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs font-medium border-t border-b border-slate-200/80 py-3">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                  Precio Adquisición
                                </span>
                                <span className="text-slate-900 font-bold font-mono">
                                  {formatNumber(
                                    veh.purchasePrice || veh.price || 0,
                                  )}{" "}
                                  €
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                  Pago
                                </span>
                                <span className="text-slate-700 capitalize">
                                  {veh.paymentMethod === "contado"
                                    ? "Al contado"
                                    : "Pago aplazado"}
                                </span>
                              </div>
                            </div>

                            {/* Warehouse Assignment Selector */}
                            <div className="space-y-1.5 pt-1">
                              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                                  {isForklift
                                    ? "Inmueble Asignado (Nave Industrial o Almacén Logístico):"
                                    : "Almacén Asignado por Nave / Inmueble:"}
                                </span>
                                {veh.assignedWarehouseName ||
                                veh.assignedWarehouseIndex ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                    {veh.assignedWarehouseName ||
                                      (veh.assignedPropertyTitle
                                        ? `${veh.assignedPropertyTitle} - Alm. ${veh.assignedWarehouseIndex}`
                                        : `Almacén ${veh.assignedWarehouseIndex}`)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                    Sin Inmueble Asignado
                                  </span>
                                )}
                              </label>

                              <select
                                value={
                                  veh.assignedPropertyId
                                    ? `${veh.assignedPropertyId}_wh_${veh.assignedWarehouseIndex || 1}`
                                    : veh.assignedWarehouseIndex && !isForklift
                                      ? `generic_wh_${veh.assignedWarehouseIndex}`
                                      : ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!val) {
                                    handleAssignVehicleWarehouse(
                                      veh.id,
                                      undefined,
                                      undefined,
                                      undefined,
                                      undefined,
                                    );
                                    return;
                                  }
                                  if (val.startsWith("generic_wh_")) {
                                    const idx = Number(
                                      val.replace("generic_wh_", ""),
                                    );
                                    const names = [
                                      "",
                                      "Almacén 1 (Materias Primas)",
                                      "Almacén 2 (Semiterminados)",
                                      "Almacén 3 (Productos Terminados)",
                                    ];
                                    handleAssignVehicleWarehouse(
                                      veh.id,
                                      idx,
                                      undefined,
                                      undefined,
                                      names[idx] || `Almacén ${idx}`,
                                    );
                                    return;
                                  }

                                  const parts = val.split("_wh_");
                                  const propId = parts[0];
                                  const whIdx = Number(parts[1] || 1);
                                  const acq = (data?.acquisitions || []).find(
                                    (a) =>
                                      String(a.id) === propId ||
                                      String(a.propertyId) === propId,
                                  );
                                  const propTitle =
                                    acq?.propertyTitle ||
                                    acq?.title ||
                                    "Inmueble / Almacén";
                                  const isNave =
                                    acq?.propertyType?.includes("nave") ||
                                    acq?.propertyType === "industrial" ||
                                    acq?.propertyType === "nave_industrial" ||
                                    acq?.propertyTitle
                                      ?.toLowerCase()
                                      .includes("nave");

                                  const isAlmacen =
                                    acq?.propertyType === "almacen" ||
                                    acq?.propertyType === "almacen_logistico" ||
                                    acq?.propertyType === "warehouse" ||
                                    acq?.propertyTitle
                                      ?.toLowerCase()
                                      .includes("almacén") ||
                                    acq?.propertyTitle
                                      ?.toLowerCase()
                                      .includes("almacen");

                                  const whName = isNave
                                    ? `${propTitle} (Inmueble Nave Industrial)`
                                    : isAlmacen
                                      ? `${propTitle} (Inmueble Almacén Logístico)`
                                      : `${propTitle} - Almacén ${whIdx}`;

                                  handleAssignVehicleWarehouse(
                                    veh.id,
                                    whIdx,
                                    propId,
                                    propTitle,
                                    whName,
                                  );
                                }}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
                              >
                                <option value="">
                                  -- Sin Inmueble Asignado --
                                </option>

                                {/* Group by Naves Industriales */}
                                {data?.acquisitions &&
                                  data.acquisitions.filter(
                                    (a) =>
                                      a.propertyType?.includes("nave") ||
                                      a.propertyType === "industrial" ||
                                      a.propertyType === "nave_industrial" ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("nave"),
                                  ).length > 0 && (
                                    <optgroup label="🏭 Naves Industriales">
                                      {data.acquisitions
                                        .filter(
                                          (a) =>
                                            a.propertyType?.includes("nave") ||
                                            a.propertyType === "industrial" ||
                                            a.propertyType === "nave_industrial" ||
                                            a.propertyTitle
                                              ?.toLowerCase()
                                              .includes("nave"),
                                        )
                                        .map((acq) => {
                                          const pId = acq.id || acq.propertyId;
                                          const title =
                                            acq.propertyTitle ||
                                            "Nave Industrial";
                                          return (
                                            <option
                                              key={pId}
                                              value={`${pId}_wh_1`}
                                            >
                                              {title} (Inmueble Completo)
                                            </option>
                                          );
                                        })}
                                    </optgroup>
                                  )}

                                {/* Group by Almacenes Logísticos */}
                                {data?.acquisitions &&
                                  data.acquisitions.filter(
                                    (a) =>
                                      a.propertyType === "almacen" ||
                                      a.propertyType === "almacen_logistico" ||
                                      a.propertyType === "warehouse" ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("almacén") ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("almacen"),
                                  ).length > 0 && (
                                    <optgroup label="📦 Almacenes Logísticos">
                                      {data.acquisitions
                                        .filter(
                                          (a) =>
                                            a.propertyType === "almacen" ||
                                            a.propertyType === "almacen_logistico" ||
                                            a.propertyType === "warehouse" ||
                                            a.propertyTitle
                                              ?.toLowerCase()
                                              .includes("almacén") ||
                                            a.propertyTitle
                                              ?.toLowerCase()
                                              .includes("almacen"),
                                        )
                                        .map((acq) => {
                                          const pId = acq.id || acq.propertyId;
                                          const title =
                                            acq.propertyTitle ||
                                            "Almacén Logístico";
                                          return (
                                            <option
                                              key={pId}
                                              value={`${pId}_wh_1`}
                                            >
                                              {title} (Inmueble Completo)
                                            </option>
                                          );
                                        })}
                                    </optgroup>
                                  )}

                                {/* Standalone General Options (Only for non-forklifts) */}
                                {!isForklift && (
                                  <optgroup label="🏢 Almacenes Generales por Defecto">
                                    <option value="generic_wh_1">
                                      Almacén 1 (Materias Primas - General)
                                    </option>
                                    <option value="generic_wh_2">
                                      Almacén 2 (Semiterminados - General)
                                    </option>
                                    <option value="generic_wh_3">
                                      Almacén 3 (Productos Terminados - General)
                                    </option>
                                  </optgroup>
                                )}
                              </select>

                              {isForklift &&
                                (!data?.acquisitions ||
                                  data.acquisitions.filter(
                                    (a) =>
                                      a.propertyType?.includes("nave") ||
                                      a.propertyType === "industrial" ||
                                      a.propertyType === "nave_industrial" ||
                                      a.propertyType === "almacen" ||
                                      a.propertyType === "almacen_logistico" ||
                                      a.propertyType === "warehouse" ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("nave") ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("almacén") ||
                                      a.propertyTitle
                                        ?.toLowerCase()
                                        .includes("almacen"),
                                  ).length === 0) && (
                                  <p className="text-[11px] font-medium text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200 mt-1">
                                    ⚠️ Para asignar esta carretilla elevadora contrapesada, debes disponer de una Nave Industrial o Almacén Logístico en propiedad o alquiler.
                                  </p>
                                )}
                            </div>

                            {/* Driver Assignment Info */}
                            {assignedEmp ? (
                              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2 font-medium">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                                <span>
                                  Conductor / Operario asignado:{" "}
                                  <strong>{assignedEmp.name}</strong> (
                                  {assignedEmp.role})
                                </span>
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-xl font-medium">
                                Conductor asignado:{" "}
                                <span className="italic text-slate-400">
                                  Sin asignar (gestionar desde pestaña
                                  Empleados)
                                </span>
                              </p>
                            )}

                            {/* Vehicle Purchase Invoice Button */}
                            <button
                              type="button"
                              onClick={() =>
                                setActiveDocumentModal({
                                  type: "vehicle_invoice",
                                  vehicle: veh,
                                  studentName: data.name || "Empresa Alumno",
                                })
                              }
                              className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              <Receipt className="w-3.5 h-3.5 text-blue-600" />
                              <span>Ver / Imprimir Factura Adquisición (PDF)</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 9: MUEBLES E INFORMÁTICA */}
            {activeTab === "muebles_informatica" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-amber-600" />
                        <span>
                          Inventario de Muebles e Equipos Informáticos
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Relación de adquisiciones de estanterías, mesas, sillas,
                        ordenadores, impresoras, software y telefonía integrados
                        en el patrimonio de la empresa.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full">
                      {officeOrders.length} pedido(s) registrado(s)
                    </span>
                  </div>

                  {officeOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No hay registros en el inventario de muebles e
                      informática. Puedes realizar adquisiciones desde la Tienda
                      de Cosas de Oficina.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {officeOrders.map((order) => (
                        <div
                          key={order.id}
                          className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase rounded-full">
                                  Inmovilizado / Equipamiento
                                </span>
                                <span className="text-xs font-bold text-slate-900">
                                  Pedido Nº {order.orderNumber}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Fecha y hora de compra:{" "}
                                <strong className="text-slate-800">
                                  {new Date(order.purchaseDate).toLocaleString(
                                    "es-ES",
                                  )}
                                </strong>
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-slate-900">
                                {formatNumber(order.totalAmount)} € (IVA incl.)
                              </span>
                              <button
                                onClick={() =>
                                  setSelectedOfficeOrderModal(order)
                                }
                                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-xl transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Factura / Descargar PDF</span>
                              </button>
                            </div>
                          </div>

                          {/* Itemized List */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-white text-slate-500 font-bold border-b border-slate-200">
                                  <th className="p-2.5">Categoría</th>
                                  <th className="p-2.5">Producto</th>
                                  <th className="p-2.5 text-center">
                                    Cantidad
                                  </th>
                                  <th className="p-2.5 text-right">
                                    Precio Unid.
                                  </th>
                                  <th className="p-2.5 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/80 text-slate-800">
                                {order.items.map((it, iIdx) => {
                                  const imgUrl =
                                    it.imageUrl ||
                                    OFFICE_STORE_CATALOG.find(
                                      (c) => c.id === it.itemId,
                                    )?.imageUrl;
                                  return (
                                    <tr key={iIdx}>
                                      <td className="p-2.5 font-semibold text-slate-500">
                                        {it.categoryLabel}
                                      </td>
                                      <td className="p-2.5 font-bold text-slate-900">
                                        <div className="flex items-center gap-2.5">
                                          {imgUrl && (
                                            <img
                                              src={resolveImageUrl(imgUrl, 'product', it.itemName)}
                                              alt={it.itemName}
                                              referrerPolicy="no-referrer"
                                              className="w-9 h-9 rounded-lg object-cover bg-slate-200 border border-slate-300 shrink-0"
                                              onError={(e) => {
                                                const target = e.currentTarget as HTMLImageElement;
                                                if (target.src !== SVG_FALLBACK) target.src = SVG_FALLBACK;
                                              }}
                                            />
                                          )}
                                          <span>{it.itemName}</span>
                                        </div>
                                      </td>
                                      <td className="p-2.5 text-center font-bold">
                                        {it.quantity}
                                      </td>
                                      <td className="p-2.5 text-right">
                                        {formatNumber(it.unitPrice)} €
                                      </td>
                                      <td className="p-2.5 text-right font-black text-slate-900">
                                        {formatNumber(it.totalPrice)} €
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />

      {/* TELECOM INVOICE MODAL */}
      <TelecomInvoiceModal
        invoice={selectedTelecomInvoiceModal}
        onClose={() => setSelectedTelecomInvoiceModal(null)}
      />

      {/* OFFICE ORDER INVOICE MODAL */}
      <OfficeInvoiceModal
        order={selectedOfficeOrderModal}
        onClose={() => setSelectedOfficeOrderModal(null)}
      />

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
                  <h2 className="text-lg font-black text-white">
                    Detalle de Deudas por Operación Origen
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Simulador de Daniel Arnaiz Boluda • Contabilidad y Gestión
                    Patrimonial
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
                  <span className="text-[10px] font-extrabold uppercase text-red-600 block mb-1">
                    Deuda Total Pendiente
                  </span>
                  <div className="text-xl font-black text-red-700">
                    {formatNumber(data.summary.totalPendingObligations)} €
                  </div>
                  <span className="text-[11px] text-red-600/80 mt-1 block">
                    Pagarés + Préstamos Bancarios
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">
                    Préstamos Hipotecarios
                  </span>
                  <div className="text-xl font-black text-emerald-800">
                    {formatNumber(data.summary.totalLoansPendingAmount || 0)} €
                  </div>
                  <span className="text-[11px] text-emerald-700/80 mt-1 block">
                    {data.summary.activeLoansCount || 0} operación(es) con Banco
                    Simulado
                  </span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900">
                  <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">
                    Pagarés / Letras de Cambio
                  </span>
                  <div className="text-xl font-black text-amber-900">
                    {formatNumber(
                      data.summary.totalObligationsPendingAmount || 0,
                    )}{" "}
                    €
                  </div>
                  <span className="text-[11px] text-amber-800/80 mt-1 block">
                    {
                      data.obligations.filter((o) => o.status === "pendiente")
                        .length
                    }{" "}
                    cuota(s) por vencer
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setDebtFilterOrigin("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    debtFilterOrigin === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Todas las Deudas
                </button>
                <button
                  onClick={() => setDebtFilterOrigin("loans")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === "loans"
                      ? "bg-emerald-700 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Préstamos Bancarios ({(data.loans || []).length})</span>
                </button>
                <button
                  onClick={() => setDebtFilterOrigin("obligations")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === "obligations"
                      ? "bg-amber-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>
                    Pagarés y Letras (
                    {
                      data.obligations.filter(
                        (o) =>
                          o.status === "pendiente" &&
                          o.type !== "cuota_alquiler",
                      ).length
                    }
                    )
                  </span>
                </button>
              </div>

              {/* LIST BY OPERATION ORIGIN */}
              <div className="space-y-6">
                {/* ORIGIN 1: BANK LOANS */}
                {(debtFilterOrigin === "all" ||
                  debtFilterOrigin === "loans") && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>
                          Operación Origen: Financiación Hipotecaria Bancaria
                        </span>
                      </h3>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        Banco Simulado
                      </span>
                    </div>

                    {!data.loans || data.loans.length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen préstamos bancarios o hipotecarios concedidos
                        para esta empresa.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {data.loans.map((loan) => {
                          const unpaidRows = (loan.schedule || []).filter(
                            (r) => !r.paid,
                          );
                          const unpaidSum = unpaidRows.reduce(
                            (acc, r) => acc + r.payment,
                            0,
                          );
                          const unpaidPrincipal = unpaidRows.reduce(
                            (acc, r) => acc + r.principal,
                            0,
                          );
                          const paidCount = loan.termMonths - unpaidRows.length;

                          return (
                            <div
                              key={loan.id}
                              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      Préstamo Bancario
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">
                                      Ref: #{loan.id}
                                    </span>
                                  </div>
                                  <h4 className="text-base font-black text-slate-900 mt-1">
                                    {loan.collateral.propertyTitle ||
                                      "Garantía Inmobiliaria"}
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Superficie:{" "}
                                    {loan.collateral.surfaceM2 || "—"} m² •
                                    Valor de Tasación:{" "}
                                    {formatNumber(
                                      loan.collateral.appraisalValue,
                                    )}{" "}
                                    €
                                  </p>
                                </div>

                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                    Deuda Pendiente en Cuotas
                                  </span>
                                  <div className="text-lg font-black text-red-700">
                                    {formatNumber(unpaidSum)} €
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                    Capital Otorgado
                                  </span>
                                  <span className="font-extrabold text-slate-900">
                                    {formatNumber(loan.offeredAmount)} €
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                    Capital Vivo Pendiente
                                  </span>
                                  <span className="font-extrabold text-slate-900">
                                    {formatNumber(unpaidPrincipal)} €
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                    Cuota Mensual
                                  </span>
                                  <span className="font-extrabold text-slate-900">
                                    {formatNumber(loan.monthlyPayment)} €/mes
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">
                                    Interés y Plazo
                                  </span>
                                  <span className="font-extrabold text-slate-900">
                                    {loan.annualInterestRate}% • {paidCount}/
                                    {loan.termMonths} pagadas
                                  </span>
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
                                  <span>
                                    Ver Cuadro de Amortización Completo
                                  </span>
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
                {(debtFilterOrigin === "all" ||
                  debtFilterOrigin === "obligations") && (
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

                    {data.obligations.filter((o) => o.type !== "cuota_alquiler")
                      .length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen pagarés ni letras de cambio pendientes de
                        vencimiento.
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
                              .filter((o) => o.type !== "cuota_alquiler")
                              .sort(
                                (a, b) =>
                                  new Date(a.dueDate).getTime() -
                                  new Date(b.dueDate).getTime(),
                              )
                              .map((ob) => {
                                const isPaid = ob.status === "pagado";

                                return (
                                  <tr
                                    key={ob.id}
                                    className="hover:bg-slate-50 transition"
                                  >
                                    <td className="p-3 font-bold text-slate-800">
                                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] uppercase font-bold">
                                        {ob.type === "pagare"
                                          ? "Pagaré"
                                          : "Letra de Cambio"}
                                      </span>
                                    </td>
                                    <td className="p-3 text-slate-900 font-bold">
                                      {ob.propertyTitle}
                                    </td>
                                    <td className="p-3 text-slate-600">
                                      Cuota {ob.installmentNumber || 1} /{" "}
                                      {ob.totalInstallments || 12}
                                    </td>
                                    <td className="p-3 font-black text-slate-900 text-sm">
                                      {formatNumber(ob.amount)} €
                                    </td>
                                    <td className="p-3 font-mono text-slate-700">
                                      {new Date(ob.dueDate).toLocaleDateString(
                                        "es-ES",
                                      )}
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
                                      {!isPaid &&
                                        (new Date(ob.dueDate) <= new Date() ||
                                          ob.status === "vencido") && (
                                          <button
                                            disabled={
                                              payingObligationId === ob.id
                                            }
                                            onClick={() =>
                                              handlePayObligation(ob.id)
                                            }
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                          >
                                            {payingObligationId === ob.id && (
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                            )}
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
                {(debtFilterOrigin === "all" ||
                  debtFilterOrigin === "rent") && (
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

                    {data.obligations.filter((o) => o.type === "cuota_alquiler")
                      .length === 0 ? (
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
                              .filter((o) => o.type === "cuota_alquiler")
                              .sort(
                                (a, b) =>
                                  new Date(a.dueDate).getTime() -
                                  new Date(b.dueDate).getTime(),
                              )
                              .map((ob) => {
                                const isPaid = ob.status === "pagado";

                                return (
                                  <tr
                                    key={ob.id}
                                    className="hover:bg-slate-50 transition"
                                  >
                                    <td className="p-3 text-slate-900 font-bold">
                                      {ob.propertyTitle}
                                    </td>
                                    <td className="p-3 text-slate-600">
                                      Cuota {ob.installmentNumber || 1} /{" "}
                                      {ob.totalInstallments || 12}
                                    </td>
                                    <td className="p-3 font-black text-slate-900 text-sm">
                                      {formatNumber(ob.amount)} €
                                    </td>
                                    <td className="p-3 font-mono text-slate-700">
                                      {new Date(ob.dueDate).toLocaleDateString(
                                        "es-ES",
                                      )}
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
                                      {!isPaid &&
                                        (new Date(ob.dueDate) <= new Date() ||
                                          ob.status === "vencido") && (
                                          <button
                                            disabled={
                                              payingObligationId === ob.id
                                            }
                                            onClick={() =>
                                              handlePayObligation(ob.id)
                                            }
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                          >
                                            {payingObligationId === ob.id && (
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                            )}
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
                * Las cuotas de alquiler son gastos corrientes pagados por
                adelantado y no figuran como deudas financieras.
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
              const itemTitle =
                item.propertyTitle || item.title || "Detalle de elemento";
              const itemSubtitle = isMachinery
                ? `${item.optionTitle || "Línea de producción"} • Instalado en ${item.installationNaveTitle || "Nave Industrial"}`
                : `${item.location || "Ubicación no especificada"} • ${item.operation === "compra" ? "Inmueble en propiedad" : "Contrato de arrendamiento"}`;

              return (
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-2xl border ${
                        isMachinery
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {isMachinery ? (
                        <Wrench className="w-6 h-6" />
                      ) : (
                        <Building2 className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white">
                        {itemTitle}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium">
                        {itemSubtitle}
                      </p>
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
                const propObs = data.obligations.filter(
                  (o) =>
                    (item.id &&
                      (o.propertyId === item.id ||
                        o.acquisitionId === item.id)) ||
                    (item.propertyId && o.propertyId === item.propertyId) ||
                    (item.propertyTitle &&
                      o.propertyTitle === item.propertyTitle) ||
                    (item.title && o.propertyTitle === item.title) ||
                    (item.optionTitle && o.propertyTitle === item.optionTitle),
                );
                const paidObs = propObs.filter((o) => o.status === "pagado");
                const pendingObs = propObs.filter(
                  (o) => o.status === "pendiente" || o.status === "vencido",
                );

                const totalPaid =
                  paidObs.reduce((acc, o) => acc + o.amount, 0) +
                  (item.paymentMethod === "contado"
                    ? item.totalPrice || item.basePrice || 0
                    : 0);
                const totalPending = pendingObs.reduce(
                  (acc, o) => acc + o.amount,
                  0,
                );

                const isMachinery = !!item.title && !item.propertyTitle;

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                          Importe / Inversión
                        </span>
                        <div className="text-lg font-black text-slate-900">
                          {item.operation === "alquiler"
                            ? `${formatNumber(item.monthlyRent || item.totalPrice || 0)} €/mes`
                            : `${formatNumber(item.totalPrice || item.basePrice || 0)} €`}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          {item.operation === "alquiler"
                            ? "Renta mensual de alquiler"
                            : "Inversión total de adquisición"}
                        </span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">
                          Pagos realizados
                        </span>
                        <div className="text-lg font-black text-emerald-800">
                          {formatNumber(totalPaid)} €
                        </div>
                        <span className="text-[10px] text-emerald-700 mt-0.5 block">
                          {item.paymentMethod === "contado"
                            ? "100% abonado al contado"
                            : `${paidObs.length} cuota(s) abonadas`}
                        </span>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">
                          Pagos pendientes
                        </span>
                        <div className="text-lg font-black text-amber-900">
                          {formatNumber(totalPending)} €
                        </div>
                        <span className="text-[10px] text-amber-800 mt-0.5 block">
                          {pendingObs.length} cuota(s) pendientes
                        </span>
                      </div>
                    </div>

                    {/* Installments Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="p-3.5 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
                        <span>
                          {isMachinery
                            ? "Historial y plan de pagarés de la maquinaria"
                            : "Historial y plan de pagos del inmueble"}
                        </span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {propObs.length} registros
                        </span>
                      </div>

                      {propObs.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">
                          {item.paymentMethod === "contado"
                            ? "Abonado en su totalidad al contado en la fecha de la transacción."
                            : "No hay cuotas ni pagarés pendientes registrados para este elemento."}
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
                                const isPaid = ob.status === "pagado";
                                return (
                                  <tr
                                    key={ob.id}
                                    className="hover:bg-slate-50/80 transition"
                                  >
                                    <td className="p-3">
                                      <span className="font-bold text-slate-800 block">
                                        {ob.type === "cuota_alquiler"
                                          ? "Renta de alquiler"
                                          : ob.type === "pagare"
                                            ? "Pagaré"
                                            : "Letra de cambio"}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Cuota {ob.installmentNumber || 1} de{" "}
                                        {ob.totalInstallments || 1}
                                      </span>
                                    </td>
                                    <td className="p-3 font-bold text-slate-900 font-mono">
                                      {formatNumber(ob.amount)} €
                                    </td>
                                    <td className="p-3 text-slate-600 font-mono">
                                      {new Date(ob.dueDate).toLocaleDateString(
                                        "es-ES",
                                      )}
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
                                      {!isPaid &&
                                        (new Date(ob.dueDate) <= new Date() ||
                                          ob.status === "vencido") && (
                                          <button
                                            disabled={
                                              payingObligationId === ob.id
                                            }
                                            onClick={() =>
                                              handlePayObligation(ob.id)
                                            }
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                          >
                                            {payingObligationId === ob.id && (
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                            )}
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

      {/* NAVE FLOOR PLAN MODAL */}
      {selectedNaveForFloorPlan && (
        <NaveFloorPlanViewer
          acquisition={selectedNaveForFloorPlan}
          studentMachinery={(data.machineryAcquisitions || []).filter((m) => {
            const naveIdStr = String(selectedNaveForFloorPlan.id);
            const propIdStr = String(selectedNaveForFloorPlan.propertyId || "");
            const naveTitleLower = (
              selectedNaveForFloorPlan.propertyTitle || ""
            )
              .toLowerCase()
              .trim();

            const instId = String(
              m.installedAtNaveId ||
                m.installationNaveId ||
                m.installedNaveId ||
                "",
            );
            const instTitle = (
              m.installationNaveTitle ||
              m.installedAtNaveTitle ||
              m.installedNaveTitle ||
              ""
            )
              .toLowerCase()
              .trim();

            return (
              (instId && (instId === naveIdStr || instId === propIdStr)) ||
              (instTitle && naveTitleLower && instTitle === naveTitleLower)
            );
          })}
          existingFloorPlan={naveFloorPlans.find(
            (fp) =>
              (fp.propertyId &&
                (String(fp.propertyId) ===
                  String(selectedNaveForFloorPlan.propertyId) ||
                  String(fp.propertyId) ===
                    String(selectedNaveForFloorPlan.id))) ||
              (fp.acquisitionId &&
                String(fp.acquisitionId) ===
                  String(selectedNaveForFloorPlan.id)) ||
              (fp.propertyTitle &&
                selectedNaveForFloorPlan.propertyTitle &&
                fp.propertyTitle.toLowerCase().trim() ===
                  selectedNaveForFloorPlan.propertyTitle.toLowerCase().trim()),
          )}
          onSave={handleSaveFloorPlan}
          onClose={() => setSelectedNaveForFloorPlan(null)}
        />
      )}

      {/* MACHINERY STATUS EXPLANATION MODAL */}
      {showMachineryInfoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Estados de la Maquinaria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Requisitos para la producción industrial
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMachineryInfoModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600">
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                    En Montaje / Pausado
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed mt-1">
                  Tras adquirir la maquinaria, requiere{" "}
                  <strong>8 horas de montaje</strong>. Es imprescindible contar
                  con un <strong>contrato eléctrico activo</strong> para que el
                  periodo de montaje transcurra.
                </p>
              </div>

              <div className="p-3.5 bg-slate-100 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-200 text-slate-800 border border-slate-300">
                    Operativa - Apagada
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed mt-1">
                  La maquinaria se especifica como <strong>operativa-apagada</strong> en los turnos en los que no se encuentre produciendo o no se cumplan los requisitos operacionales:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 mt-1">
                  <li>
                    <strong>Operarios:</strong> Mínimo 2 operarios asignados a la máquina por turno.
                  </li>
                  <li>
                    <strong>Carretilla elevadora:</strong> Tener en propiedad al menos 1 carretilla elevadora contrapesada en la nave.
                  </li>
                  <li>
                    <strong>Materias primas y Electricidad:</strong> Disponer de insumos de fabricación y contrato eléctrico activo.
                  </li>
                </ul>
              </div>

              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Operativa - Encendida
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed mt-1">
                  La maquinaria se especifica como <strong>operativa-encendida</strong> únicamente en los turnos que se encuentran produciendo (con al menos 2 operarios asignados, carretilla elevadora, contrato eléctrico activo y materias primas suficientes).
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setShowMachineryInfoModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MACHINERY RELOCATION MODAL */}
      {relocateModalMachinery && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Trasladar Maquinaria
                  </h3>
                  <p className="text-xs text-slate-500">
                    {relocateModalMachinery.lineTitle ||
                      relocateModalMachinery.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRelocateModalMachinery(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                <p>
                  Ubicación Actual:{" "}
                  <strong>
                    {relocateModalMachinery.installationNaveTitle ||
                      relocateModalMachinery.installedAtNaveTitle ||
                      relocateModalMachinery.installedNaveTitle ||
                      "Nave Industrial de Origen"}
                  </strong>
                </p>
                <p className="text-[11px] text-slate-500">
                  Capacidad:{" "}
                  {relocateModalMachinery.productionCapacityUnitsPerHour || 360}{" "}
                  unid / hora
                </p>
              </div>

              {relocateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{relocateError}</span>
                </div>
              )}

              {relocateSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{relocateSuccess}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Selecciona la Nave Industrial de Destino:
                </label>
                <select
                  value={targetRelocateNaveId}
                  onChange={(e) => {
                    setTargetRelocateNaveId(e.target.value);
                    setRelocateError(null);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Selecciona una Nave Industrial --</option>
                  {(data.acquisitions || [])
                    .filter(
                      (a) =>
                        a.propertyType === "nave_industrial" ||
                        a.propertyType === "nave",
                    )
                    .map((nave) => {
                      const hasElectricity = electricityContracts.some(
                        (e) =>
                          e.status === "active" &&
                          (String(e.propertyId) === String(nave.propertyId) ||
                            String(e.propertyId) === String(nave.id) ||
                            (e.propertyTitle &&
                              nave.propertyTitle &&
                              e.propertyTitle.toLowerCase().trim() ===
                                nave.propertyTitle.toLowerCase().trim())),
                      );

                      const isCurrent =
                        String(nave.id) ===
                          String(relocateModalMachinery.installedAtNaveId) ||
                        String(nave.propertyId) ===
                          String(relocateModalMachinery.installedAtNaveId) ||
                        (nave.propertyTitle &&
                          relocateModalMachinery.installationNaveTitle &&
                          nave.propertyTitle.toLowerCase().trim() ===
                            relocateModalMachinery.installationNaveTitle
                              .toLowerCase()
                              .trim());

                      return (
                        <option
                          key={nave.id}
                          value={nave.id}
                          disabled={isCurrent}
                        >
                          {nave.propertyTitle} ({nave.surfaceM2} m²) -{" "}
                          {isCurrent
                            ? "Ubicación actual"
                            : hasElectricity
                              ? "⚡ Luz Contratada"
                              : "⚠️ Sin Luz Contratada"}
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Electricity status indicator for chosen target nave */}
              {targetRelocateNaveId &&
                (() => {
                  const selectedNave = (data.acquisitions || []).find(
                    (a) => String(a.id) === String(targetRelocateNaveId),
                  );
                  if (!selectedNave) return null;

                  const hasElectricity = electricityContracts.some(
                    (e) =>
                      e.status === "active" &&
                      (String(e.propertyId) ===
                        String(selectedNave.propertyId) ||
                        String(e.propertyId) === String(selectedNave.id) ||
                        (e.propertyTitle &&
                          selectedNave.propertyTitle &&
                          e.propertyTitle.toLowerCase().trim() ===
                            selectedNave.propertyTitle.toLowerCase().trim())),
                  );

                  if (!hasElectricity) {
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[11px] space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Requisito Incumplido: Sin Luz Contratada</span>
                        </div>
                        <p>
                          Para poder trasladar maquinaria a{" "}
                          <strong>{selectedNave.propertyTitle}</strong>, debes
                          contratar primero la potencia eléctrica en el apartado
                          de Energía.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-[11px] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Nave apta: Luz contratada activa en{" "}
                        <strong>{selectedNave.propertyTitle}</strong>.
                      </span>
                    </div>
                  );
                })()}

              {/* Cost breakdown for chosen target nave */}
              {targetRelocateNaveId &&
                (() => {
                  const selectedNave = (data.acquisitions || []).find(
                    (a) => String(a.id) === String(targetRelocateNaveId),
                  );
                  if (!selectedNave) return null;

                  const sourceTitle =
                    relocateModalMachinery.installationNaveTitle ||
                    relocateModalMachinery.installedAtNaveTitle ||
                    "";
                  const targetTitle = selectedNave.propertyTitle || "";
                  let distanceKm = 15;
                  if (sourceTitle && targetTitle) {
                    const hash = Math.abs(
                      (sourceTitle.length * 7 + targetTitle.length * 13) % 45,
                    );
                    distanceKm = 10 + hash;
                  }
                  const disassemblyFee = 1500;
                  const transportFee = Math.round(distanceKm * 28 + 350);
                  const reassemblyFee = 1800;
                  const subtotal =
                    disassemblyFee + transportFee + reassemblyFee;
                  const ivaAmount = Math.round(subtotal * 0.21 * 100) / 100;
                  const totalCost =
                    Math.round((subtotal + ivaAmount) * 100) / 100;

                  const currentBalance =
                    currentUser.balance ??
                    data.company?.balance ??
                    data.summary?.bankBalance ??
                    data.balance ??
                    0;
                  const canAfford = currentBalance >= totalCost;

                  return (
                    <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2">
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-slate-800 block">
                        Presupuesto Oficial del Traslado ({distanceKm} km)
                      </span>
                      <div className="space-y-1 text-[11px] font-mono text-slate-700">
                        <div className="flex justify-between">
                          <span>Desmontaje técnico:</span>
                          <span>{formatNumber(disassemblyFee)} €</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transporte góndola ({distanceKm} km):</span>
                          <span>{formatNumber(transportFee)} €</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Remontaje y nivelación:</span>
                          <span>{formatNumber(reassemblyFee)} €</span>
                        </div>
                        <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-200">
                          <span>Subtotal:</span>
                          <span>{formatNumber(subtotal)} €</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>IVA (21%):</span>
                          <span>+{formatNumber(ivaAmount)} €</span>
                        </div>
                        <div className="flex justify-between font-bold text-xs text-indigo-900 pt-1 border-t border-slate-300">
                          <span>TOTAL FACTURA A PAGAR:</span>
                          <span>{formatNumber(totalCost)} €</span>
                        </div>
                      </div>

                      {!canAfford && (
                        <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[10px] font-bold flex items-center gap-1.5 mt-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>
                            Saldo insuficiente en cuenta (
                            {formatNumber(currentBalance)} €). Necesitas{" "}
                            {formatNumber(totalCost)} €.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 space-y-1">
                <span className="font-bold block">Normativa de Traslado:</span>
                <p>
                  • <strong>Desmontaje:</strong> 4 horas reales en la nave de
                  origen.
                </p>
                <p>
                  • <strong>Remontaje:</strong> 4 horas reales en la nave de
                  destino.
                </p>
                <p>
                  • <strong>Total:</strong> 8 horas reales de inactividad
                  durante la mudanza.
                </p>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRelocateModalMachinery(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!targetRelocateNaveId || isRelocatingSubmitting}
                onClick={handleConfirmRelocation}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isRelocatingSubmitting && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Iniciar Traslado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Stock Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 max-w-lg w-full my-auto max-h-[90vh] flex flex-col rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 text-slate-900 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4 shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  {transferMode === 'nave'
                    ? 'Traslado de Existencias entre Mis Almacenes / Naves'
                    : 'Envío de Existencias a otro Alumno'}
                </h3>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain text-xs" style={{ maxHeight: 'calc(90vh - 135px)' }}>
              {/* Selector Mode Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setTransferMode('alumno')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                    transferMode === 'alumno'
                      ? 'bg-white text-indigo-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  A otro Alumno / Empresa
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode('nave')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                    transferMode === 'nave'
                      ? 'bg-white text-indigo-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Entre Mis Propios Almacenes
                </button>
              </div>

              {transferError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{transferError}</span>
                </div>
              )}

              {transferSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{transferSuccess}</span>
                </div>
              )}

              {transferMode === 'alumno' ? (
                /* Select Recipient via Search Input & Autocomplete */
                <div className="relative">
                  <label className="block font-bold text-slate-700 mb-1">
                    Alumno / Empresa Destinatario
                  </label>
                  {selectedRecipient ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div>
                          <span className="font-bold text-indigo-950 text-xs block">
                            {selectedRecipient.name}
                          </span>
                          <span className="text-[11px] text-indigo-700 block">
                            Nivel {selectedRecipient.level} • @
                            {selectedRecipient.username}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecipient(null);
                            setTransferRecipientId("");
                            setTransferDestinationNaveId("");
                            setRecipientSearch("");
                            setShowRecipientDropdown(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition"
                        >
                          Cambiar
                        </button>
                      </div>

                      {selectedRecipient.warehouses && selectedRecipient.warehouses.length > 0 && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                            <span>Inmueble / Almacén de Destino:</span>
                            {selectedRecipient.warehouses.length > 1 && (
                              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                ⚠️ {selectedRecipient.warehouses.length} almacenes disponibles
                              </span>
                            )}
                          </label>
                          <select
                            value={transferDestinationNaveId}
                            onChange={(e) => setTransferDestinationNaveId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {selectedRecipient.warehouses.map((w: any) => (
                              <option key={w.id} value={w.id}>
                                {w.title} ({w.address}) {w.hasForklift !== undefined ? (w.hasForklift ? '— 🚜 [Carretilla OK]' : '— ⚠️ [Falta Carretilla]') : ''}
                              </option>
                            ))}
                          </select>
                          {(() => {
                            const selectedWh: any = selectedRecipient.warehouses.find((w: any) => String(w.id) === String(transferDestinationNaveId)) || selectedRecipient.warehouses[0];
                            if (selectedWh && selectedWh.hasForklift === false) {
                              return (
                                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-1.5 mt-1">
                                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                  <span>⚠️ El alumno destinatario no tiene asignada una carretilla elevadora a este almacén.</span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        placeholder="Escribe el nombre o usuario del alumno destinatario (ej: Cliente 12)..."
                        value={recipientSearch}
                        onChange={(e) => {
                          setRecipientSearch(e.target.value);
                          setShowRecipientDropdown(true);
                        }}
                        onFocus={() => setShowRecipientDropdown(true)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                      {showRecipientDropdown &&
                        recipientSearch.trim().length > 0 && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                            {(() => {
                              const query = recipientSearch.toLowerCase().trim();
                              const matches = studentsList.filter(
                                (st) =>
                                  st.name.toLowerCase().includes(query) ||
                                  st.username.toLowerCase().includes(query),
                              );

                              if (matches.length === 0) {
                                return (
                                  <div className="p-3 text-slate-400 italic text-center">
                                    No se encontró ningún alumno con "
                                    {recipientSearch}"
                                  </div>
                                );
                              }

                              return matches.map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRecipient(st);
                                    setTransferRecipientId(st.id);
                                    if (st.warehouses && st.warehouses.length > 0) {
                                      setTransferDestinationNaveId(st.warehouses[0].id);
                                    } else {
                                      setTransferDestinationNaveId('');
                                    }
                                    setRecipientSearch(
                                      `${st.name} (@${st.username})`,
                                    );
                                    setShowRecipientDropdown(false);
                                  }}
                                  className="w-full text-left p-3 hover:bg-indigo-50 transition flex items-center justify-between group"
                                >
                                  <div>
                                    <span className="font-bold text-slate-900 group-hover:text-indigo-900 block">
                                      {st.name}
                                    </span>
                                    <span className="text-[11px] text-slate-500 block">
                                      @{st.username}
                                    </span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                    Nivel {st.level}
                                  </span>
                                </button>
                              ));
                            })()}
                          </div>
                        )}
                    </div>
                  )}

                  {/* Sender Origin Warehouse Selection for Student Transfer */}
                  {(() => {
                    const userNaves = (data?.acquisitions || []).filter(a =>
                      ['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
                      (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
                      (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
                      (a.propertyTitle || a.title || '').toLowerCase().includes('almacen')
                    );

                    if (userNaves.length === 0) return null;

                    const checkNaveHasForklift = (n: any) => {
                      const naveIdStr = String(n.id || n.propertyId);
                      return (data?.purchasedVehicles || []).some(
                        (v) =>
                          v.vehicleType === 'carretilla_elevadora' &&
                          (String(v.assignedPropertyId) === naveIdStr ||
                            (userNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null)))
                      );
                    };

                    const selectedOriginNave = userNaves.find((n) => n.id === fromNaveId) || userNaves[0];
                    const originHasForklift = selectedOriginNave ? checkNaveHasForklift(selectedOriginNave) : true;

                    return (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-slate-700 text-xs">
                            Nave / Almacén de Origen (desde donde envías)
                          </label>
                          {userNaves.length > 1 && (
                            <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                              {userNaves.length} almacenes propios
                            </span>
                          )}
                        </div>
                        <select
                          value={fromNaveId}
                          onChange={(e) => setFromNaveId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                        >
                          {userNaves.map((n) => {
                            const hasF = checkNaveHasForklift(n);
                            return (
                              <option key={n.id} value={n.id}>
                                {n.propertyTitle || n.title || `Nave ${n.id}`} ({n.location || 'Polígono'}) {hasF ? '— 🚜 [Carretilla OK]' : '— ⚠️ [Falta Carretilla]'}
                              </option>
                            );
                          })}
                        </select>
                        {!originHasForklift && selectedOriginNave && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              ⚠️ Tu almacén de origen no tiene asignada ninguna carretilla elevadora contrapesada. Asigna una carretilla a esta nave desde la Gestión de Flotas / Concesionario para poder cargar y expedir mercancías.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Select Source and Destination Naves */
                (() => {
                  const userNaves = (data?.acquisitions || []).filter(a =>
                    ['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
                    (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
                    (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
                    (a.propertyTitle || a.title || '').toLowerCase().includes('almacen')
                  );

                  if (userNaves.length < 2) {
                    return (
                      <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
                        <span className="font-bold block flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          Se requieren al menos dos almacenes o naves
                        </span>
                        <p className="text-[11px] text-amber-800">
                          Para trasladar materias primas o productos entre tus propios almacenes necesitas disponer de al menos dos naves industriales o almacenes logísticos.
                        </p>
                      </div>
                    );
                  }

                  const checkNaveHasForklift = (n: any) => {
                    const naveIdStr = String(n.id || n.propertyId);
                    return (data?.purchasedVehicles || []).some(
                      (v) =>
                        v.vehicleType === 'carretilla_elevadora' &&
                        (String(v.assignedPropertyId) === naveIdStr ||
                          (userNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null)))
                    );
                  };

                  const selectedTargetNave = userNaves.find((n) => n.id === toNaveId) || userNaves.filter((n) => n.id !== fromNaveId)[0];
                  const targetHasForklift = selectedTargetNave ? checkNaveHasForklift(selectedTargetNave) : true;

                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Nave / Almacén de Origen
                          </label>
                          <select
                            value={fromNaveId}
                            onChange={(e) => setFromNaveId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                          >
                            {userNaves.map((n) => {
                              const hasF = checkNaveHasForklift(n);
                              return (
                                <option key={n.id} value={n.id}>
                                  {n.propertyTitle || n.title || `Nave ${n.id}`} ({n.location || 'Polígono'}) {hasF ? '— 🚜 [Carretilla OK]' : '— ⚠️ [Falta Carretilla]'}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Nave / Almacén de Destino
                          </label>
                          <select
                            value={toNaveId}
                            onChange={(e) => setToNaveId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                          >
                            {userNaves
                              .filter((n) => n.id !== fromNaveId)
                              .map((n) => {
                                const hasF = checkNaveHasForklift(n);
                                return (
                                  <option key={n.id} value={n.id}>
                                    {n.propertyTitle || n.title || `Nave ${n.id}`} ({n.location || 'Polígono'}) {hasF ? '— 🚜 [Carretilla OK]' : '— ⚠️ [Falta Carretilla]'}
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      </div>

                      {!targetHasForklift && selectedTargetNave && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>
                            ⚠️ Tu almacén de destino no tiene asignada ninguna carretilla elevadora contrapesada. Asigna una carretilla a esta nave desde la Gestión de Flotas / Concesionario para realizar el traslado.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Select Item */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tipo de Existencia / Producto a Enviar
                </label>
                <select
                  value={transferItemKey}
                  onChange={(e) => setTransferItemKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  {(() => {
                    const fromNaveInv = fromNaveId
                      ? (inventoryData?.inventory?.naveInventories?.[fromNaveId] || null)
                      : null;

                    let varillasEstrellaStock = 0;
                    let varillasPlanaStock = 0;
                    let destEstrellaStock = 0;
                    let destPlanaStock = 0;
                    let ironKgStock = 0;
                    let metalKgStock = 0;
                    let plasticKgStock = 0;
                    let epoxiKgStock = 0;

                    if (fromNaveInv) {
                      ironKgStock = fromNaveInv.ironKg || 0;
                      metalKgStock = fromNaveInv.metalKg || 0;
                      plasticKgStock = fromNaveInv.plasticKg || 0;
                      epoxiKgStock = fromNaveInv.epoxiKg || 0;
                      varillasEstrellaStock = (fromNaveInv as any).producedStarRodsUnits ?? (fromNaveInv as any).producedIronRodsUnits ?? 0;
                      varillasPlanaStock = (fromNaveInv as any).producedFlatRodsUnits ?? (fromNaveInv as any).producedMetalRodsUnits ?? 0;
                      destEstrellaStock = (fromNaveInv as any).starScrewdriversUnits ?? (fromNaveInv as any).ironScrewdriversUnits ?? 0;
                      destPlanaStock = (fromNaveInv as any).flatScrewdriversUnits ?? (fromNaveInv as any).metalScrewdriversUnits ?? 0;
                    } else {
                      varillasEstrellaStock =
                        inventoryData?.producedGoods?.varillas_punta_estrella ??
                        inventoryData?.producedGoods?.varillas_hierro_punta ??
                        inventoryData?.inventory?.producedStarRodsUnits ??
                        inventoryData?.inventory?.producedIronRodsUnits ??
                        0;
                      varillasPlanaStock =
                        inventoryData?.producedGoods?.varillas_punta_plana ??
                        inventoryData?.producedGoods?.varillas_metal_punta ??
                        inventoryData?.inventory?.producedFlatRodsUnits ??
                        inventoryData?.inventory?.producedMetalRodsUnits ??
                        0;

                      if (inventoryData?.producedGoods) {
                        destEstrellaStock =
                          inventoryData.producedGoods.destornilladores_punta_estrella ??
                          inventoryData.producedGoods.destornilladores_hierro ??
                          (inventoryData.inventory as any)?.starScrewdriversUnits ??
                          (inventoryData.inventory as any)?.ironScrewdriversUnits ??
                          0;
                        destPlanaStock =
                          inventoryData.producedGoods.destornilladores_punta_plana ??
                          inventoryData.producedGoods.destornilladores_metal ??
                          (inventoryData.inventory as any)?.flatScrewdriversUnits ??
                          (inventoryData.inventory as any)?.metalScrewdriversUnits ??
                          0;
                        if (
                          inventoryData.producedGoods.producedScrewdriversUnits &&
                          destEstrellaStock === 0 &&
                          destPlanaStock === 0
                        ) {
                          destEstrellaStock =
                            inventoryData.producedGoods.producedScrewdriversUnits;
                        }
                      } else {
                        const deliveredBoughtOrders = (userOrders || []).filter(
                          (o) =>
                            o.studentId === currentUser.id &&
                            ["entregado", "finalizado", "facturado"].includes(
                              o.status,
                            ),
                        );

                        deliveredBoughtOrders.forEach((ord) => {
                          if (ord.items && ord.items.length > 0) {
                            ord.items.forEach((it) => {
                              const titleLower = (
                                it.materialTitle ||
                                it.title ||
                                ""
                              ).toLowerCase();
                              if (
                                titleLower.includes("plana") ||
                                titleLower.includes("metal") ||
                                it.materialType === "metal"
                              ) {
                                destPlanaStock += it.quantity || 0;
                              } else {
                                destEstrellaStock += it.quantity || 0;
                              }
                            });
                          } else {
                            const titleLower = (
                              ord.materialTitle || ""
                            ).toLowerCase();
                            if (
                              titleLower.includes("plana") ||
                              titleLower.includes("metal") ||
                              ord.materialType === "metal"
                            ) {
                              destPlanaStock += ord.quantity || 0;
                            } else {
                              destEstrellaStock += ord.quantity || 0;
                            }
                          }
                        });
                      }

                      ironKgStock =
                        inventoryData?.rawMaterials?.fragmentos_hierro_kg ??
                        inventoryData?.inventory?.ironKg ??
                        0;
                      metalKgStock =
                        inventoryData?.rawMaterials?.fragmentos_metal_kg ??
                        inventoryData?.inventory?.metalKg ??
                        0;
                      plasticKgStock =
                        inventoryData?.rawMaterials?.pellets_plastico_kg ??
                        inventoryData?.inventory?.plasticKg ??
                        0;
                      epoxiKgStock =
                        inventoryData?.rawMaterials?.pegamento_epoxi_kg ??
                        inventoryData?.inventory?.epoxiKg ??
                        0;
                    }

                    const isLevel1 = currentUser.level === 1;

                    if (isLevel1) {
                      return (
                        <>
                          <option value="ironKg">
                            Fragmentos de Hierro (Stock:{" "}
                            {formatNumber(ironKgStock)} kg)
                          </option>
                          <option value="plasticKg">
                            Pellets de Plástico (Stock:{" "}
                            {formatNumber(plasticKgStock)} kg)
                          </option>
                          <option value="epoxiKg">
                            Pegamento Epoxi (Stock: {formatNumber(epoxiKgStock)}{" "}
                            kg)
                          </option>
                          <option value="varillas_punta_estrella">
                            Varillas con Punta Estrella (Stock:{" "}
                            {formatNumber(varillasEstrellaStock, 0)} u.)
                          </option>
                          <option value="varillas_punta_plana">
                            Varillas con Punta Plana (Stock:{" "}
                            {formatNumber(varillasPlanaStock, 0)} u.)
                          </option>
                          <option value="destornilladores_punta_estrella">
                            Destornilladores con Punta Estrella (Stock:{" "}
                            {formatNumber(destEstrellaStock, 0)} u.)
                          </option>
                          <option value="destornilladores_punta_plana">
                            Destornilladores con Punta Plana (Stock:{" "}
                            {formatNumber(destPlanaStock, 0)} u.)
                          </option>
                        </>
                      );
                    }

                    return (
                      <>
                        <option value="destornilladores_punta_estrella">
                          Destornilladores con Punta Estrella (Stock:{" "}
                          {formatNumber(destEstrellaStock, 0)} u.)
                        </option>
                        <option value="destornilladores_punta_plana">
                          Destornilladores con Punta Plana (Stock:{" "}
                          {formatNumber(destPlanaStock, 0)} u.)
                        </option>
                      </>
                    );
                  })()}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Cantidad a Enviar
                </label>
                <input
                  type="number"
                  min="1"
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              {/* Transport Method */}
              <div>
                <label className="block font-bold text-slate-700 mb-2">
                  Método de Transporte Logístico
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      transferTransportMethod === "exterior"
                        ? "bg-indigo-50 border-indigo-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="transportMethod"
                      value="exterior"
                      checked={transferTransportMethod === "exterior"}
                      onChange={() => setTransferTransportMethod("exterior")}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-bold block text-slate-900">
                        Servicio Exterior de Transporte
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Contratación de logística externa con tarifa según
                        volumen (mínimo 35 € cargos de gestión). Se abonará
                        desde la cuenta bancaria.
                      </span>
                    </div>
                  </label>

                  {(() => {
                    const userVehicles = data?.purchasedVehicles || [];
                    const userEmployees = data?.hiredEmployees || [];
                    const hasTruck = userVehicles.some(
                      (v) =>
                        v.vehicleType === "camion_trailer" ||
                        v.vehicleType === "camion_ligero" ||
                        v.vehicleType === "camion" ||
                        (v.vehicleType || "").toLowerCase().includes("camion"),
                    );
                    const hasTruckDriver = userEmployees.some(
                      (e) => e.role === "camionero" || e.role === "conductor",
                    );
                    const canUsePropio = hasTruck && hasTruckDriver;

                    return (
                      <label
                        className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                          !canUsePropio
                            ? "bg-slate-100/60 border-slate-200 opacity-75 cursor-not-allowed"
                            : transferTransportMethod === "propio"
                              ? "bg-indigo-50 border-indigo-300 cursor-pointer"
                              : "bg-slate-50 border-slate-200 cursor-pointer"
                        }`}
                      >
                        <input
                          type="radio"
                          name="transportMethod"
                          value="propio"
                          disabled={!canUsePropio}
                          checked={transferTransportMethod === "propio"}
                          onChange={() =>
                            canUsePropio && setTransferTransportMethod("propio")
                          }
                          className="mt-0.5 text-indigo-600 disabled:cursor-not-allowed"
                        />
                        <div>
                          <span className="font-bold block text-slate-900">
                            Usar Transporte Propio de Empresa
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            Envío utilizando camión y chofer propio en plantilla. Sin costes ni gastos de servicio de transporte. Únicamente se adeudará el gasto de suministro por la gasolina consumida según la distancia entre el almacén de origen y el de destino.
                          </span>
                          {!canUsePropio && (
                            <div className="text-[11px] text-amber-700 font-bold mt-1 bg-amber-50 p-2 rounded-lg border border-amber-200 space-y-0.5">
                              <span>
                                ⚠️ Requisitos no cumplidos para transporte
                                propio:
                              </span>
                              {!hasTruck && (
                                <p>
                                  • No dispones de ningún Camión en tu
                                  flota de vehículos.
                                </p>
                              )}
                              {!hasTruckDriver && (
                                <p>
                                  • No tienes ningún Conductor / Camionero
                                  contratado en tu plantilla.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Action Buttons (Fixed Footer) */}
            <div className="flex gap-3 p-4 pt-3 border-t border-slate-100 bg-slate-50/80 shrink-0 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={isTransferring}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
              >
                {isTransferring && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Confirmar y Enviar Existencias</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
