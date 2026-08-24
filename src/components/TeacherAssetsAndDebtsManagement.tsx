/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import { Building2, Wrench, Landmark, Trash2, Edit3, ShieldAlert, CheckCircle2, AlertTriangle, FileText, Search, RefreshCw, X } from 'lucide-react';

interface TeacherAssetsAndDebtsManagementProps {
  students: User[];
}

export default function TeacherAssetsAndDebtsManagement({ students }: TeacherAssetsAndDebtsManagementProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '');
  const [companyData, setCompanyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'obligations' | 'acquisitions' | 'machinery' | 'loans'>('obligations');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit Modal States
  const [editingItem, setEditingItem] = useState<{ type: 'acquisition' | 'machinery' | 'loan'; data: any } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPendingBalance, setEditPendingBalance] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedStudentId) {
      fetchCompanyData(selectedStudentId);
    }
  }, [selectedStudentId]);

  const fetchCompanyData = async (studentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/${studentId}`);
      const data = await res.json();
      if (data) {
        setCompanyData(data);
      }
    } catch (e) {
      console.error('Error cargando datos de la empresa:', e);
    } finally {
      setLoading(false);
    }
  };

  // Delete Handlers
  const handleDeleteObligation = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta deuda u obligación de pago?')) return;
    try {
      const res = await fetch(`/api/obligations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMsg({ type: 'success', text: 'Deuda/Obligación eliminada correctamente.' });
        fetchCompanyData(selectedStudentId);
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al eliminar la obligación.' });
    }
  };

  const handleDeleteAcquisition = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este inmueble/alquiler del historial del alumno?')) return;
    try {
      const res = await fetch(`/api/acquisitions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMsg({ type: 'success', text: 'Inmueble eliminado correctamente.' });
        fetchCompanyData(selectedStudentId);
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al eliminar el inmueble.' });
    }
  };

  const handleDeleteMachinery = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este lote de maquinaria?')) return;
    try {
      const res = await fetch(`/api/machinery/acquisitions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMsg({ type: 'success', text: 'Maquinaria eliminada correctamente.' });
        fetchCompanyData(selectedStudentId);
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al eliminar la maquinaria.' });
    }
  };

  const handleDeleteLoan = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este préstamo bancario?')) return;
    try {
      const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMsg({ type: 'success', text: 'Préstamo eliminado correctamente.' });
        fetchCompanyData(selectedStudentId);
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al eliminar el préstamo.' });
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (type: 'acquisition' | 'machinery' | 'loan', data: any) => {
    setEditingItem({ type, data });
    if (type === 'acquisition') {
      setEditTitle(data.propertyTitle || '');
      setEditPrice(String(data.basePrice || data.totalPrice || 0));
      setEditPendingBalance(String(data.pendingBalance || 0));
    } else if (type === 'machinery') {
      setEditTitle(data.lineTitle || data.title || '');
      setEditPrice(String(data.totalPrice || data.basePrice || 0));
      setEditPendingBalance(String(data.pendingBalance || 0));
    } else if (type === 'loan') {
      setEditTitle(`Préstamo ${data.id}`);
      setEditPrice(String(data.offeredAmount || data.requestedAmount || 0));
      setEditPendingBalance(String(data.offeredAmount || 0));
    }
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);

    try {
      let endpoint = '';
      let bodyData: any = {};

      if (editingItem.type === 'acquisition') {
        endpoint = `/api/acquisitions/${editingItem.data.id}`;
        bodyData = {
          propertyTitle: editTitle,
          basePrice: Number(editPrice),
          pendingBalance: Number(editPendingBalance)
        };
      } else if (editingItem.type === 'machinery') {
        endpoint = `/api/machinery/acquisitions/${editingItem.data.id}`;
        bodyData = {
          lineTitle: editTitle,
          totalPrice: Number(editPrice),
          pendingBalance: Number(editPendingBalance)
        };
      } else if (editingItem.type === 'loan') {
        endpoint = `/api/loans/${editingItem.data.id}`;
        bodyData = {
          offeredAmount: Number(editPrice)
        };
      }

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        setMsg({ type: 'success', text: 'Registro actualizado correctamente.' });
        setEditingItem(null);
        fetchCompanyData(selectedStudentId);
      } else {
        const errJson = await res.json();
        setMsg({ type: 'error', text: errJson.error || 'Error al actualizar.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de red al actualizar.' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const obligationsList = companyData?.paymentObligations || [];
  const acquisitionsList = companyData?.acquisitions || [];
  const machineryList = companyData?.machineryAcquisitions || [];
  const loansList = companyData?.loans || [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Student Selector */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">Administración de activos, deudas y pasivos</h2>
            <p className="text-xs text-slate-500">Edita o elimina los elementos del balance contable de cada alumno (inmuebles, maquinaria, deudas y préstamos).</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700">Seleccionar alumno:</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.username})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="font-bold underline cursor-pointer">Cerrar</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('obligations')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'obligations' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Deudas y vencimientos ({obligationsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('acquisitions')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'acquisitions' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Inmuebles propiedad / alquiler ({acquisitionsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('machinery')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'machinery' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Maquinaria industrial ({machineryList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('loans')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'loans' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Préstamos bancarios ({loansList.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-semibold">Cargando registros contables del alumno...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
          
          {/* TAB 1: OBLIGATIONS / DEBTS */}
          {activeTab === 'obligations' && (
            <div>
              {obligationsList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">El alumno no tiene deudas pendientes ni pagarés registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-2">Ref. / Finca</th>
                        <th className="py-3 px-2">Tipo instrumento</th>
                        <th className="py-3 px-2">Vencimiento</th>
                        <th className="py-3 px-2 text-right">Importe (€)</th>
                        <th className="py-3 px-2">Estado</th>
                        <th className="py-3 px-2 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {obligationsList.map((ob: any) => (
                        <tr key={ob.id} className="hover:bg-slate-50 text-slate-700">
                          <td className="py-3 px-2 font-bold">{ob.propertyTitle || 'Obligación pendiente'}</td>
                          <td className="py-3 px-2 uppercase font-mono text-[11px] text-amber-800">{ob.type}</td>
                          <td className="py-3 px-2">{new Date(ob.dueDate).toLocaleDateString('es-ES')}</td>
                          <td className="py-3 px-2 text-right font-bold text-slate-900">{formatNumber(ob.amount)} €</td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              ob.status === 'pagado' ? 'bg-emerald-100 text-emerald-800' : ob.status === 'vencido' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {ob.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => handleDeleteObligation(ob.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title="Eliminar deuda"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REAL ESTATE ACQUISITIONS */}
          {activeTab === 'acquisitions' && (
            <div>
              {acquisitionsList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">El alumno no tiene inmuebles ni contratos de alquiler.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-2">Inmueble / alquiler</th>
                        <th className="py-3 px-2">Operación</th>
                        <th className="py-3 px-2 text-right">Precio base (€)</th>
                        <th className="py-3 px-2 text-right">Saldo pendiente (€)</th>
                        <th className="py-3 px-2 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {acquisitionsList.map((acq: any) => (
                        <tr key={acq.id} className="hover:bg-slate-50 text-slate-700">
                          <td className="py-3 px-2 font-bold">{acq.propertyTitle}</td>
                          <td className="py-3 px-2 uppercase font-mono text-[11px] text-blue-800">{acq.operation}</td>
                          <td className="py-3 px-2 text-right font-bold text-slate-900">{formatNumber(acq.basePrice || acq.totalPrice)} €</td>
                          <td className="py-3 px-2 text-right font-bold text-amber-800">{formatNumber(acq.pendingBalance || 0)} €</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit('acquisition', acq)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                title="Editar inmueble"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteAcquisition(acq.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Eliminar inmueble"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MACHINERY ACQUISITIONS */}
          {activeTab === 'machinery' && (
            <div>
              {machineryList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">El alumno no tiene lotes de maquinaria comprados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-2">Línea de maquinaria</th>
                        <th className="py-3 px-2">Nave instalada</th>
                        <th className="py-3 px-2 text-right">Precio total (€)</th>
                        <th className="py-3 px-2 text-right">Saldo pendiente (€)</th>
                        <th className="py-3 px-2 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {machineryList.map((mac: any) => (
                        <tr key={mac.id} className="hover:bg-slate-50 text-slate-700">
                          <td className="py-3 px-2 font-bold">{mac.lineTitle || mac.title}</td>
                          <td className="py-3 px-2 text-slate-500">{mac.installedNaveTitle || 'Nave industrial'}</td>
                          <td className="py-3 px-2 text-right font-bold text-slate-900">{formatNumber(mac.totalPrice || mac.basePrice)} €</td>
                          <td className="py-3 px-2 text-right font-bold text-amber-800">{formatNumber(mac.pendingBalance || 0)} €</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit('machinery', mac)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                title="Editar maquinaria"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteMachinery(mac.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Eliminar maquinaria"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LOANS */}
          {activeTab === 'loans' && (
            <div>
              {loansList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">El alumno no tiene préstamos concedidos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-2">Ref. préstamo</th>
                        <th className="py-3 px-2">TIN % / plazo</th>
                        <th className="py-3 px-2 text-right">Importe concedido (€)</th>
                        <th className="py-3 px-2">Estado</th>
                        <th className="py-3 px-2 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {loansList.map((loan: any) => (
                        <tr key={loan.id} className="hover:bg-slate-50 text-slate-700">
                          <td className="py-3 px-2 font-bold font-mono">{loan.id}</td>
                          <td className="py-3 px-2">{loan.annualInterestRate}% • {loan.termMonths} meses</td>
                          <td className="py-3 px-2 text-right font-bold text-slate-900">{formatNumber(loan.offeredAmount || loan.requestedAmount)} €</td>
                          <td className="py-3 px-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              {loan.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit('loan', loan)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                title="Editar préstamo"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLoan(loan.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Eliminar préstamo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Editar {editingItem.type === 'acquisition' ? 'inmueble' : editingItem.type === 'machinery' ? 'maquinaria' : 'préstamo'}
              </h3>
              <button onClick={() => setEditingItem(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título / denominación</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Precio total / importe concedido (€)</label>
                <input
                  type="number"
                  step="100"
                  required
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-mono font-bold"
                />
              </div>

              {editingItem.type !== 'loan' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Saldo pendiente (€)</label>
                  <input
                    type="number"
                    step="100"
                    required
                    value={editPendingBalance}
                    onChange={e => setEditPendingBalance(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
