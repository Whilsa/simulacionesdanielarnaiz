/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PropertyType, OperationType } from '../types.js';

export interface SpanishRegion {
  community: string;
  municipalities: string[];
  priceMultiplier: number; // Regional market adjustment
}

export const SPANISH_REGIONS: SpanishRegion[] = [
  {
    community: 'Comunidad de Madrid',
    municipalities: ['Madrid', 'Getafe', 'Leganés', 'Alcorcón', 'Fuenlabrada', 'Coslada', 'Alcalá de Henares', 'Las Rozas', 'Pozuelo de Alarcón'],
    priceMultiplier: 1.35,
  },
  {
    community: 'Cataluña',
    municipalities: ['Barcelona', 'L\'Hospitalet de Llobregat', 'Badalona', 'Terrassa', 'Sabadell', 'Sant Cugat del Vallès', 'Mataró', 'Girona'],
    priceMultiplier: 1.30,
  },
  {
    community: 'Andalucía',
    municipalities: ['Sevilla', 'Málaga', 'Córdoba', 'Granada', 'Jerez de la Frontera', 'Almería', 'Huelva', 'Cádiz', 'Marbella'],
    priceMultiplier: 0.95,
  },
  {
    community: 'Comunitat Valenciana',
    municipalities: ['Valencia', 'Alicante', 'Elche', 'Castellón de la Plana', 'Torrevieja', 'Gandía', 'Paterna', 'Sagunto'],
    priceMultiplier: 0.98,
  },
  {
    community: 'País Vasco',
    municipalities: ['Bilbao', 'San Sebastián', 'Vitoria-Gasteiz', 'Barakaldo', 'Irun', 'Getxo'],
    priceMultiplier: 1.25,
  },
  {
    community: 'Galicia',
    municipalities: ['Vigo', 'A Coruña', 'Ourense', 'Lugo', 'Santiago de Compostela', 'Pontevedra', 'Ferrol'],
    priceMultiplier: 0.88,
  },
  {
    community: 'Castilla y León',
    municipalities: ['Valladolid', 'Burgos', 'Salamanca', 'León', 'Palencia', 'Zamora', 'Segovia', 'Ávila', 'Soria'],
    priceMultiplier: 0.82,
  },
  {
    community: 'Castilla-La Mancha',
    municipalities: ['Toledo', 'Albacete', 'Ciudad Real', 'Guadalajara', 'Cuenca', 'Talavera de la Reina'],
    priceMultiplier: 0.80,
  },
  {
    community: 'Aragón',
    municipalities: ['Zaragoza', 'Huesca', 'Teruel', 'Ejea de los Caballeros'],
    priceMultiplier: 0.90,
  },
  {
    community: 'País Vasco - Navarra',
    municipalities: ['Pamplona', 'Tudela', 'Barañáin'],
    priceMultiplier: 1.10,
  },
];

// High quality curated unsplash image collections per type
export const PROPERTY_IMAGES: Record<PropertyType, string[]> = {
  nave_industrial: [
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80', // Industrial warehouse exterior/interior
    'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80', // Logistics hub
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80', // Modern factory building
    'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=800&q=80', // Industrial park
  ],
  almacen: [
    'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=800&q=80', // Warehouse interior shelves
    'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80', // Storage facility
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', // Distribution center
    'https://images.unsplash.com/photo-1590247819200-16176cd17755?auto=format&fit=crop&w=800&q=80', // Modern bay doors
  ],
  local_comercial: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80', // Retail storefront
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80', // Commercial space
    'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=80', // Store interior
    'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80', // Corner retail unit
  ],
};

export const REAL_ESTATE_PRICE_RANGES: Record<PropertyType, { buyM2Min: number; buyM2Max: number; rentM2Min: number; rentM2Max: number }> = {
  nave_industrial: { buyM2Min: 650, buyM2Max: 1350, rentM2Min: 4.5, rentM2Max: 9.5 },
  almacen: { buyM2Min: 500, buyM2Max: 1100, rentM2Min: 3.8, rentM2Max: 8.0 },
  local_comercial: { buyM2Min: 1200, buyM2Max: 3200, rentM2Min: 8.0, rentM2Max: 26.0 },
};

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getRandomFloat(min: number, max: number, decimals = 2): number {
  const rand = Math.random() * (max - min) + min;
  return Number(rand.toFixed(decimals));
}

// Generate random Land Percentage (% Suelo) strictly between 55% and 75%
export function generateLandPercentage(): number {
  return getRandomInt(55, 75);
}

// Generate location based on scope
export function generateLocation(
  scope: 'espana' | 'comunidad' | 'municipio',
  selectedCommunity?: string,
  selectedMunicipality?: string
): { community: string; municipality: string; address: string; priceMultiplier: number } {
  let region: SpanishRegion;

  if (scope === 'municipio' && selectedCommunity && selectedMunicipality) {
    region = SPANISH_REGIONS.find(r => r.community === selectedCommunity) || getRandomElement(SPANISH_REGIONS);
    const municipality = selectedMunicipality;
    const address = generateStreetAddress(municipality);
    return { community: region.community, municipality, address, priceMultiplier: region.priceMultiplier };
  }

  if (scope === 'comunidad' && selectedCommunity) {
    region = SPANISH_REGIONS.find(r => r.community === selectedCommunity) || getRandomElement(SPANISH_REGIONS);
  } else {
    region = getRandomElement(SPANISH_REGIONS);
  }

  const municipality = getRandomElement(region.municipalities);
  const address = generateStreetAddress(municipality);

  return {
    community: region.community,
    municipality,
    address,
    priceMultiplier: region.priceMultiplier,
  };
}

function generateStreetAddress(municipality: string): string {
  const streetTypes = ['Polígono Industrial', 'Avenida de la Industria', 'Calle de la Logística', 'Calle Comercio', 'Avenida del Euro', 'Polígono Empresarial'];
  const nameTypes = ['Los Olivos', 'Suroeste', 'Norte', 'San José', 'El Prado', 'Las Arenas', 'Central', 'Tecnológico'];
  const number = getRandomInt(1, 140);
  return `${getRandomElement(streetTypes)} ${getRandomElement(nameTypes)}, Nº ${number}, ${municipality}`;
}

// Calculate market realistic price for property
export function calculateRealisticPrice(
  type: PropertyType,
  operation: OperationType,
  surfaceM2: number,
  priceMultiplier = 1.0
): { basePrice: number; pricePerM2: number } {
  const ranges = REAL_ESTATE_PRICE_RANGES[type];
  let m2Rate: number;

  if (operation === 'compra') {
    m2Rate = getRandomFloat(ranges.buyM2Min, ranges.buyM2Max, 0) * priceMultiplier;
    m2Rate = Math.round(m2Rate);
  } else {
    m2Rate = getRandomFloat(ranges.rentM2Min, ranges.rentM2Max, 1) * priceMultiplier;
    m2Rate = Number(m2Rate.toFixed(2));
  }

  const basePrice = Math.round(surfaceM2 * m2Rate);
  return { basePrice, pricePerM2: m2Rate };
}
