/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfficeStoreItem, TelecomPlan } from '../types.js';

export const TELECOM_PLANS: TelecomPlan[] = [
  {
    id: 'tel-pyme-600',
    name: 'Plan Pyme Conectada 600 Mb',
    provider: 'TeleCom Pymes España',
    monthlyPrice: 49.90,
    speedMbps: 600,
    mobileLinesCount: 3,
    includesStaticIP: true,
    includesSwitchboard: true,
    includes5G: true,
    slaHours: 6,
    description: 'Solución integral de conectividad básica para pequeñas empresas y oficinas comerciales.',
    features: [
      'Fibra Óptica Simétrica 600 Mbps de alta velocidad',
      'IP Fija Estática para servidores corporativos',
      '3 Líneas móviles 5G con llamadas e internet ilimitados',
      'Centralita Virtual Básica (hasta 3 extensiones)',
      'Soporte Técnico Pyme 24/7 (SLA < 6 horas)',
      'Router Wifi 6 de grado empresarial incluido'
    ],
    imageUrl: '/images/products/telefono_fijo_ip_ejecutivo.jpg'
  },
  {
    id: 'tel-empresa-1000',
    name: 'Plan Empresa Fibra 1 Gbps Pro',
    provider: 'IberCom Corp & Fibra',
    monthlyPrice: 89.90,
    speedMbps: 1000,
    mobileLinesCount: 6,
    includesStaticIP: true,
    includesSwitchboard: true,
    includes5G: true,
    slaHours: 4,
    description: 'Paquete avanzado de alto rendimiento con fibra 1 Gbps, 6 líneas 5G y centralita telefónica completa.',
    features: [
      'Fibra Óptica Simétrica 1.000 Mbps (1 Gbps Real)',
      'IP Fija Corporativa + DNS Dinámico',
      '6 Líneas móviles 5G Pro con llamadas ilimitadas y roaming UE',
      'Centralita Virtual Cloud Avanzada con desvío inteligente y locución',
      'Servicio de Ciberseguridad Cloud & Firewall de red',
      'Soporte Técnico Prioritario SLA < 4 horas'
    ],
    imageUrl: '/images/products/centralita_telefono_conferencia.jpg'
  },
  {
    id: 'tel-corp-2000',
    name: 'Plan Corporativo Fibra Dedicada 2 Gbps',
    provider: 'Global Telco Business',
    monthlyPrice: 179.90,
    speedMbps: 2000,
    mobileLinesCount: 15,
    includesStaticIP: true,
    includesSwitchboard: true,
    includes5G: true,
    slaHours: 2,
    description: 'Infraestructura de máxima exigencia con fibra óptica dedicada, multi-sede y atención garantizada 24/7.',
    features: [
      'Fibra Óptica Dedicada 2.000 Mbps con caudal 100% garantizado',
      'Rango de 4 IP Fijas Públicas',
      '15 Líneas móviles 5G Ultra corporativas con datos compartidos',
      'Centralita IP Multi-Puesto Cloud ilimitada con integración CRM',
      'Gestor de Cuenta Personalizado y Soporte Crítico SLA < 2 horas 24/7/365',
      'Instalación redundante de backup 4G/5G automático'
    ],
    imageUrl: '/images/products/telefono_movil_5g.jpg'
  }
];

export const OFFICE_STORE_CATALOG: OfficeStoreItem[] = [
  // 1. ESTANTERÍAS (3 tipos)
  {
    id: 'est-01',
    name: 'Estantería Metálica Industrial Carga Pesada',
    category: 'estanterias',
    categoryLabel: 'Estanterías',
    price: 180,
    description: 'Estantería metálica galvanizada de alta resistencia para almacén u oficina. Soporta hasta 350 kg por balda.',
    specs: ['Dimensiones: 200 x 100 x 50 cm', '5 baldas regulables en altura', 'Acero galvanizado anti-corrosión', 'Capacidad total: 1.750 kg'],
    imageUrl: '/images/products/estanteria_industrial_pesada.jpg'
  },
  {
    id: 'est-02',
    name: 'Estantería de Archivo Modular para Oficinas',
    category: 'estanterias',
    categoryLabel: 'Estanterías',
    price: 120,
    description: 'Estantería ligera y estilizada de paneles MDF y estructura de acero para carpetas AZ y documentación.',
    specs: ['Dimensiones: 180 x 90 x 40 cm', '5 estantes para carpetas de archivo', 'Acabado en roble claro y metal blanco', 'Montaje sin tornillos'],
    imageUrl: '/images/products/estanteria_archivo.jpg'
  },
  {
    id: 'est-03',
    name: 'Estantería Ejecutiva de Madera Maciza',
    category: 'estanterias',
    categoryLabel: 'Estanterías',
    price: 290,
    description: 'Estantería de diseño para despacho de dirección con baldas reforzadas de nogal y protección antivuelco.',
    specs: ['Dimensiones: 195 x 110 x 38 cm', 'Madera maciza de nogal con barniz ecológico', 'Diseño elegante con baldas ajustables', 'Garantía corporativa de 5 años'],
    imageUrl: '/images/products/estanteria_madera.jpg'
  },

  // 2. MESAS (3 tipos)
  {
    id: 'mes-01',
    name: 'Escritorio Operativo Ergonómico Pro 140x80cm',
    category: 'mesas',
    categoryLabel: 'Mesas de Oficina',
    price: 210,
    description: 'Mesa de trabajo individual con pasacables integrado y estructura de acero reforzado.',
    specs: ['Medidas: 140 x 80 x 74 cm', 'Tablero de melamina anti-rayaduras de 25mm', 'Patas metálicas en T con niveladores', 'Grommets doble pasacables'],
    imageUrl: '/images/products/escritorio_operativo.jpg'
  },
  {
    id: 'mes-02',
    name: 'Mesa de Reuniones Ejecutiva Octogonal (8 puestos)',
    category: 'mesas',
    categoryLabel: 'Mesas de Oficina',
    price: 650,
    description: 'Mesa de conferencias espaciosa con caja de conexiones integrada (HDMI, USB-C y tomas schuko).',
    specs: ['Medidas: 240 x 120 x 75 cm', 'Capacidad para 8 personas holgadamente', 'Estructura central electrification-ready', 'Acabado melamínico roble/grafito'],
    imageUrl: '/images/products/mesa_reuniones.jpg'
  },
  {
    id: 'mes-03',
    name: 'Escritorio Elevable Eléctrico Stand-Sit AltPro',
    category: 'mesas',
    categoryLabel: 'Mesas de Oficina',
    price: 420,
    description: 'Mesa regulable en altura mediante motor eléctrico silencioso y memorias de posición ergométricas.',
    specs: ['Rango de altura: 62 cm a 128 cm', 'Motor dual ultra-silencioso (<45dB)', 'Panel digital con 4 memorias de altura', 'Carga máxima: 120 kg'],
    imageUrl: '/images/products/escritorio_elevable.jpg'
  },

  // 3. SILLAS (3 tipos)
  {
    id: 'sil-01',
    name: 'Silla Ergonómica Operativa Malla Transpirable Ergoclean',
    category: 'sillas',
    categoryLabel: 'Sillas de Oficina',
    price: 160,
    description: 'Silla de oficina ergonómica con respaldo en malla transpirable, soporte lumbar regulable y reposabrazos 3D.',
    specs: ['Mecanismo sincro con bloqueo en 3 posiciones', 'Soporte lumbar ajustable en altura y profundidad', 'Ruedas de goma aptas para parquet', 'Certificado ergonómico EN-1335'],
    imageUrl: '/images/products/silla_ergonomica.jpg'
  },
  {
    id: 'sil-02',
    name: 'Silla Ejecutiva de Dirección Cuero Premium Regulable',
    category: 'sillas',
    categoryLabel: 'Sillas de Oficina',
    price: 340,
    description: 'Silla alta para despacho de dirección en piel sintética suave de gran durabilidad y acolchado de alta densidad.',
    specs: ['Acabado en cuero flor negro acolchado', 'Base de aluminio pulido de 5 radios', 'Pistón de gas Clase 4 de alta resistencia', 'Basculante avanzado con tensión regulable'],
    imageUrl: '/images/products/silla_ejecutiva_cuero.jpg'
  },
  {
    id: 'sil-03',
    name: 'Silla de Confidente / Salón de Reuniones Apilable',
    category: 'sillas',
    categoryLabel: 'Sillas de Oficina',
    price: 85,
    description: 'Silla de patín cromado para salas de visitas y reuniones, confortable y fácil de almacenar.',
    specs: ['Estructura de tubo de acero cromado', 'Respaldo y asiento tapizados en tela ignífuga', 'Apilable hasta 5 unidades', 'Topes antideslizantes de protección'],
    imageUrl: '/images/products/silla_confidente.jpg'
  },

  // 4. ORDENADORES DE SOBREMESA (3 tipos)
  {
    id: 'pc-01',
    name: 'PC Oficina Compact i5 / 16GB RAM / 512GB SSD / Win 11 Pro',
    category: 'sobremesa',
    categoryLabel: 'Ordenadores de Sobremesa',
    price: 580,
    description: 'Ordenador de sobremesa en formato torre compacta, optimizado para tareas de ofimática, navegación y gestión contable.',
    specs: ['Procesador Intel Core i5 de 13ª Gen', '16 GB RAM DDR4 3200MHz', 'Disco duro 512 GB SSD NVMe M.2', 'Windows 11 Pro Licencia Corporativa original'],
    imageUrl: '/images/products/pc_sobremesa.jpg'
  },
  {
    id: 'pc-02',
    name: 'PC Workstation Profesional i7 / 32GB RAM / 1TB NVMe / RTX',
    category: 'sobremesa',
    categoryLabel: 'Ordenadores de Sobremesa',
    price: 1150,
    description: 'Estación de trabajo potente diseñada para cargas de trabajo exigentes, diseño, análisis masivo de datos y multitarea.',
    specs: ['Procesador Intel Core i7 13700K', '32 GB RAM DDR5 ultra-rápida', '1 TB SSD M.2 PCIe 4.0 (7000 MB/s)', 'Tarjeta gráfica Nvidia RTX 3060 12GB'],
    imageUrl: '/images/products/pc_sobremesa.jpg'
  },
  {
    id: 'pc-03',
    name: 'All-in-One Empresarial 27" 4K i7 / 32GB / Teclado y Ratón',
    category: 'sobremesa',
    categoryLabel: 'Ordenadores de Sobremesa',
    price: 1380,
    description: 'Ordenador todo-en-uno con pantalla de 27 pulgadas 4K IPS, diseño ultra-estilizado para puestos de atención al público u oficinas sin cables.',
    specs: ['Pantalla 27" 4K UHD (3840x2160) IPS', 'Intel Core i7 / 32GB RAM / 1TB SSD', 'Webcam emergente 5MP con micrófono', 'Incluye Kit Teclado y Ratón inalámbrico premium'],
    imageUrl: '/images/products/pc_all_in_one_white.jpg'
  },

  // 5. ORDENADORES PORTÁTILES (3 tipos)
  {
    id: 'lap-01',
    name: 'Portátil UltraBook 14" i5 / 16GB / 512GB SSD / 1.1kg',
    category: 'portatiles',
    categoryLabel: 'Ordenadores Portátiles',
    price: 740,
    description: 'Portátil ultraligero con excelente autonomía de batería, ideal para movilidad corporativa y trabajo en ruta.',
    specs: ['Pantalla 14" Full HD Antirreflejos', 'Intel Core i5 / 16GB RAM / 512GB SSD', 'Batería hasta 12 horas de duración', 'Peso: 1.1 kg / Chasis de aluminio'],
    imageUrl: '/images/products/portatil_ejecutivo.jpg'
  },
  {
    id: 'lap-02',
    name: 'Laptop Ejecutivo Pro 15.6" i7 / 32GB / 1TB SSD / Win 11 Pro',
    category: 'portatiles',
    categoryLabel: 'Ordenadores Portátiles',
    price: 1090,
    description: 'Portátil de alto rendimiento empresarial con teclado numérico dedicado y pantalla de 15.6 pulgadas de alta precisión.',
    specs: ['Pantalla 15.6" IPS FHD (100% sRGB)', 'Intel Core i7 de 13ª Gen / 32GB RAM', '1 TB SSD M.2 NVMe', 'Lector de huellas dactilares y Chip TPM 2.0'],
    imageUrl: '/images/products/portatil_ejecutivo.jpg'
  },
  {
    id: 'lap-03',
    name: 'Workstation Portátil 16" Ryzen 7 / 32GB / Gráficos Dedicados',
    category: 'portatiles',
    categoryLabel: 'Ordenadores Portátiles',
    price: 1450,
    description: 'Portátil workstation diseñado para ingenieros, directivos y profesionales que requieren máxima potencia gráfica y de procesamiento.',
    specs: ['Pantalla 16" QHD+ (2560x1600) 165Hz', 'AMD Ryzen 7 7840HS / 32GB DDR5 / 1TB SSD', 'Nvidia RTX 4060 8GB VRAM', 'Chasis de magnesio resistente militar MIL-STD'],
    imageUrl: '/images/products/portatil_ejecutivo.jpg'
  },

  // 6. PERIFÉRICOS (3 tipos)
  {
    id: 'per-01',
    name: 'Kit Teclado y Ratón Inalámbrico Ergonómico Logitech Pro',
    category: 'perifericos',
    categoryLabel: 'Periféricos',
    price: 65,
    description: 'Conjunto de teclado silencioso con reposamuñecas y ratón ergonómico de alta precisión inalámbrico.',
    specs: ['Conexión Bluetooth y receptor USB 2.4GHz', 'Teclas de acceso rápido multimedia programables', 'Autonomía de batería de hasta 36 meses', 'Diseño silencioso SilentTouch'],
    imageUrl: '/images/products/teclado_mouse.jpg'
  },
  {
    id: 'per-02',
    name: 'Monitor Profesional 27" IPS QHD Regulable con Hub USB-C',
    category: 'perifericos',
    categoryLabel: 'Periféricos',
    price: 240,
    description: 'Monitor ergonómico de 27 pulgadas con resolución QHD (2560x1440), altavoces integrados y puerto USB-C con carga 65W.',
    specs: ['Panel IPS 27" QHD (2560 x 1440 px)', 'Conexión USB-C (Power Delivery 65W + vídeo)', 'Soporte pivotante (giratorio, inclinable, regulable)', 'Filtro Eye Care anti-parpadeo y luz azul'],
    imageUrl: '/images/products/monitor_profesional.jpg'
  },
  {
    id: 'per-03',
    name: 'Webcam 4K UltraHD Conferencias con Micrófono Estéreo',
    category: 'perifericos',
    categoryLabel: 'Periféricos',
    price: 110,
    description: 'Cámara web profesional para videollamadas y reuniones corporativas en resolución 4K con cancelación de ruido.',
    specs: ['Resolución 4K a 30fps / 1080p a 60fps', 'Enfoque automático HDR y encuadre inteligente', 'Doble micrófono omnidireccional con filtro de ruido', 'Tapa física de privacidad integrada'],
    imageUrl: '/images/products/webcam_4k.jpg'
  },

  // 7. IMPRESORAS (3 tipos)
  {
    id: 'imp-01',
    name: 'Impresora Láser Multifunción Color Dúplex de Red',
    category: 'impresoras',
    categoryLabel: 'Impresoras',
    price: 380,
    description: 'Equipamiento multifunción 4-en-1 (impresora, escáner, fotocopiadora y fax) con impresión automática a doble cara.',
    specs: ['Velocidad: 28 ppm en color y monocromo', 'Conectividad WiFi 5, Ethernet y USB', 'Pantalla táctil a color de 4.3 pulgadas', 'Escáner alimentador automático (ADF) de 50 hojas'],
    imageUrl: '/images/products/impresora_color_hp.jpg'
  },
  {
    id: 'imp-02',
    name: 'Impresora Láser Monocromo Alta Velocidad (45 ppm)',
    category: 'impresoras',
    categoryLabel: 'Impresoras',
    price: 260,
    description: 'Impresora monocromo ultrarrápida para altos volúmenes de facturas, albaranes y contratos.',
    specs: ['Velocidad de impresión: 45 páginas por minuto', 'Bandeja de papel de 550 hojas ampliable', 'Impresión dúplex automática', 'Tóner de alta capacidad (12.000 páginas)'],
    imageUrl: '/images/products/impresora_laser_monocromo.jpg'
  },
  {
    id: 'imp-03',
    name: 'Plotter y Multifunción Gran Formato A3/A4 Corporativa',
    category: 'impresoras',
    categoryLabel: 'Impresoras',
    price: 890,
    description: 'Equipo profesional de impresión y digitalización de gran formato A3/A4 para planos, carteles y balances de empresa.',
    specs: ['Soporta formatos desde A6 hasta A3+', 'Impresión de alta precisión de planos y documentos', 'Doble bandeja de papel A4 y A3 independientes', 'Conectividad Cloud Print y gestión securizada'],
    imageUrl: '/images/products/plotter_profesional.jpg'
  },

  // 8. PROGRAMAS INFORMÁTICOS - PROCESADORES DE TEXTO / OFIMÁTICA (3 tipos)
  {
    id: 'soft-txt-01',
    name: 'Licencia Anual Suite Ofimática Empresarial TextPro (1 Puesto)',
    category: 'software_texto',
    categoryLabel: 'Programas de Procesadores de Texto',
    price: 85,
    description: 'Licencia corporativa individual para procesador de textos profesional, hojas de cálculo y presentaciones.',
    specs: ['Licencia para 1 puesto de trabajo por 12 meses', 'Procesador de textos con corrector ortográfico avanzado', 'Formatos compatibles: .docx, .pdf, .rtf, .odt', 'Soporte técnico y actualizaciones incluidas'],
    imageUrl: '/images/products/licencia_ofimatica_estandar.jpg'
  },
  {
    id: 'soft-txt-02',
    name: 'Suite DocuOffice Corporate Anual (Pack 5 Licencias)',
    category: 'software_texto',
    categoryLabel: 'Programas de Procesadores de Texto',
    price: 320,
    description: 'Pack de 5 licencias para equipo de oficina con almacenamiento cloud de documentos y edición colaborativa en tiempo real.',
    specs: ['5 Licencias corporativas independientes', '1 TB de almacenamiento en la nube por usuario', 'Colaboración en tiempo real en documentos de texto', 'Firma digital integrada de documentos PDF'],
    imageUrl: '/images/products/licencia_ofimatica_profesional.jpg'
  },
  {
    id: 'soft-txt-03',
    name: 'Software de Redacción y Gestión Documental Avanzada',
    category: 'software_texto',
    categoryLabel: 'Programas de Procesadores de Texto',
    price: 190,
    description: 'Programa especializado en la redacción de contratos, informes técnicos, actas corporativas y plantillas legales automatizadas.',
    specs: ['Licencia permanente para 1 equipo', 'Biblioteca con más de 500 plantillas legales y comerciales', 'Indexación y búsqueda semántica de documentos', 'Exportación masiva a PDF/A securizado'],
    imageUrl: '/images/products/software_gestion_documental.jpg'
  },

  // 9. PROGRAMAS INFORMÁTICOS - CONTABILIDAD Y GESTIÓN (3 tipos)
  {
    id: 'soft-cnt-01',
    name: 'Licencia ContaEmpresa Cloud Anual (Módulo Pymes)',
    category: 'software_conta',
    categoryLabel: 'Programas de Contabilidad',
    price: 290,
    description: 'Software contable en la nube adaptado al Plan General Contable (PGC). Generación de Libro Diario, Mayor y Balances.',
    specs: ['Suscripción por 1 año con copias de seguridad automáticas', 'Plan General Contable de Pymes completo integrado', 'Presentación oficial de Cuentas Anuales e Impuestos (IVA/IS)', 'Generación de ficheros para AEAT'],
    imageUrl: '/images/products/software_contabilidad.jpg'
  },
  {
    id: 'soft-cnt-02',
    name: 'Software Contabilidad y Facturación Pro (Multi-Empresa)',
    category: 'software_conta',
    categoryLabel: 'Programas de Contabilidad',
    price: 450,
    description: 'Programa profesional de contabilidad financiera, analítica y gestión de facturación emitida y recibida.',
    specs: ['Licencia corporativa multi-usuario y multi-empresa', 'Conciliación bancaria automática con archivos N43', 'Gestión de amortizaciones de inmovilizado y patrimonio', 'Cuadro de mando e informes de liquidez en tiempo real'],
    imageUrl: '/images/products/software_contabilidad.jpg'
  },
  {
    id: 'soft-cnt-03',
    name: 'ERP Fiscal, Financiero y Contable Corporativo Full',
    category: 'software_conta',
    categoryLabel: 'Programas de Contabilidad',
    price: 890,
    description: 'Sistema ERP contable integral con gestión de tesorería, presupuestos, cobros, pagos, cartera de efectos y auditoría.',
    specs: ['Licencia ilimitada de servidor corporativo', 'Módulo de auditoría interna y trazabilidad de asientos', 'Automatización de remesas bancarias SEPA XML', 'Integración API con bancos e instituciones financieras'],
    imageUrl: '/images/products/software_contabilidad.jpg'
  },

  // 10. TELÉFONOS FIJOS (3 tipos)
  {
    id: 'tel-fij-01',
    name: 'Teléfono IP de Sobremesa 4 Líneas con Pantalla Color',
    category: 'telefonos_fijos',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 95,
    description: 'Teléfono fijo VoIP con pantalla LCD a color de 2.8 pulgadas, audio HD de alta fidelidad y manos libres.',
    specs: ['4 Líneas SIP configurables', 'Doble puerto Gigabit Ethernet con alimentación PoE', 'Audio de alta definición HD Sound con altavoz', 'Agenda para 1.000 contactos corporativos'],
    imageUrl: '/images/products/telefono_fijo_ip_ejecutivo.jpg'
  },
  {
    id: 'tel-fij-02',
    name: 'Teléfono Inalámbrico DECT Profesional para Oficina',
    category: 'telefonos_fijos',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 75,
    description: 'Teléfono inalámbrico de largo alcance con base de carga, vibración y clip de cinturón para libertad de movimiento.',
    specs: ['Alcance: 50m en interior / 300m en exterior', 'Pantalla a color de 1.8" resistente a caídas', 'Autonomía: 18 horas de conversación / 200h en espera', 'Conexión para auriculares Jack 3.5mm'],
    imageUrl: '/images/products/telefono_inalambrico_dect.jpg'
  },
  {
    id: 'tel-fij-03',
    name: 'Centralita de Sobremesa con Pantalla Táctil y Videollamada IP',
    category: 'telefonos_fijos',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 220,
    description: 'Consola telefónica para recepción y despacho ejecutivo con pantalla táctil de 7 pulgadas y cámara HD para videoconferencia.',
    specs: ['Pantalla táctil capacitiva 7" (1024x600)', 'Cámara HD de 5MP con obturador de privacidad', 'Bluetooth 4.2 y Wi-Fi doble banda integrado', '16 Teclas inteligentes virtuales con indicador LED'],
    imageUrl: '/images/products/centralita_telefono_conferencia.jpg'
  },

  // 11. TELÉFONOS MÓVILES (3 tipos)
  {
    id: 'tel-mov-01',
    name: 'Smartphone Empresarial 5G 128GB (Resistente)',
    category: 'telefonos_moviles',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 280,
    description: 'Móvil de empresa con conectividad 5G, chasis reforzado, gran autonomía y lector NFC para autenticación.',
    specs: ['Pantalla 6.5" FHD+ 90Hz', 'Procesador Octa-Core 5G / 6GB RAM / 128GB SSD', 'Batería de 5.000 mAh con carga rápida 33W', 'Certificación IP68 de resistencia al agua y polvo'],
    imageUrl: '/images/products/telefono_movil_5g.jpg'
  },
  {
    id: 'tel-mov-02',
    name: 'Smartphone Pro Ejecutivo 5G 256GB Pantalla AMOLED',
    category: 'telefonos_moviles',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 620,
    description: 'Teléfono inteligente de alta gama para directivos con triple cámara de precisión, pantalla AMOLED y diseño refinado.',
    specs: ['Pantalla AMOLED 6.7" QHD+ 120Hz', 'Procesador Snapdragon 8 Gen 2 / 12GB RAM / 256GB', 'Cámara triple de 50 MP con estabilización óptica', 'Carga inalámbrica y seguridad Knox Enterprise'],
    imageUrl: '/images/products/telefono_redmi_blue.jpg'
  },
  {
    id: 'tel-mov-03',
    name: 'Smartphone Ultra Cero-Riesgo 512GB Triple Cátedra',
    category: 'telefonos_moviles',
    categoryLabel: 'Teléfonos Fijos y Móviles',
    price: 980,
    description: 'Teléfono insignia corporativo con encriptación de datos de grado militar, 512GB de memoria y acabado en titanio.',
    specs: ['Pantalla de cristal de zafiro 6.8" AMOLED', 'Procesador de última generación / 16GB RAM / 512GB Storage', 'Cuerpo de Titanio aeroespacial', 'Encriptación de hardware y soporte Dual SIM e-SIM'],
    imageUrl: '/images/products/telefono_razr_ultra.jpg'
  }
];
