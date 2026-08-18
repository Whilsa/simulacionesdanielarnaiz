/**
 * Image Assets Helper
 * Provides direct imported image assets and SVG Data URI fallbacks
 */

import React from 'react';
import carretillaImg from '../assets/images/carretilla_elevadora_1785319922846.jpg';
import camionImg from '../assets/images/camion_trailer_1785319901174.jpg';
import cocheImg from '../assets/images/coche_empresa_1785319941496.jpg';

import naveImg from '../assets/images/nave_industrial_1786532090667.jpg';
import oficinaImg from '../assets/images/oficina_edificio_1786532102792.jpg';
import almacenImg from '../assets/images/almacen_logistico_1786532113076.jpg';

import maquinariaCncImg from '../assets/images/maquinaria_cnc_1786532124598.jpg';

import pcSobremesaImg from '../assets/images/pc_sobremesa_1786531480749.jpg';
import portatilImg from '../assets/images/portatil_ejecutivo_1786531491302.jpg';
import monitorImg from '../assets/images/monitor_profesional_1786531504134.jpg';
import softwareContabilidadImg from '../assets/images/software_contabilidad_1786531517785.jpg';
import movil5gImg from '../assets/images/telefono_movil_5g_1786531530254.jpg';
import tecladoMouseImg from '../assets/images/teclado_mouse_1786531542539.jpg';
import webcamImg from '../assets/images/webcam_4k_1785317088268.jpg';
import estanteriaMaderaImg from '../assets/images/estanteria_madera_1785317171262.jpg';
import estanteriaArchivoImg from '../assets/images/estanteria_archivo_1785317182570.jpg';
import escritorioElevableImg from '../assets/images/escritorio_elevable_1785317131689.jpg';
import escritorioOperativoImg from '../assets/images/escritorio_operativo_1785317157220.jpg';
import sillaConfidenteImg from '../assets/images/silla_confidente_1785317106568.jpg';
import sillaErgonomicaImg from '../assets/images/silla_ergonomica_1785317117279.jpg';
import mesaReunionesImg from '../assets/images/mesa_reuniones_1785317144813.jpg';
import telefonoIpImg from '../assets/images/telefono_ip_ejecutivo_1785318472674.jpg';
import centralitaImg from '../assets/images/telefono_ip_video_1785318437550.jpg';
import telefonoDectImg from '../assets/images/telefono_dect_1785318456290.jpg';
import impresoraMonocromoImg from '../assets/images/impresora_monocromo_1785318553665.jpg';
import plotterImg from '../assets/images/plotter_impresora_1785318536561.jpg';
import ofimaticaProImg from '../assets/images/ofimatica_profesional_1785318518217.jpg';
import officeSuiteImg from '../assets/images/office_suite_5in1_1785318502213.jpg';
import gestionDocumentalImg from '../assets/images/gestion_documental_1785318487159.jpg';

import sillaCueroImg from '../assets/images/silla_cuero_brown_1786543008301.jpg';
import estanteriaIndustrialImg from '../assets/images/estanteria_industrial_pesada_1786543021053.jpg';
import impresoraColorHpImg from '../assets/images/impresora_color_hp_1786543035215.jpg';
import telefonoRazrImg from '../assets/images/telefono_razr_ultra_1786543048367.jpg';
import telefonoRedmiImg from '../assets/images/telefono_redmi_blue_1786543061573.jpg';
import pcAllInOneImg from '../assets/images/pc_all_in_one_white_1786543073719.jpg';

// Guaranteed fallback SVG Data URI (works 100% offline, inside iframes, everywhere)
export const SVG_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#0f172a"/>
  <rect x="20" y="20" width="560" height="360" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <circle cx="300" cy="170" r="48" fill="#3b82f6" opacity="0.2"/>
  <path d="M280 150 L320 150 L320 190 L280 190 Z" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M270 200 L330 200" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/>
  <text x="300" y="250" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#f8fafc">Equipamiento Industrial</text>
  <text x="300" y="275" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#94a3b8">Portal de Gestión Corporativa</text>
</svg>
`)}`;

export const VEHICLE_IMAGES: Record<string, string> = {
  carretilla_elevadora: carretillaImg,
  camion_trailer: camionImg,
  coche_empresa: cocheImg,
};

export const PROPERTY_IMAGES_MAP: Record<string, string> = {
  nave_industrial: naveImg,
  oficina: oficinaImg,
  local_comercial: oficinaImg,
  almacen: almacenImg,
};

export const PRODUCT_IMAGES_MAP: Record<string, string> = {
  pc_sobremesa: pcSobremesaImg,
  pc_all_in_one_white: pcAllInOneImg,
  portatil_ejecutivo: portatilImg,
  monitor_profesional: monitorImg,
  software_contabilidad: softwareContabilidadImg,
  telefono_movil_5g: movil5gImg,
  telefono_razr_ultra: telefonoRazrImg,
  telefono_redmi_blue: telefonoRedmiImg,
  teclado_mouse: tecladoMouseImg,
  webcam_4k: webcamImg,
  estanteria_madera: estanteriaMaderaImg,
  estanteria_archivo: estanteriaArchivoImg,
  estanteria_industrial_pesada: estanteriaIndustrialImg,
  escritorio_elevable: escritorioElevableImg,
  escritorio_operativo: escritorioOperativoImg,
  silla_confidente: sillaConfidenteImg,
  silla_ergonomica: sillaErgonomicaImg,
  silla_ejecutiva_cuero: sillaCueroImg,
  mesa_reuniones: mesaReunionesImg,
  telefono_fijo_ip_ejecutivo: telefonoIpImg,
  centralita_telefono_conferencia: centralitaImg,
  telefono_inalambrico_dect: telefonoDectImg,
  impresora_laser_monocromo: impresoraMonocromoImg,
  impresora_color_hp: impresoraColorHpImg,
  plotter_profesional: plotterImg,
  licencia_ofimatica_profesional: ofimaticaProImg,
  licencia_ofimatica_estandar: officeSuiteImg,
  software_gestion_documental: gestionDocumentalImg,
};

export const MACHINERY_IMAGE = maquinariaCncImg;

/**
 * Resolves an image URL or item title/key to an imported Vite asset or fallback
 */
export function resolveImageUrl(
  urlOrTitle?: string,
  defaultType: 'vehicle' | 'property' | 'product' | 'machinery' = 'product',
  extraContext?: string
): string {
  const query = `${urlOrTitle || ''} ${extraContext || ''}`.toLowerCase();

  // 1. Check exact key matches first
  for (const [key, asset] of Object.entries(PRODUCT_IMAGES_MAP)) {
    if (query.includes(key)) return asset;
  }
  for (const [key, asset] of Object.entries(VEHICLE_IMAGES)) {
    if (query.includes(key)) return asset;
  }
  for (const [key, asset] of Object.entries(PROPERTY_IMAGES_MAP)) {
    if (query.includes(key)) return asset;
  }

  // 2. Keyword-based intelligent matching for titles, unsplash URLs, descriptions, etc.
  
  // VEHICLES
  if (query.includes('carretilla') || query.includes('elevadora') || query.includes('forklift')) return carretillaImg;
  if (query.includes('camion') || query.includes('trailer') || query.includes('truck')) return camionImg;
  if (query.includes('coche') || query.includes('turismo') || query.includes('empresa') || query.includes('vehiculo') || query.includes('auto')) return cocheImg;

  // PROPERTIES
  if (query.includes('nave') || query.includes('industrial') || query.includes('fabrica')) return naveImg;
  if (query.includes('almacen') || query.includes('logistico') || query.includes('deposito')) return almacenImg;
  if (query.includes('oficina') || query.includes('local') || query.includes('edificio') || query.includes('despacho') || query.includes('comercial')) return oficinaImg;

  // MACHINERY
  if (query.includes('maquinaria') || query.includes('cnc') || query.includes('maquina') || query.includes('torno') || query.includes('fresadora') || query.includes('prensa')) return maquinariaCncImg;

  // PRODUCTS - OFFICE FURNITURE & TECH
  // Chairs / Sillas
  if (query.includes('cuero') || query.includes('silla_ejecutiva') || query.includes('marron') || query.includes('brown')) return sillaCueroImg;
  if (query.includes('confidente') || query.includes('visita')) return sillaConfidenteImg;
  if (query.includes('silla') || query.includes('chair') || query.includes('sillon') || query.includes('ergonomica') || query.includes('direccion') || query.includes('ejecutiva')) return sillaErgonomicaImg;

  // Tables / Desks / Mesas
  if (query.includes('elevable') || query.includes('stand-sit') || query.includes('altpro')) return escritorioElevableImg;
  if (query.includes('reunione') || query.includes('conferencia') || query.includes('octogonal')) return mesaReunionesImg;
  if (query.includes('mesa') || query.includes('escritorio') || query.includes('desk') || query.includes('operativo')) return escritorioOperativoImg;

  // Shelves / Estanterías
  if (query.includes('pesada') || query.includes('industrial') || query.includes('rack') || query.includes('carga')) return estanteriaIndustrialImg;
  if (query.includes('madera') || query.includes('nogal') || query.includes('maciza')) return estanteriaMaderaImg;
  if (query.includes('estanteria') || query.includes('estante') || query.includes('archivo') || query.includes('balda')) return estanteriaArchivoImg;

  // Phones & Telecom / Teléfonos
  if (query.includes('razr') || query.includes('plegable') || query.includes('ultra 512gb') || query.includes('cero-riesgo')) return telefonoRazrImg;
  if (query.includes('redmi') || query.includes('xiaomi') || query.includes('200mp') || query.includes('amoled') || query.includes('256gb')) return telefonoRedmiImg;
  if (query.includes('5g') || query.includes('movil') || query.includes('smartphone') || query.includes('celular')) return movil5gImg;
  if (query.includes('centralita') || query.includes('video') || query.includes('conferencia') || query.includes('switchboard')) return centralitaImg;
  if (query.includes('dect') || query.includes('inalambrico')) return telefonoDectImg;
  if (query.includes('telefono') || query.includes('telco') || query.includes('pyme') || query.includes('fibra') || query.includes('ip')) return telefonoIpImg;

  // Computers / Laptops / PCs
  if (query.includes('portatil') || query.includes('laptop') || query.includes('ultrabook') || query.includes('notebook')) return portatilImg;
  if (query.includes('all-in-one') || query.includes('todo-en-uno') || query.includes('27" 4k') || query.includes('pc_all_in_one')) return pcAllInOneImg;
  if (query.includes('pc') || query.includes('sobremesa') || query.includes('tower') || query.includes('workstation') || query.includes('ordenador') || query.includes('desktop')) return pcSobremesaImg;
  if (query.includes('monitor') || query.includes('pantalla') || query.includes('display')) return monitorImg;

  // Peripherals / Tech
  if (query.includes('webcam') || query.includes('camara') || query.includes('camera')) return webcamImg;
  if (query.includes('teclado') || query.includes('raton') || query.includes('mouse') || query.includes('keyboard') || query.includes('logitech')) return tecladoMouseImg;

  // Printers / Plotters / Impresoras
  if (query.includes('plotter') || query.includes('gran formato')) return plotterImg;
  if (query.includes('color') || query.includes('hp') || query.includes('multifuncion color')) return impresoraColorHpImg;
  if (query.includes('impresora') || query.includes('printer') || query.includes('laser') || query.includes('monocromo') || query.includes('fotocopiadora')) return impresoraMonocromoImg;

  // Software & Licenses
  if (query.includes('contabilidad') || query.includes('factura') || query.includes('fiscal') || query.includes('erp')) return softwareContabilidadImg;
  if (query.includes('documental') || query.includes('gestion documental') || query.includes('archivo digital')) return gestionDocumentalImg;
  if (query.includes('ofimatica') || query.includes('office') || query.includes('licencia') || query.includes('suite')) return ofimaticaProImg;

  // Default fallbacks by category type
  if (defaultType === 'vehicle') return carretillaImg;
  if (defaultType === 'property') return naveImg;
  if (defaultType === 'machinery') return maquinariaCncImg;

  // Direct valid local asset or non-unsplash URL
  if (urlOrTitle && (urlOrTitle.startsWith('/') || urlOrTitle.startsWith('http')) && !urlOrTitle.includes('unsplash.com')) {
    return urlOrTitle;
  }

  return pcSobremesaImg;
}

/**
 * Standard onError handler for <img> tags that sets target.src to a guaranteed fallback
 */
export function handleImgError(e: React.SyntheticEvent<HTMLImageElement, Event>, fallbackUrl: string = SVG_FALLBACK) {
  const target = e.currentTarget;
  if (target.src !== fallbackUrl) {
    target.src = fallbackUrl;
  }
}
