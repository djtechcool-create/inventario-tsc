const ReportView = {
  async showDashboardSummary(cycleId) {
    try {
      const cycle = await DB.getCycle(cycleId);
      const virtualItems = cycle?.virtualImportId ? await DB.getVirtualItems(cycle.virtualImportId) : [];
      const counts = await DB.getPhysicalCounts(cycleId);
      const comparisons = await DB.getComparisons(cycleId);
      const latest = comparisons[0];

      let virtualTotal = 0;
      let physicalTotal = 0;
      virtualItems.forEach(v => { virtualTotal += v.buenos + v.danados + v.arreglados + v.reempacados; });
      counts.filter(c => ['APROBADO', 'BLOQUEADO'].includes(c.status)).forEach(c => {
        (c.detail || []).forEach(d => { physicalTotal += (d.buenos||0) + (d.danados||0) + (d.arreglados||0) + (d.reempacados||0); });
      });

      return {
        cycle,
        virtualTotal,
        physicalTotal,
        difference: physicalTotal - virtualTotal,
        approvedCounts: counts.filter(c => ['APROBADO', 'BLOQUEADO'].includes(c.status)).length,
        pendingCounts: counts.filter(c => ['BORRADOR', 'ENVIADO'].includes(c.status)).length,
        comparison: latest
      };
    } catch (err) {
      throw new Error('Error al generar resumen: ' + err.message);
    }
  },

  generateCycleReport(cycleId) {
    return this.showDashboardSummary(cycleId);
  },

  generateDiscrepancyReport(comparison) {
    if (!comparison || !comparison.results) return [];
    return comparison.results
      .filter(r => r.tipo !== 'SIN_DIFERENCIA')
      .map(r => ({
        codigo: r.codigo,
        producto: r.producto,
        lote: r.lote,
        virtualTotal: r.virtual.total,
        physicalTotal: r.physical.total,
        diferencia: r.diferencia,
        tipo: r.tipo,
        cambioEstado: r.cambioEstado,
        detalles: r.tipo === 'CAMBIO_ESTADO' ? {
          buenosV: r.virtual.buenos, buenosF: r.physical.buenos,
          danadosV: r.virtual.danados, danadosF: r.physical.danados,
          arregladosV: r.virtual.arreglados, arregladosF: r.physical.arreglados,
          reempacadosV: r.virtual.reempacados, reempacadosF: r.physical.reempacados
        } : null
      }));
  },

  async exportCycleReport(cycleId) {
    try {
      const summary = await this.showDashboardSummary(cycleId);
      const rows = [];

      rows.push({ 'INFORME': 'RESUMEN DEL CICLO' });
      rows.push({ 'INFORME': 'Ciclo', 'Código': summary.cycle?.name });
      rows.push({ 'INFORME': 'Estado', 'Código': summary.cycle?.status });
      rows.push({ 'INFORME': 'Total Virtual', 'Código': summary.virtualTotal });
      rows.push({ 'INFORME': 'Total Físico', 'Código': summary.physicalTotal });
      rows.push({ 'INFORME': 'Diferencia', 'Código': summary.difference });
      rows.push({ 'INFORME': 'Conteos Aprobados', 'Código': summary.approvedCounts });
      rows.push({ 'INFORME': 'Conteos Pendientes', 'Código': summary.pendingCounts });
      rows.push({});

      if (summary.comparison) {
        rows.push({ 'INFORME': 'DESGLOSE POR PRODUCTO' });
        summary.comparison.results.forEach(r => {
          rows.push({
            'INFORME': r.codigo,
            'Código': r.producto,
            'Lote': r.lote,
            'Virtual': r.virtual.total,
            'Físico': r.physical.total,
            'Diferencia': r.diferencia,
            'Tipo': r.tipo
          });
        });
      }

      ExcelUtil.exportToExcel(rows, `Informe_${summary.cycle?.name || cycleId}_${new Date().toISOString().slice(0,10)}.xlsx`, 'Informe');
      UI.toast('Informe exportado', 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  }
};
