/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, JobListing, HiredEmployee, MachineryAcquisition } from '../types.js';
import { Users, UserPlus, Trash2, ArrowLeft, Briefcase, Filter, Sparkles, CheckCircle2, AlertCircle, Wrench, Clock, ShieldCheck } from 'lucide-react';
import Footer from './Footer.js';
import { formatNumber } from '../lib/formatters.js';

interface JobForumPortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export default function JobForumPortal({ currentUser, onBackToHub, onUserBalanceUpdated }: JobForumPortalProps) {
  const isTeacher = currentUser.role === 'teacher';

  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [myEmployees, setMyEmployees] = useState<HiredEmployee[]>([]);
  const [machineryList, setMachineryList] = useState<MachineryAcquisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'my_employees'>('available');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Teacher generator state
  const [batchCount, setBatchCount] = useState<number>(10);
  const [batchGender, setBatchGender] = useState<'indiferente' | 'hombre' | 'mujer'>('indiferente');
  const [batchRole, setBatchRole] = useState<'mixto' | 'operario' | 'camionero' | 'mozo_almacen' | 'carretillero'>('mixto');
  const [batchMinSalary, setBatchMinSalary] = useState<number>(1200);
  const [batchMaxSalary, setBatchMaxSalary] = useState<number>(2200);
  const [batchMinAge, setBatchMinAge] = useState<number>(20);
  const [batchMaxAge, setBatchMaxAge] = useState<number>(55);
  const [isGenerating, setIsGenerating] = useState(false);

  // Filter state for students
  const [genderFilter, setGenderFilter] = useState<'todos' | 'hombre' | 'mujer'>('todos');
  const [roleFilter, setRoleFilter] = useState<'todos' | 'operario' | 'camionero' | 'mozo_almacen' | 'carretillero'>('todos');
  const [maxSalaryFilter, setMaxSalaryFilter] = useState<number>(3000);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/job-listings');
      const data = await res.json();
      if (data.jobListings) {
        setJobListings(data.jobListings);
      }
    } catch (e) {
      console.error('Error cargando ofertas de empleo:', e);
    }
  };

  const fetchMyEmployeesAndMachinery = async () => {
    if (isTeacher) return;
    try {
      const resEmp = await fetch(`/api/student/employees?studentId=${currentUser.id}`);
      const dataEmp = await resEmp.json();
      if (dataEmp.employees) {
        setMyEmployees(dataEmp.employees);
      }

      const resCompany = await fetch(`/api/company/${currentUser.id}`);
      const dataCompany = await resCompany.json();
      if (dataCompany.machineryAcquisitions) {
        setMachineryList(dataCompany.machineryAcquisitions);
      }
    } catch (e) {
      console.error('Error cargando empleados o maquinaria:', e);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchJobs(), fetchMyEmployeesAndMachinery()]).finally(() => setIsLoading(false));
  }, [currentUser]);

  const handleHireEmployee = async (job: JobListing) => {
    if (isTeacher) {
      setMessage({ type: 'error', text: 'El profesor no contrata empleados. Accede como alumno para contratar.' });
      return;
    }

    try {
      const res = await fetch(`/api/jobs/${job.id}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentUser.id })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Error al contratar empleado' });
        return;
      }

      setMessage({
        type: 'success',
        text: `¡Felicidades! Has contratado a ${job.employeeName} con un sueldo de ${formatNumber(job.grossSalaryMonthly)} €/mes.`
      });

      fetchJobs();
      fetchMyEmployeesAndMachinery();
    } catch (e) {
      setMessage({ type: 'error', text: 'Error en la solicitud de contratación' });
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setMessage(null);

    try {
      const res = await fetch('/api/teacher/job-listings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: batchCount,
          gender: batchGender,
          role: batchRole,
          minSalary: batchMinSalary,
          maxSalary: batchMaxSalary,
          minAge: batchMinAge,
          maxAge: batchMaxAge
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Error al generar ofertas' });
      } else {
        setMessage({
          type: 'success',
          text: `¡Publicadas ${data.count} nuevas ofertas de empleo correctamente!`
        });
        fetchJobs();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al conectar con el servidor' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      const res = await fetch(`/api/teacher/job-listings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Oferta eliminada' });
        fetchJobs();
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al eliminar oferta' });
    }
  };

  const handleClearAvailableJobs = async () => {
    if (!confirm('¿Seguro que deseas eliminar todas las ofertas disponibles no contratadas?')) return;
    try {
      const res = await fetch('/api/teacher/job-listings', { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Ofertas disponibles limpiadas' });
        fetchJobs();
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al limpiar ofertas' });
    }
  };

  const handleAssignMachinery = async (employeeId: string, machineryId: string, shift: number) => {
    try {
      const res = await fetch(`/api/student/employees/${employeeId}/assign-machinery`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineryId, shift })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Asignación de puesto de trabajo actualizada' });
        fetchMyEmployeesAndMachinery();
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al asignar puesto' });
    }
  };

  const availableJobs = jobListings.filter(j => j.status === 'disponible');
  const filteredJobs = availableJobs.filter(j => {
    if (genderFilter !== 'todos' && j.gender !== genderFilter) return false;
    if (roleFilter !== 'todos') {
      const jRole = j.role || 'operario';
      if (jRole !== roleFilter) return false;
    }
    if (j.grossSalaryMonthly > maxSalaryFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              title="Volver al menú principal"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Foro de empleo</h1>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Mercado laboral
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Contratación de operarios y asignación a maquinaria industrial</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400 font-medium">Usuario:</span>
              <span className="text-xs font-bold text-slate-200">{currentUser.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        {/* Banner Alert Messages */}
        {message && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs ${
            message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <div className="flex items-center gap-3">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-xs font-bold underline cursor-pointer">
              Cerrar
            </button>
          </div>
        )}

        {/* TEACHER DASHBOARD FOR GENERATING JOB LISTINGS */}
        {isTeacher && (
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-violet-500/20 text-violet-300 rounded-2xl border border-violet-500/30">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Gestión docente del foro de empleo</h2>
                <p className="text-xs text-slate-400">Configura y publica bolsas de empleo para que los alumnos contraten operarios.</p>
              </div>
            </div>

            <form onSubmit={handleCreateBatch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Puesto / rol</label>
                <select
                  value={batchRole}
                  onChange={e => setBatchRole(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="mixto">Mezcla de roles</option>
                  <option value="operario">Operario industrial</option>
                  <option value="mozo_almacen">Mozo de almacén</option>
                  <option value="camionero">Camionero / conductor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nº de candidatos</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={batchCount}
                  onChange={e => setBatchCount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Género</label>
                <select
                  value={batchGender}
                  onChange={e => setBatchGender(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="indiferente">Indiferente / mixto</option>
                  <option value="hombre">Solo hombres</option>
                  <option value="mujer">Solo mujeres</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sueldo mín. (€)</label>
                <input
                  type="number"
                  step="50"
                  value={batchMinSalary}
                  onChange={e => setBatchMinSalary(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sueldo máx. (€)</label>
                <input
                  type="number"
                  step="50"
                  value={batchMaxSalary}
                  onChange={e => setBatchMaxSalary(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Edad (rango)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={batchMinAge}
                    onChange={e => setBatchMinAge(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                    placeholder="Min"
                  />
                  <span className="text-slate-500 text-xs">-</span>
                  <input
                    type="number"
                    value={batchMaxAge}
                    onChange={e => setBatchMaxAge(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-4 rounded-xl transition text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isGenerating ? 'Generando...' : 'Publicar'}</span>
                </button>
              </div>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>Ofertas activas actualmente: <strong className="text-white">{availableJobs.length}</strong> disponibles</span>
              <button
                onClick={handleClearAvailableJobs}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Borrar ofertas disponibles</span>
              </button>
            </div>
          </div>
        )}

        {/* TABS & FILTERS */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-violet-600" />
              <span>Ofertas de empleo de candidatos ({availableJobs.length})</span>
            </h2>
            {!isTeacher && (
              <span className="text-xs bg-blue-50 text-blue-900 px-3 py-2 rounded-2xl font-semibold border border-blue-200 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                <span>La gestión de tus empleados contratados se realiza desde <strong>Patrimonio de la empresa (Mi empresa)</strong></span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold px-2">
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros:</span>
              </div>

              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none"
              >
                <option value="todos">Todos los puestos</option>
                <option value="operario">Operarios industriales</option>
                <option value="mozo_almacen">Mozos de almacén</option>
                <option value="camionero">Camioneros / conductores</option>
              </select>

              <select
                value={genderFilter}
                onChange={e => setGenderFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="todos">Todos los géneros</option>
                <option value="hombre">Solo hombres</option>
                <option value="mujer">Solo mujeres</option>
              </select>

              <div className="flex items-center gap-2">
                <span className="text-slate-500">Sueldo máx:</span>
                <input
                  type="range"
                  min="1000"
                  max="3500"
                  step="100"
                  value={maxSalaryFilter}
                  onChange={e => setMaxSalaryFilter(Number(e.target.value))}
                  className="w-24 accent-violet-600 cursor-pointer"
                />
                <span className="font-extrabold text-slate-900">{maxSalaryFilter} €</span>
              </div>
            </div>
        </div>

        {/* AVAILABLE JOB LISTINGS */}
        <div>
          {filteredJobs.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-800">No hay candidatos disponibles</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {isTeacher
                    ? 'Usa el panel superior para publicar un nuevo lote de candidatos.'
                    : 'El profesor aún no ha publicado ofertas en la bolsa de trabajo o no coinciden con tus filtros.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredJobs.map(job => (
                  <div
                    key={job.id}
                    className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs hover:shadow-xl transition duration-300 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <img
                          src={job.avatarUrl}
                          alt={job.employeeName}
                          className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-xs"
                        />
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{job.employeeName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {job.gender === 'hombre' ? 'Hombre' : 'Mujer'}, {job.age} años
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Puesto pretendido</div>
                        <div className="text-xs font-bold text-slate-800">{job.title}</div>
                        <div className="mt-2 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Salario bruto mensual</div>
                        <div className="text-lg font-black text-violet-700">
                          {formatNumber(job.grossSalaryMonthly)} € / mes
                        </div>
                      </div>
                    </div>

                    <div>
                      {!isTeacher ? (
                        <button
                          onClick={() => handleHireEmployee(job)}
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-extrabold py-2.5 px-4 rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>Contratar empleado</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1 cursor-pointer border border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar oferta</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </main>

      <Footer />
    </div>
  );
}
