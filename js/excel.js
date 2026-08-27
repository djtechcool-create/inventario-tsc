/* ============================================================
   IMPORTADOR INTELIGENTE DE EXCEL
   - Lee el workbook con SheetJS.
   - Localiza la fila de encabezados de forma automática.
   - Mapea columnas por nombre (con variantes).
   - Detecta los estados de forma automática.
   - Consolida por Producto + Lote.
   - Valida el formato y documenta errores.
   ============================================================ */
const ExcelImport = (() => {
  const HEADER_KEYS = ['producto', 'product', 'descripcion', 'desc'];
  const LOT_KEYS = ['lote', 'lot', 'batch', 'codigo'];
  const COLUMN_ALIASES = {
    producto: ['producto', 'product', 'descripcion', 'desc', 'insumo'],
    lote: ['lote', 'lot', 'batch'],
    saldo: ['saldo', 'total', 'saldo total', 'cant', 'cantidad'],
    ingresos: ['ingresos', 'entradas', 'ingreso'],
    egresos: ['egresos', 'salidas', 'egreso'],
    codigo: ['código', 'codigo', 'cod', 'cód'],
    buenos: ['buenos', 'bueno', 'sanos'],
    danados: ['dañados', 'dañado', 'dannados', 'danados', 'deteriorados'],
    arreglados: ['arreglados', 'arreglado', 'reparados', 'reparado'],
    reempacados: ['reempacados', 'reempacado', 'rempacados', 'reempaquetados']
  };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  // Busca la fila índice que contiene los encabezados reales
  function findHeaderRow(rows) {
    for (let i = 0; i < rows.length; i++) {
      const vals = rows[i].map(norm);
      const hasProd = vals.some(v => HEADER_KEYS.some(k => v === k || v.includes(k) && !v.includes('total')));
      const hasLot = vals.some(v => LOT_KEYS.includes(v));
      if (hasProd && hasLot) return i;
    }
    return -1;
  }

  function expandHeader(v) {
    if (v === 'saldo' || v === 'total') return ['saldo', 'total', 'cantidad'];
    return [v];
  }

  function detectColumns(headerRow) {
    const map = {};
    const stateCols = [];
    headerRow.forEach((val, idx) => {
      const n = norm(val);
      const counts = {};
      if (!n) return;
      for (const grp of ['buenos', 'danados', 'arreglados', 'reempacados']) {
        const aliases = COLUMN_ALIASES[grp];
        if (aliases.some(a => n === a || (n.length > 3 && a.includes(n) || n.includes(a)))) {
          if (!(grp in counts)) counts[grp] = 0;
          counts[grp]++;
        }
      }
      // Asignar mejor coincidencia
      if ('buenos' in counts) map[idx] = 'buenos';
      else if ('danados' in counts) map[idx] = 'danados';
      else if ('arreglados' in counts) map[idx] = 'arreglados';
      else if ('reempacados' in counts) map[idx] = 'reempacados';
      else if (COLUMN_ALIASES.producto.some(a => n === a || n.includes(a))) map[idx] = 'producto';
      else if (COLUMN_ALIASES.lote.some(a => n === a)) map[idx] = 'lote';
      else if (COLUMN_ALIASES.saldo.some(a => n === a)) map[idx] = 'saldo';
      else if (COLUMN_ALIASES.ingresos.some(a => n === a)) map[idx] = 'ingresos';
      else if (COLUMN_ALIASES.egresos.some(a => n === a)) map[idx] = 'egresos';
      else if (COLUMN_ALIASES.codigo.some(a => n === a)) map[idx] = 'codigo';
    });
    return map;
  }

  function toNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Lee el archivo y devuelve { eerors, warnings, rows, headerRowIndex, rawHeader }
  function parseExcel(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const rows = raw.filter(r => r && r.some(c => c != null && c !== ''));

    const headerIdx = findHeaderRow(rows);
    const errors = [], warnings = [];
    if (headerIdx < 0) {
      errors.push('No se encontró una fila con los encabezados "Producto" y "Lote". Verifica el archivo.');
      return { success: false, errors, warnings, sheetName };
    }
    const rawHeader = rows[headerIdx];
    const colMap = detectColumns(rawHeader);
    const mapped = Object.values(colMap);
    if (!mapped.includes('producto') || !mapped.includes('lote')) {
      errors.push('No se encontraron las columnas de "Producto" y/o "Lote".');
      return { success: false, errors, warnings, sheetName, headerRow: rawHeader };
    }
    // estados detectados
    const states = [];
    for (const s of ['buenos', 'danados', 'arreglados', 'reempacados'])
      if (Object.values(colMap).includes(s)) states.push(s);

    // Consolidar por producto+lote
    const consolidated = {};
    const lines = [];
    // mapa inverso: nombre de campo -> indice de columna
    const idxOf = {};
    Object.entries(colMap).forEach(([col, field]) => { idxOf[field] = Number(col); });
    const col = (field) => idxOf[field] != null ? idxOf[field] : null;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const pi = col('producto'), li = col('lote');
      const producto = String(pi != null && r[pi] != null ? r[pi] : '').trim();
      const lote = String(li != null && r[li] != null ? r[li] : '').trim();
      // descartar totales
      if (!producto || /^total/i.test(producto) || /^total/i.test(lote)) continue;
      const key = (producto + '||' + lote);
      if (!consolidated[key]) {
        consolidated[key] = { producto, lote, estados: {} };
        for (const s of states) consolidated[key].estados[s] = 0;
        lines.push(consolidated[key]);
      }
      for (const s of states) {
        const si = col(s);
        if (si != null && r[si] != null) consolidated[key].estados[s] += Math.round(toNum(r[si]));
      }
    }
    // totals por producto
    lines.forEach(l => l.total = Object.values(l.estados).reduce((a, b) => a + b, 0));

    if (lines.length === 0) {
      errors.push('No se encontraron productos/lotes para importar.');
      return { success: false, errors, warnings, sheetName, headerRow: rawHeader };
    }
    return { success: true, errors, warnings, sheetName, headerRow: rawHeader,
      headerMap: colMap, states, lines };
  }

  return { parseExcel, COLUMN_ALIASES, norm };
})();
