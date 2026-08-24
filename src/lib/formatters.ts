/**
 * Helper function for standard Spanish number and currency formatting.
 * Formats numbers with dots (.) for thousands and commas (,) for decimals.
 * Examples:
 * 3.942,90
 * 32,50
 * 543.876,00
 * 1.847.395,40
 * 3.384.475.291,02
 */

export function formatNumber(val: number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) {
    return (0).toFixed(decimals).replace('.', ',');
  }
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const fixed = absVal.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const result = decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
  return isNegative ? `-${result}` : result;
}

export function formatCurrency(val: number | null | undefined): string {
  return `${formatNumber(val, 2)} €`;
}

/**
 * Converts a numeric amount into standard legal Spanish words for financial instruments like Promissory Notes (Pagarés).
 * Example: 15420.50 -> "QUINCE MIL CUATROCIENTOS VEINTE EUROS CON CINCUENTA CÉNTIMOS"
 */
export function numberToSpanishWords(num: number): string {
  if (num === null || num === undefined || isNaN(num) || num === 0) {
    return 'CERO EUROS CON CERO CÉNTIMOS';
  }

  const absNum = Math.abs(num);
  const euros = Math.floor(absNum);
  const centimos = Math.round((absNum - euros) * 100);

  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertGroup(n: number): string {
    let output = '';
    if (n === 100) return 'CIEN';
    if (n > 99) {
      output += hundreds[Math.floor(n / 100)] + ' ';
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      output += teens[n - 10] + ' ';
    } else if (n >= 20 && n <= 29) {
      if (n === 20) output += 'VEINTE ';
      else output += 'VEINTI' + units[n - 20] + ' ';
    } else if (n >= 30) {
      output += tens[Math.floor(n / 10)];
      if (n % 10 > 0) {
        output += ' Y ' + units[n % 10];
      }
      output += ' ';
    } else if (n > 0) {
      output += units[n] + ' ';
    }
    return output.trim();
  }

  function convertInteger(n: number): string {
    if (n === 0) return 'CERO';
    let str = '';

    // Millions
    const millions = Math.floor(n / 1000000);
    if (millions > 0) {
      if (millions === 1) {
        str += 'UN MILLÓN ';
      } else {
        str += convertGroup(millions) + ' MILLONES ';
      }
      n %= 1000000;
    }

    // Thousands
    const thousands = Math.floor(n / 1000);
    if (thousands > 0) {
      if (thousands === 1) {
        str += 'MIL ';
      } else {
        str += convertGroup(thousands) + ' MIL ';
      }
      n %= 1000;
    }

    // Remaining units/tens/hundreds
    if (n > 0) {
      str += convertGroup(n);
    }

    return str.trim();
  }

  const eurosText = convertInteger(euros);
  const eurosLabel = euros === 1 ? 'EURO' : 'EUROS';
  const centimosText = convertInteger(centimos);
  const centimosLabel = centimos === 1 ? 'CÉNTIMO' : 'CÉNTIMOS';

  return `${eurosText} ${eurosLabel} CON ${centimosText} ${centimosLabel}`.toUpperCase();
}

/**
 * Normalizes title casing in UI text to ensure strict Spanish standard capitalization
 * (capital only on the very first letter of the phrase, preserving acronyms like CNC, PDF, etc.).
 */
export function cleanSpanishTitle(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/Línea de Fabricación de Metal \/ Hierro \(Varilla y Punta\)/gi, 'Línea de fabricación de metal / hierro (varilla y punta)')
    .replace(/Línea de Inyección de Plástico y Ensamblaje Final/gi, 'Línea de inyección de plástico y ensamblaje final')
    .replace(/Línea de Fabricación de Metal/gi, 'Línea de fabricación de metal')
    .replace(/Línea de Inyección de Plástico/gi, 'Línea de inyección de plástico')
    .replace(/Línea Estándar \(1 Torno CNC de 2 ejes\)/gi, 'Línea estándar (1 torno CNC de 2 ejes)')
    .replace(/Línea de Alta Capacidad \(2 Tornos CNC de 2 ejes\)/gi, 'Línea de alta capacidad (2 tornos CNC de 2 ejes)')
    .replace(/Línea Inyectora y Marcado Láser/gi, 'Línea inyectora y marcado láser')
    .replace(/Carretilla Elevadora Contrapesada 2\.5T/gi, 'Carretilla elevadora contrapesada 2.5T')
    .replace(/Carretilla Elevadora Contrapesada/gi, 'Carretilla elevadora contrapesada')
    .replace(/Carretilla Elevadora/gi, 'Carretilla elevadora')
    .replace(/Nave Industrial Diáfana en Polígono Industrial/gi, 'Nave industrial diáfana en polígono industrial')
    .replace(/Nave Industrial Acondicionada/gi, 'Nave industrial acondicionada')
    .replace(/Nave Industrial/gi, 'Nave industrial')
    .replace(/Almacén Logístico con Muelles de Carga/gi, 'Almacén logístico con muelles de carga')
    .replace(/Almacén Logístico/gi, 'Almacén logístico')
    .replace(/Local Comercial Esquina de Gran Afluencia/gi, 'Local comercial esquina de gran afluencia')
    .replace(/Local Comercial Reformado/gi, 'Local comercial reformado')
    .replace(/Local Comercial/gi, 'Local comercial')
    .replace(/Al Contado/g, 'Al contado')
    .replace(/Ver \/ Imprimir Factura Adquisición \(PDF\)/gi, 'Ver / imprimir factura adquisición (PDF)')
    .replace(/Ver \/ Imprimir Nómina \(PDF\)/gi, 'Ver / imprimir nómina (PDF)')
    .replace(/Ver \/ Imprimir/gi, 'Ver / imprimir')
    .replace(/Factura Adquisición/gi, 'Factura adquisición')
    .replace(/Factura Compra/gi, 'Factura compra')
    .replace(/Factura Traslado/gi, 'Factura traslado')
    .replace(/Varilla y Punta/gi, 'varilla y punta')
    .replace(/Ensamblaje Final/gi, 'ensamblaje final')
    .replace(/Pagaré Mercantil/gi, 'Pagaré mercantil')
    .replace(/Letra de Cambio/gi, 'Letra de cambio')
    .replace(/Factura Comercial/gi, 'Factura comercial')
    .replace(/Fragmentos Hierro/gi, 'Fragmentos hierro')
    .replace(/Pellets Plástico/gi, 'Pellets plástico')
    .replace(/Pegamento Epoxi/gi, 'Pegamento epoxi')
    .replace(/IRPF Retenido/gi, 'IRPF retenido')
    .replace(/Sueldo Bruto/gi, 'Sueldo bruto')
    .replace(/Sueldo Neto/gi, 'Sueldo neto')
    .replace(/SS Empleado/gi, 'SS empleado')
    .replace(/SS Empresa/gi, 'SS empresa')
    .replace(/Turno Asignado/gi, 'Turno asignado')
    .replace(/Mes de alta \(Incompleto\)/gi, 'Mes de alta (incompleto)')
    .replace(/Inmuebles Contratados/gi, 'Inmuebles contratados')
    .replace(/Contrato Activo/gi, 'Contrato activo')
    .replace(/Operario Industrial/gi, 'Operario industrial')
    .replace(/Camionero \/ Conductor Logístico/gi, 'Camionero / conductor logístico')
    .replace(/Camionero \/ Conductor/gi, 'Camionero / conductor')
    .replace(/Turno Mañana/gi, 'Turno mañana')
    .replace(/Turno Tarde/gi, 'Turno tarde')
    .replace(/Turno Noche/gi, 'Turno noche')
    .replace(/1 Turno/gi, '1 turno')
    .replace(/2 Turnos/gi, '2 turnos')
    .replace(/3 Turnos/gi, '3 turnos');
}

