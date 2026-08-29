export interface MarketRequirementsCheckResult {
  met: boolean;
  hasTelecomContract: boolean;
  hasOfficeDevice: boolean;
  hasWarehouse: boolean;
  hasElectricityInWarehouse: boolean;
  hasForklift: boolean;
  hasWarehouseWorker: boolean;
  details: {
    telecomContracts: any[];
    officeOrders: any[];
    acquisitions: any[];
    electricityContracts: any[];
    purchasedVehicles: any[];
    employees: any[];
  };
}

export function getStoredMarketRequirementsMet(userId: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(`market_requirements_met_${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function setStoredMarketRequirementsMet(userId: string, met: boolean): void {
  if (!userId) return;
  try {
    if (met) {
      localStorage.setItem(`market_requirements_met_${userId}`, 'true');
    } else {
      localStorage.removeItem(`market_requirements_met_${userId}`);
    }
  } catch (e) {
    console.error('Failed to set stored market requirements flag:', e);
  }
}

export interface StoredWarehouseRequirements {
  allMet: boolean;
  warehouseMet: boolean;
  forkliftMet: boolean;
}

export function getStoredWarehouseRequirementsMet(userId: string): StoredWarehouseRequirements {
  if (!userId) return { allMet: false, warehouseMet: false, forkliftMet: false };
  try {
    const allMet = localStorage.getItem(`warehouse_requirements_all_met_${userId}`) === 'true';
    const warehouseMet = allMet || localStorage.getItem(`warehouse_requirements_wh_met_${userId}`) === 'true';
    const forkliftMet = allMet || localStorage.getItem(`warehouse_requirements_forklift_met_${userId}`) === 'true';
    return {
      allMet: allMet || (warehouseMet && forkliftMet),
      warehouseMet,
      forkliftMet
    };
  } catch {
    return { allMet: false, warehouseMet: false, forkliftMet: false };
  }
}

export function setStoredWarehouseRequirementsMet(
  userId: string,
  opts: { warehouseMet?: boolean; forkliftMet?: boolean; allMet?: boolean }
): void {
  if (!userId) return;
  try {
    if (opts.warehouseMet !== undefined) {
      if (opts.warehouseMet) {
        localStorage.setItem(`warehouse_requirements_wh_met_${userId}`, 'true');
      } else {
        localStorage.removeItem(`warehouse_requirements_wh_met_${userId}`);
      }
    }
    if (opts.forkliftMet !== undefined) {
      if (opts.forkliftMet) {
        localStorage.setItem(`warehouse_requirements_forklift_met_${userId}`, 'true');
      } else {
        localStorage.removeItem(`warehouse_requirements_forklift_met_${userId}`);
      }
    }
    if (opts.allMet !== undefined) {
      if (opts.allMet) {
        localStorage.setItem(`warehouse_requirements_all_met_${userId}`, 'true');
        localStorage.setItem(`warehouse_requirements_wh_met_${userId}`, 'true');
        localStorage.setItem(`warehouse_requirements_forklift_met_${userId}`, 'true');
      } else {
        localStorage.removeItem(`warehouse_requirements_all_met_${userId}`);
      }
    }
  } catch (e) {
    console.error('Failed to set stored warehouse requirements flags:', e);
  }
}

export async function checkStudentMarketRequirements(user: {
  id: string;
  role?: string;
  level?: number;
  username?: string;
}): Promise<MarketRequirementsCheckResult> {
  if (user.role === 'teacher' || user.username === 'pupdaniel') {
    return {
      met: true,
      hasTelecomContract: true,
      hasOfficeDevice: true,
      hasWarehouse: true,
      hasElectricityInWarehouse: true,
      hasForklift: true,
      hasWarehouseWorker: true,
      details: {
        telecomContracts: [],
        officeOrders: [],
        acquisitions: [],
        electricityContracts: [],
        purchasedVehicles: [],
        employees: []
      }
    };
  }

  try {
    const [compRes, cRes, telRes, offRes] = await Promise.all([
      fetch(`/api/company/${user.id}`),
      fetch(`/api/electricity/contracts?studentId=${user.id}`),
      fetch(`/api/telecom/contracts?studentId=${user.id}`),
      fetch(`/api/office-store/orders?studentId=${user.id}`)
    ]);

    let acquisitions: any[] = [];
    let machineryAcquisitions: any[] = [];
    let employees: any[] = [];
    let purchasedVehicles: any[] = [];
    let electricityContracts: any[] = [];
    let telecomContracts: any[] = [];
    let officeOrders: any[] = [];

    if (compRes.ok && compRes.headers.get('content-type')?.includes('application/json')) {
      const cData = await compRes.json();
      acquisitions = cData.acquisitions || [];
      machineryAcquisitions = cData.machineryAcquisitions || [];
      employees = cData.hiredEmployees || [];
      purchasedVehicles = cData.purchasedVehicles || [];
    }

    if (cRes.ok && cRes.headers.get('content-type')?.includes('application/json')) {
      const elecJson = await cRes.json();
      electricityContracts = elecJson.contracts || [];
    }

    if (telRes.ok && telRes.headers.get('content-type')?.includes('application/json')) {
      const telJson = await telRes.json();
      telecomContracts = telJson.contracts || [];
    }

    if (offRes.ok && offRes.headers.get('content-type')?.includes('application/json')) {
      const offJson = await offRes.json();
      officeOrders = offJson.orders || [];
    }

    const hasTelecomContract = telecomContracts.some((c: any) => c.status === 'active');
    const hasOfficeDevice = officeOrders.some((order: any) => {
      const items = order.items || order.cartItems || [];
      return items.some((item: any) => {
        const cat = item.category || '';
        const name = (item.itemName || item.name || '').toLowerCase();
        return (
          ['sobremesa', 'portatiles', 'telefonos_fijos', 'telefonos_moviles'].includes(cat) ||
          name.includes('ordenador') ||
          name.includes('portátil') ||
          name.includes('portatil') ||
          name.includes('teléfono') ||
          name.includes('telefono') ||
          name.includes('pc') ||
          name.includes('laptop') ||
          name.includes('smartphone')
        );
      });
    });

    const warehouseAcquisitions = acquisitions.filter((a: any) => {
      const t = (a.type || a.propertyType || '').toLowerCase();
      const title = (a.propertyTitle || a.title || '').toLowerCase();
      return (
        a.status !== 'cancelado' &&
        (t === 'almacen' ||
          t === 'almacén' ||
          t === 'nave_industrial' ||
          title.includes('almacen') ||
          title.includes('almacén') ||
          title.includes('nave'))
      );
    });
    const hasWarehouse = warehouseAcquisitions.length > 0;

    const hasElectricityInWarehouse = electricityContracts.some((ec: any) => {
      if (ec.status !== 'active') return false;
      return warehouseAcquisitions.some(
        (a: any) => a.propertyId === ec.propertyId || a.id === ec.propertyId
      );
    });

    const hasForklift = purchasedVehicles.some((v: any) => v.vehicleType === 'carretilla_elevadora');
    const hasWarehouseWorker = employees.some((e: any) => {
      const role = (e.role || '').toLowerCase();
      const title = (e.title || e.jobTitle || '').toLowerCase();
      return role === 'mozo_almacen' || role === 'mozo' || title.includes('mozo');
    });

    const userLevel = user.level || 1;
    let met = false;
    if (userLevel === 1) {
      met = hasTelecomContract && hasOfficeDevice;
    } else {
      met =
        hasTelecomContract &&
        hasOfficeDevice &&
        hasWarehouse &&
        hasElectricityInWarehouse &&
        hasForklift &&
        hasWarehouseWorker;
    }

    return {
      met,
      hasTelecomContract,
      hasOfficeDevice,
      hasWarehouse,
      hasElectricityInWarehouse,
      hasForklift,
      hasWarehouseWorker,
      details: {
        telecomContracts,
        officeOrders,
        acquisitions,
        electricityContracts,
        purchasedVehicles,
        employees
      }
    };
  } catch (err) {
    console.error('Error in checkStudentMarketRequirements:', err);
    return {
      met: false,
      hasTelecomContract: false,
      hasOfficeDevice: false,
      hasWarehouse: false,
      hasElectricityInWarehouse: false,
      hasForklift: false,
      hasWarehouseWorker: false,
      details: {
        telecomContracts: [],
        officeOrders: [],
        acquisitions: [],
        electricityContracts: [],
        purchasedVehicles: [],
        employees: []
      }
    };
  }
}
