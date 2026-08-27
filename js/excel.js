const ExcelUtil = {
  FILE_HEADERS: ["Código", "Producto", "Lote", "Ingresos", "Egresos", "Saldo", "Buenos", "Dañados", "Arreglados", "Reempacados"],
  STATES: ["Buenos", "Dañados", "Arreglados", "Reempacados"],

  parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          resolve(workbook);
        } catch (err) {
          reject(new Error("Error al leer el archivo Excel: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo."));
      reader.readAsArrayBuffer(file);
    });
  },

  analyzeWorkbook(workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet["!ref"]) throw new Error("El archivo Excel está vacío.");

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    let headerRow = -1;
    let detectedHeaders = [];

    for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
      const rowVals = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        rowVals.push(cell ? String(cell.v).trim() : "");
      }
      const matchCount = this.FILE_HEADERS.filter((h, i) => rowVals[i] === h).length;
      if (matchCount >= 7) {
        headerRow = r;
        detectedHeaders = rowVals;
        break;
      }
    }

    if (headerRow === -1) {
      throw new Error("No se encontraron los encabezados esperados en el archivo.");
    }

    const items = [];
    const errors = [];
    const seenKeys = new Set();

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const codigo = this.getCellValue(sheet, r, 0);
      const producto = this.getCellValue(sheet, r, 1);
      const lote = this.getCellValue(sheet, r, 2);

      if (!codigo || !producto || !lote) continue;
      if (codigo.toUpperCase() === "TOTALES" || codigo.toUpperCase().includes("TOTAL")) continue;

      const ingresos = this.getNumericValue(sheet, r, 3);
      const egresos = this.getNumericValue(sheet, r, 4);
      const saldo = this.getNumericValue(sheet, r, 5);
      const buenos = this.getNumericValue(sheet, r, 6);
      const danados = this.getNumericValue(sheet, r, 7);
      const arreglados = this.getNumericValue(sheet, r, 8);
      const reempacados = this.getNumericValue(sheet, r, 9);

      const key = `${codigo}|${producto}|${lote}`;
      if (seenKeys.has(key)) {
        errors.push({ row: r + 1, type: "DUPLICATE", message: `Duplicado: ${key}` });
        continue;
      }
      seenKeys.add(key);

      const stateTotal = buenos + danados + arreglados + reempacados;
      if (stateTotal !== saldo) {
        errors.push({
          row: r + 1, type: "STATE_MISMATCH",
          message: `Suma de estados (${stateTotal}) ≠ Saldo (${saldo})`
        });
      }

      items.push({
        codigo, producto, lote, ingresos, egresos, saldo,
        buenos, danados, arreglados, reempacados
      });
    }

    return {
      sheetName,
      headers: detectedHeaders,
      headerRow,
      items,
      errors,
      totalRows: items.length,
      states: this.STATES.filter(s => items.some(item => item[s.toLowerCase()] > 0))
    };
  },

  getItemKey(item) {
    return `${item.codigo}|${item.producto}|${item.lote}`;
  },

  getCellValue(sheet, row, col) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    return cell ? String(cell.v).trim() : "";
  },

  getNumericValue(sheet, row, col) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return 0;
    const num = Number(cell.v);
    return isNaN(num) ? 0 : num;
  },

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Error al leer archivo."));
      reader.readAsDataURL(file);
    });
  },

  exportToExcel(data, filename, sheetName = "Datos") {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  },

  exportComparisonToExcel(comparison, virtualItems, physicalCounts) {
    const rows = comparison.results.map(r => ({
      "Código": r.codigo,
      "Producto": r.producto,
      "Lote": r.lote,
      "Virtual Buenos": r.virtual.buenos,
      "Virtual Dañados": r.virtual.danados,
      "Virtual Arreglados": r.virtual.arreglados,
      "Virtual Reempacados": r.virtual.reempacados,
      "Virtual Total": r.virtual.total,
      "Físico Buenos": r.physical.buenos,
      "Físico Dañados": r.physical.danados,
      "Físico Arreglados": r.physical.arreglados,
      "Físico Reempacados": r.physical.reempacados,
      "Físico Total": r.physical.total,
      "Diferencia": r.diferencia,
      "Tipo": r.tipo === "SIN_DIFERENCIA" ? "Sin diferencia" :
              r.tipo === "FALTANTE" ? "Faltante" :
              r.tipo === "SOBRANTE" ? "Sobrante" : "Cambio de estado",
      "Cambio Estado": r.cambioEstado ? "Sí" : "No"
    }));

    const summaryRows = [
      {}, { "Código": "RESUMEN" },
      { "Código": "Total registros", "Producto": comparison.summary.total },
      { "Código": "Sin diferencia", "Producto": comparison.summary.sinDiferencia },
      { "Código": "Faltantes", "Producto": comparison.summary.faltantes },
      { "Código": "Sobrantes", "Producto": comparison.summary.sobrantes },
      { "Código": "Cambios de estado", "Producto": comparison.summary.cambioEstado }
    ];

    const allRows = [...rows, ...summaryRows];
    this.exportToExcel(allRows, `Comparacion_${new Date().toISOString().slice(0, 10)}.xlsx`, "Comparación");
  },

  exportReconciliationToExcel(reconciliation, comparison) {
    const rows = comparison.results.map(r => ({
      "Código": r.codigo,
      "Producto": r.producto,
      "Lote": r.lote,
      "Virtual Total": r.virtual.total,
      "Físico Total": r.physical.total,
      "Diferencia": r.diferencia,
      "Tipo": r.tipo,
      "Ajuste Buenos": reconciliation.adjustments[r.key]?.buenos ?? "",
      "Ajuste Dañados": reconciliation.adjustments[r.key]?.danados ?? "",
      "Ajuste Arreglados": reconciliation.adjustments[r.key]?.arreglados ?? "",
      "Ajuste Reempacados": reconciliation.adjustments[r.key]?.reempacados ?? ""
    }));

    this.exportToExcel(rows, `Conciliacion_${new Date().toISOString().slice(0, 10)}.xlsx`, "Conciliación");
  },

  exportPhysicalCountsToExcel(counts) {
    const rows = [];
    counts.forEach(count => {
      if (count.detail && Array.isArray(count.detail)) {
        count.detail.forEach(d => {
          rows.push({
            "Fecha": count.createdAt?.toDate?.().toLocaleDateString('es-CO') || '',
            "Usuario": count.userId,
            "Código": d.codigo,
            "Producto": d.producto,
            "Lote": d.lote,
            "Buenos": d.buenos,
            "Dañados": d.danados,
            "Arreglados": d.arreglados,
            "Reempacados": d.reempacados,
            "Total": (d.buenos || 0) + (d.danados || 0) + (d.arreglados || 0) + (d.reempacados || 0),
            "Estado": count.status,
            "Versión": count.version
          });
        });
      }
    });
    this.exportToExcel(rows, `Conteos_Fisicos_${new Date().toISOString().slice(0, 10)}.xlsx`, "Conteos Físicos");
  },

  exportVirtualToExcel(virtualItems) {
    const rows = virtualItems.map(v => ({
      "Código": v.codigo,
      "Producto": v.producto,
      "Lote": v.lote,
      "Ingresos": v.ingresos,
      "Egresos": v.egresos,
      "Saldo": v.saldo,
      "Buenos": v.buenos,
      "Dañados": v.danados,
      "Arreglados": v.arreglados,
      "Reempacados": v.reempacados
    }));
    this.exportToExcel(rows, `Inventario_Virtual_${new Date().toISOString().slice(0, 10)}.xlsx`, "Virtual");
  }
};
