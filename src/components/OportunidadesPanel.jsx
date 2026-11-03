import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    TrendingUp,
    Plus, DollarSign, Briefcase, Lock, CheckCircle2, XCircle, Clock, X,
    Edit2, Trash2, ArrowUpRight, Star, AlertCircle, RotateCcw
} from 'lucide-react';
import { getToken } from '../utils/authUtils';
import API_URL from '../config/api';

const DEFAULT_KANBAN_COLUMNS = [
    { id: 'nueva', label: 'Nueva Oportunidad', colorId: 'emerald' },
    { id: 'calificacion', label: 'Calificación', colorId: 'blue' },
    { id: 'cotizacion', label: 'Cotización Enviada', colorId: 'violet' },
    { id: 'negociacion', label: 'En Negociación', colorId: 'amber' },
    { id: 'ganada', label: 'Venta Ganada', colorId: 'emerald' },
    { id: 'perdida', label: 'Perdida', colorId: 'slate' }
];

// Colores sólidos iguales a las cabeceras de columnas del Kanban de Oportunidades
const ETAPA_COLORS_SOLID = {
    slate: 'bg-slate-600 text-white shadow-xs',
    blue: 'bg-blue-600 text-white shadow-xs',
    violet: 'bg-violet-600 text-white shadow-xs',
    emerald: 'bg-emerald-600 text-white shadow-xs',
    amber: 'bg-amber-500 text-white shadow-xs',
    rose: 'bg-rose-600 text-white shadow-xs',
    cyan: 'bg-cyan-600 text-white shadow-xs',
    orange: 'bg-orange-500 text-white shadow-xs',
    teal: 'bg-teal-600 text-white shadow-xs',
    white: 'bg-slate-700 text-white shadow-xs'
};

export default function OportunidadesPanel({
    clienteId,
    esProspecto = false,
    onConvertirACliente,
    onOportunidadCerrada,
    onOportunidadesChange,
    containerClassName = ''
}) {
    const navigate = useNavigate();
    const [oportunidades, setOportunidades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [kanbanColumns, setKanbanColumns] = useState(DEFAULT_KANBAN_COLUMNS);

    // Modales
    const [modalCrear, setModalCrear] = useState(false);
    const [formCrear, setFormCrear] = useState({ titulo: '', monto: '', notas: '' });
    const [guardandoCrear, setGuardandoCrear] = useState(false);

    const [modalEditar, setModalEditar] = useState(null);
    const [guardandoEditar, setGuardandoEditar] = useState(false);

    const [modalCerrar, setModalCerrar] = useState(null);
    const [modalConvertirProspecto, setModalConvertirProspecto] = useState(null);
    const [procesandoConversion, setProcesandoConversion] = useState(false);
    const [procesandoCierre, setProcesandoCierre] = useState(false);

    const [oppAEliminar, setOppAEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);

    useEffect(() => {
        try {
            const colsStr = localStorage.getItem('kanban_oportunidades_cols_v4');
            if (colsStr) setKanbanColumns(JSON.parse(colsStr));
        } catch {
            setKanbanColumns(DEFAULT_KANBAN_COLUMNS);
        }
    }, []);

    const cargarOportunidades = async () => {
        if (!clienteId) return;
        try {
            setLoading(true);
            const token = getToken();
            const res = await axios.get(`${API_URL}/api/oportunidades/${clienteId}`, {
                headers: { 'x-auth-token': token }
            });
            const data = (res.data || []).map(opp => {
                let parsedContent = {};
                try {
                    parsedContent = opp.notas ? JSON.parse(opp.notas) : {};
                } catch {
                    parsedContent = { texto: opp.notas || '' };
                }
                return { ...opp, parsedContent };
            });
            setOportunidades(data);
            if (onOportunidadesChange) onOportunidadesChange(data);
        } catch (error) {
            console.error('Error cargando oportunidades:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarOportunidades();
    }, [clienteId]);

    const handleCrearOportunidad = async (e) => {
        e?.preventDefault();
        if (!formCrear.titulo.trim()) {
            toast.error('El nombre de la oportunidad es obligatorio');
            return;
        }
        setGuardandoCrear(true);
        try {
            const token = getToken();
            const primeraEtapa = kanbanColumns[0]?.id || 'nueva';
            const payload = {
                cliente_id: clienteId,
                titulo: formCrear.titulo.trim(),
                monto: formCrear.monto ? Number(formCrear.monto) : 0,
                etapa: primeraEtapa,
                notas: JSON.stringify({ texto: formCrear.notas || '', url: null }),
                etapas_json: '[]'
            };

            await axios.post(`${API_URL}/api/oportunidades`, payload, {
                headers: { 'x-auth-token': token }
            });

            toast.success('Oportunidad creada');
            setFormCrear({ titulo: '', monto: '', notas: '' });
            setModalCrear(false);
            await cargarOportunidades();
        } catch (error) {
            console.error('Error al crear oportunidad:', error);
            toast.error(error.response?.data?.msg || 'Error al crear la oportunidad');
        } finally {
            setGuardandoCrear(false);
        }
    };

    const handleGuardarEdicion = async (e) => {
        e?.preventDefault();
        if (!modalEditar?.titulo?.trim()) {
            toast.error('El nombre es obligatorio');
            return;
        }
        setGuardandoEditar(true);
        try {
            const token = getToken();
            const payload = {
                titulo: modalEditar.titulo.trim(),
                monto: modalEditar.monto !== '' ? Number(modalEditar.monto) : 0,
                notas: JSON.stringify({
                    ...(modalEditar.parsedContent || {}),
                    texto: modalEditar.notasTexto || ''
                })
            };

            await axios.put(`${API_URL}/api/oportunidades/${modalEditar.id}`, payload, {
                headers: { 'x-auth-token': token }
            });

            toast.success('Oportunidad actualizada');
            setModalEditar(null);
            await cargarOportunidades();
        } catch (error) {
            console.error('Error al editar:', error);
            toast.error('Error al actualizar oportunidad');
        } finally {
            setGuardandoEditar(false);
        }
    };

    const handleConfirmarCierre = async (estado, tipoCierre = 'venta') => {
        if (!modalCerrar) return;
        setProcesandoCierre(true);
        try {
            const token = getToken();
            const payload = {
                estado: estado,
                etapa: estado === 'ganada' ? 'ganada' : 'perdida'
            };

            await axios.put(`${API_URL}/api/oportunidades/${modalCerrar.id}`, payload, {
                headers: { 'x-auth-token': token }
            });

            if (onOportunidadCerrada) {
                await onOportunidadCerrada(modalCerrar, estado, tipoCierre);
            }

            toast.success(`Oportunidad marcada como ${estado === 'ganada' ? 'Ganada' : 'Perdida'}`);
            setModalCerrar(null);
            await cargarOportunidades();
        } catch (error) {
            console.error('Error al cerrar oportunidad:', error);
            toast.error('Error al cerrar oportunidad');
        } finally {
            setProcesandoCierre(false);
        }
    };

    const handleReabrirOportunidad = async (opp) => {
        if (!window.confirm(`¿Deseas reabrir la oportunidad "${opp.titulo}"?`)) return;
        try {
            const token = getToken();
            const primeraEtapa = kanbanColumns[0]?.id || 'nueva';
            await axios.put(`${API_URL}/api/oportunidades/${opp.id}`, {
                estado: 'en_proceso',
                etapa: primeraEtapa
            }, {
                headers: { 'x-auth-token': token }
            });
            toast.success('Oportunidad reabierta');
            await cargarOportunidades();
        } catch (error) {
            console.error('Error al reabrir:', error);
            toast.error('Error al reabrir la oportunidad');
        }
    };

    const handleEliminarOportunidad = async () => {
        if (!oppAEliminar) return;
        setEliminando(true);
        try {
            const token = getToken();
            await axios.delete(`${API_URL}/api/oportunidades/${oppAEliminar.id}`, {
                headers: { 'x-auth-token': token }
            });
            toast.success('Oportunidad eliminada');
            setOppAEliminar(null);
            await cargarOportunidades();
        } catch (error) {
            console.error('Error al eliminar:', error);
            toast.error('Error al eliminar oportunidad');
        } finally {
            setEliminando(false);
        }
    };

    const getEtapaInfo = (etapaId) => {
        const col = kanbanColumns.find(c => c.id === etapaId);
        if (col) {
            return {
                label: col.label,
                colorClass: ETAPA_COLORS_SOLID[col.colorId] || ETAPA_COLORS_SOLID.slate
            };
        }
        return {
            label: etapaId || 'Nueva',
            colorClass: ETAPA_COLORS_SOLID.slate
        };
    };

    if (loading) {
        return <div className="text-center p-6 text-slate-400 text-xs">Cargando oportunidades...</div>;
    }

    return (
        <div className={`space-y-3 ${containerClassName}`}>
            {/* Header del Panel */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Oportunidades ({oportunidades.length})
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/vendedor/oportunidades')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-amber-950 rounded-lg text-xs font-bold transition-all shadow-xs"
                        title="Ir a la sección general de Oportunidades"
                    >
                        <span>Ir a Oportunidades</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => { setFormCrear({ titulo: '', monto: '', notas: '' }); setModalCrear(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-(--theme-600) text-white rounded-lg text-xs font-bold hover:bg-(--theme-700) transition-all shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" /> Nueva
                    </button>
                </div>
            </div>

            {/* Listado en Cuadrícula (Tarjetas Cuadradas / Cards) */}
            {oportunidades.length === 0 ? (
                <div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                    <Briefcase className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">Sin oportunidades de venta</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Crea una nueva oportunidad para dar seguimiento a este negocio.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {[...oportunidades].sort((a, b) => b.id - a.id).map(opp => {
                        const etapaInfo = getEtapaInfo(opp.etapa);
                        const esGanada = opp.estado === 'ganada' || opp.etapa === 'ganada';
                        const esPerdida = opp.estado === 'perdida' || opp.etapa === 'perdida';
                        const esCerrada = esGanada || esPerdida;
                        const notaTexto = opp.parsedContent?.texto || (typeof opp.notas === 'string' && !opp.notas.startsWith('{') ? opp.notas : '');

                        let cardBg = 'bg-white border-slate-200';
                        if (esGanada) cardBg = 'bg-emerald-50/40 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.1)]';
                        if (esPerdida) cardBg = 'bg-slate-50/90 border-slate-200 opacity-80';

                        return (
                            <div
                                key={opp.id}
                                className={`border rounded-xl p-3.5 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[175px] relative group ${cardBg}`}
                            >
                                {/* Top: Etiqueta Sólida de Etapa y Acciones */}
                                <div>
                                    <div className="flex items-center justify-between gap-1 mb-2.5">
                                        {/* Etiqueta color sólido exactamente igual a la columna del Kanban */}
                                        <span
                                            className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider truncate max-w-[150px] ${etapaInfo.colorClass}`}
                                            title={etapaInfo.label}
                                        >
                                            {etapaInfo.label}
                                        </span>

                                        <div className="flex items-center gap-1">
                                            {/* Botón Editar */}
                                            {!esCerrada && (
                                                <button
                                                    onClick={() => setModalEditar({
                                                        id: opp.id,
                                                        titulo: opp.titulo || '',
                                                        monto: opp.monto || '',
                                                        notasTexto: notaTexto,
                                                        parsedContent: opp.parsedContent
                                                    })}
                                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                                                    title="Editar oportunidad"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {/* Botón Eliminar */}
                                            <button
                                                onClick={() => setOppAEliminar(opp)}
                                                className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                                title="Eliminar oportunidad"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Título de la Oportunidad */}
                                    <h4 className="font-bold text-sm text-slate-800 line-clamp-2 leading-snug mb-1" title={opp.titulo}>
                                        {opp.titulo}
                                    </h4>

                                    {/* Notas / Subtítulo */}
                                    {notaTexto ? (
                                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">
                                            {notaTexto}
                                        </p>
                                    ) : (
                                        <span className="text-[10px] text-slate-300 italic">Sin notas adicionales</span>
                                    )}
                                </div>

                                {/* Bottom: Valor y Botón de Cierre Mejor Acomodado */}
                                <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Valor</span>
                                        <span className="text-sm font-black text-slate-900 leading-tight">
                                            ${Number(opp.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>

                                    <div className="shrink-0 flex items-center">
                                        {esGanada ? (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleReabrirOportunidad(opp)}
                                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-black transition-colors"
                                                    title="Clic para reabrir esta oportunidad"
                                                >
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                    <span>Ganada</span>
                                                </button>
                                                {esProspecto && (
                                                    <button
                                                        onClick={() => setModalConvertirProspecto(opp)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold transition-all shadow-xs"
                                                        title="Convertir este prospecto a cliente formal"
                                                    >
                                                        <TrendingUp className="w-3 h-3" />
                                                        <span>Registrar Venta</span>
                                                    </button>
                                                )}
                                            </div>
                                        ) : esPerdida ? (
                                            <button
                                                onClick={() => handleReabrirOportunidad(opp)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black transition-colors"
                                                title="Clic para reabrir esta oportunidad"
                                            >
                                                <XCircle className="w-3.5 h-3.5 text-slate-500" />
                                                <span>Perdida</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setModalCerrar(opp)}
                                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-(--theme-600) text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                                title="Cerrar oportunidad como Ganada o Perdida"
                                            >
                                                Cerrar Venta
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MODAL CREAR OPORTUNIDAD */}
            {modalCrear && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setModalCrear(false); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-(--theme-50) text-(--theme-600) rounded-lg">
                                    <Briefcase className="w-4 h-4" />
                                </div>
                                <h3 className="font-bold text-sm text-slate-800">Nueva Oportunidad</h3>
                            </div>
                            <button
                                onClick={() => setModalCrear(false)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleCrearOportunidad} className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Nombre de la Oportunidad *
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={formCrear.titulo}
                                    onChange={(e) => setFormCrear(f => ({ ...f, titulo: e.target.value }))}
                                    placeholder="Ej: Renovación de póliza, Venta licencias..."
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Valor Estimado ($)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={formCrear.monto}
                                        onChange={(e) => setFormCrear(f => ({ ...f, monto: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-8 pr-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Notas o Detalles (Opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={formCrear.notas}
                                    onChange={(e) => setFormCrear(f => ({ ...f, notas: e.target.value }))}
                                    placeholder="Detalles sobre lo que se cotizó..."
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all resize-none"
                                />
                            </div>

                            <div className="pt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setModalCrear(false)}
                                    className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={guardandoCrear || !formCrear.titulo.trim()}
                                    className="flex-1 py-2 bg-(--theme-600) text-white rounded-xl text-xs font-bold hover:bg-(--theme-700) disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {guardandoCrear ? 'Guardando...' : 'Crear Oportunidad'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL EDITAR OPORTUNIDAD */}
            {modalEditar && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setModalEditar(null); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <Edit2 className="w-4 h-4" />
                                </div>
                                <h3 className="font-bold text-sm text-slate-800">Editar Oportunidad</h3>
                            </div>
                            <button
                                onClick={() => setModalEditar(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleGuardarEdicion} className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Nombre de la Oportunidad *
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={modalEditar.titulo}
                                    onChange={(e) => setModalEditar(f => ({ ...f, titulo: e.target.value }))}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Valor ($)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={modalEditar.monto}
                                        onChange={(e) => setModalEditar(f => ({ ...f, monto: e.target.value }))}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-8 pr-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                                    Notas o Detalles
                                </label>
                                <textarea
                                    rows={2}
                                    value={modalEditar.notasTexto}
                                    onChange={(e) => setModalEditar(f => ({ ...f, notasTexto: e.target.value }))}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-(--theme-400) focus:bg-white transition-all resize-none"
                                />
                            </div>

                            <div className="pt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setModalEditar(null)}
                                    className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={guardandoEditar || !modalEditar.titulo?.trim()}
                                    className="flex-1 py-2 bg-(--theme-600) text-white rounded-xl text-xs font-bold hover:bg-(--theme-700) disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {guardandoEditar ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CERRAR OPORTUNIDAD */}
            {modalCerrar && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !procesandoCierre) setModalCerrar(null); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-bold text-sm text-slate-800">Cerrar Oportunidad</h3>
                            <button
                                onClick={() => setModalCerrar(null)}
                                disabled={procesandoCierre}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-800">{modalCerrar.titulo}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Valor: <strong className="text-slate-900">${Number(modalCerrar.monto || 0).toLocaleString('es-MX')}</strong>
                                </p>
                            </div>

                            <p className="text-xs text-slate-600 text-center font-medium">
                                Selecciona el resultado de la negociación:
                            </p>

                            <div className="space-y-2">
                                <button
                                    onClick={() => handleConfirmarCierre('ganada', 'venta')}
                                    disabled={procesandoCierre}
                                    className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-all"
                                >
                                    <span className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-emerald-600" />
                                        <span>🎉 Ganada (Venta Única)</span>
                                    </span>
                                    <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-black">Registrar</span>
                                </button>

                                <button
                                    onClick={() => handleConfirmarCierre('ganada', 'suscripcion')}
                                    disabled={procesandoCierre}
                                    className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-violet-200 bg-violet-50/60 hover:bg-violet-100 text-violet-800 font-bold text-xs transition-all"
                                >
                                    <span className="flex items-center gap-2">
                                        <Star className="w-4 h-4 text-violet-600" />
                                        <span>🔁 Ganada (Suscripción)</span>
                                    </span>
                                    <span className="text-[10px] text-violet-600 uppercase tracking-wider font-black">Registrar</span>
                                </button>

                                <button
                                    onClick={() => handleConfirmarCierre('perdida')}
                                    disabled={procesandoCierre}
                                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-semibold text-xs transition-all"
                                >
                                    <span className="flex items-center gap-2">
                                        <XCircle className="w-4 h-4 text-slate-400" />
                                        <span>Perdida / Cancelada</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Cerrar</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setModalCerrar(null)}
                                disabled={procesandoCierre}
                                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONFIRMAR ELIMINACIÓN */}
            {oppAEliminar && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
                                <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-900">¿Eliminar oportunidad?</h4>
                                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <strong>{oppAEliminar.titulo}</strong>
                        </p>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setOppAEliminar(null)}
                                disabled={eliminando}
                                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleEliminarOportunidad}
                                disabled={eliminando}
                                className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition-all shadow-sm"
                            >
                                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONVERTIR PROSPECTO A CLIENTE VOLUNTARIO */}
            {modalConvertirProspecto && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !procesandoConversion) setModalConvertirProspecto(null); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 mx-auto">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                            <h4 className="font-bold text-sm text-slate-900">¿Convertir prospecto a Cliente?</h4>
                            <p className="text-xs text-slate-500 mt-1">
                                Esta oportunidad ganada (<strong>${Number(modalConvertirProspecto.monto || 0).toLocaleString('es-MX')}</strong>) se registrará como venta formal y el prospecto pasará a tu lista de Clientes Ganados. ¿Deseas continuar?
                            </p>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                disabled={procesandoConversion}
                                onClick={() => setModalConvertirProspecto(null)}
                                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={procesandoConversion}
                                onClick={async () => {
                                    const opp = modalConvertirProspecto;
                                    setProcesandoConversion(true);
                                    try {
                                        if (onConvertirACliente) {
                                            await onConvertirACliente(opp);
                                        }
                                        setModalConvertirProspecto(null);
                                    } finally {
                                        setProcesandoConversion(false);
                                    }
                                }}
                                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                            >
                                {procesandoConversion ? 'Procesando...' : 'Sí, Convertir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
