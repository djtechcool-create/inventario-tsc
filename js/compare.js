/* ============================================================
   MOTOR DE COMPARACIÓN: INVENTARIO VIRTUAL VS FÍSICO
   Compara por Producto + Lote + Estado.
   Clasifica: CUADRADO, FALTANTE, SOBRANTE, CAMBIO DE ESTADO,
   NO ENCONTRADO, NO ESPERADO.
   Regla 9/10: el total cuadrado NO basta; los estados deben cuadrar.
   ============================================================ */
const Compare = (() => {
  function allStates(virtual) {
    const s = new Set();
    (virtual || []).forEach(l => Object.keys(l.estados || {}).forEach(k => s.add(k)));
    return Array.from(s);
  }

  // comparar un inventario virtual vs un físico
  // virtual: [{producto, lote, estados:{...}, total}]
  // fisico:  {items:[{producto, lote, estados:{...}}]}  (por usuarios)
  function compare(virtual, fisicoItems, statesList) {
    const states = statesList || allStates(virtual);
    const vMap = new Map();
    (virtual || []).forEach(v => vMap.set(v.producto + '|' + v.lote, v));
    const fMap = new Map();
    (fisicoItems || []).forEach(f => fMap.set(f.producto + '|' + f.lote, f));

    const rows = [];
    const keys = new Set([...vMap.keys(), ...fMap.keys()]);

    keys.forEach(key => {
      const v = vMap.get(key);
      const f = fMap.get(key);
      const producto = (v || f).producto;
      const lote = (v || f).lote;

      const vTotal = v ? v.total : 0;
      const fTotal = f ? f.total : 0;

      const st = {};
      let maxDiff = 0, stDiff = false;
      states.forEach(s => {
        const vv = v ? (v.estados[s] || 0) : 0;
        const ff = f ? (f.estados[s] || 0) : 0;
        const d = ff - vv;
        st[s] = { v: vv, f: ff, diff: d };
        if (d !== 0) stDiff = true;
        if (Math.abs(d) > maxDiff) maxDiff = Math.abs(d);
      });

      const totalDiff = fTotal - vTotal;
      let estado = 'SIN DIFERENCIA';
      if (!v) {
        estado = 'NO ESPERADO';
      } else if (!f) {
        estado = 'NO ENCONTRADO';
      } else if (totalDiff === 0 && !stDiff) {
        estado = 'CUADRADO';
      } else if (totalDiff === 0 && stDiff) {
        estado = 'CAMBIO DE ESTADO';
      } else if (totalDiff < 0) {
        estado = 'FALTANTE';
      } else {
        estado = 'SOBRANTE';
      }

      rows.push({
        producto, lote,
        vTotal, fTotal, totalDiff, estado,
        estados: st, hasDiff: estado !== 'SIN DIFERENCIA' && estado !== 'CUADRADO'
      });
    });

    // clasificación global
    const summary = rows.reduce((acc, r) => {
      if (r.estado === 'FALTANTE') { acc.faltantes++; acc.sacosFaltantes += -r.totalDiff; }
      if (r.estado === 'SOBRANTE') { acc.sobrantes++; acc.sacosSobrantes += r.totalDiff; }
      if (r.estado === 'CAMBIO DE ESTADO') { acc.cambiosEstado++; }
      if (r.estado === 'NO ENCONTRADO') { acc.noEncontrados++; }
      if (r.estado === 'NO ESPERADO') { acc.noEsperados++; }
      if (r.estado === 'CUADRADO' || r.estado === 'SIN DIFERENCIA') { acc.cuadrados++; }
      else { acc.conDiferencias++; }
      acc.totalVirtual += r.vTotal;
      acc.totalFisico += r.fTotal;
      return acc;
    }, { faltantes: 0, sacosFaltantes: 0, sobrantes: 0, sacosSobrantes: 0,
         cambiosEstado: 0, noEncontrados: 0, noEsperados: 0, cuadrados: 0,
         conDiferencias: 0, totalVirtual: 0, totalFisico: 0 });

    summary.totalRegistros = rows.length;
    summary.pctCoincidencia = rows.length ? Math.round((summary.cuadrados / rows.length) * 100) : 100;
    summary.completamenteCuadrado = summary.totalVirtual === summary.totalFisico && summary.cambiosEstado === 0;
    summary.rows = rows;
    return summary;
  }

  return { compare, allStates };
})();
