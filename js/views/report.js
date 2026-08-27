/* ============================================================
   REPORTES + EXPORTACIÓN A EXCEL (Admin)
   - Reporte detallado en pantalla.
   - Exportación a Excel con 5 hojas:
     RESUMEN, DETALLE, DIFERENCIAS, CAMBIOS DE ESTADO, HISTORIAL
   ============================================================ */
const ReportView = (() => {
  const app = document.getElementById('app');
  let session = null;
  let currentInv = null;
  let currentData = null;

  function init(s) {
    session = s;
    renderReportSelector();
  }

  function renderReportSelector() {
    const invs = DB.listInventories().slice().reverse();
    app.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:10px">Reportes</h3>
        <p class="hint">Selecciona un inventario para ver el reporte detallado y exportarlo a Excel.</p>
        <div style="margin-top:12px">
          <select id="report-inv" style="padding:10px;border-radius:8px;border:1px solid var(--border);min-width:260px">
            ${invs.map(i=>`<option value="${i.id}">${UI.esc(i.name)} (${i.status})</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="ReportView.selected()" style="margin-left:10px">Ver reporte</button>
        </div>
        <div id="report-body" style="margin-top:18px"></div>
      </div>`;
  }

  async function selected() {
    const sel = document.getElementById('report-inv').value;
    if (!sel) return UI.toast('Selecciona un inventario', 'err');
    await load(sel);
  }

  async function load(invId) {
    currentInv = DB.getInventory(invId);
    if (!currentInv) return UI.toast('No encontrado', 'err');
    UI.loading(true);
    currentData = await AdminView.buildComparison(currentInv);
    UI.loading(false);
    showReport();
  }

  async function showReport(invId) {
    if (invId && (!currentInv || currentInv.id !== invId)) await load(invId);
    const inv = currentInv, data = currentData;
    const rows = data.summary.rows;
    const estados = inv.estados;
    const cols = (s) => {
      const lbl = { buenos:'Bueno', danados:'Dañado', arreglados:'Arreglado', reempacados:'Reempacado' }[s] || s;
      return { v: lbl, f: lbl };
    };

    const head = [`<tr><th>Producto</th><th>Lote</th>`,
      estados.map(s=>`<th class="num">V.${cols(s).v}</th>`).join(''),
      estados.map(s=>`<th class="num">F.${cols(s).v}</th>`).join(''),
      `<th class="num">Total Virtual</th><th class="num">Total Físico</th><th class="num">Diferencia</th><th>Estado</th></tr>`].join('');

    const body = rows.map(r=>`<tr class="${r.hasDiff?'row-diff':''}">
      <td>${UI.esc(r.producto)}</td><td>${UI.esc(r.lote)}</td>
      ${estados.map(s=>`<td class="num">${r.estados[s]?r.estados[s].v:0}</td>`).join('')}
      ${estados.map(s=>`<td class="num">${r.estados[s]?r.estados[s].f:0}</td>`).join('')}
      <td class="num">${r.vTotal}</td><td class="num">${r.fTotal}</td>
      <td class="num" style="color:${r.totalDiff<0?'var(--danger)':r.totalDiff>0?'var(--warn)':'inherit'}">${r.totalDiff>0?'+':''}${r.totalDiff}</td>
      <td>${statePill(r.estado)}</td>
    </tr>`).join('');

    app.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-bottom:4px">Reporte: ${UI.esc(inv.name)}</h3>
        <p class="hint">Estado: ${AdminView.statusPill(inv.status)} · Virtual: ${UI.money(data.summary.totalVirtual)} sacos · Físico: ${UI.money(data.summary.totalFisico)} sacos</p>
        <div class="grid grid-4" style="margin-top:12px">
          <div class="card"><h3>Faltantes</h3><div class="stat-value bad">${data.summary.faltantes} (${data.summary.sacosFaltantes} sacos)</div></div>
          <div class="card"><h3>Sobrantes</h3><div class="stat-value warnc">${data.summary.sobrantes} (${data.summary.sacosSobrantes} sacos)</div></div>
          <div class="card"><h3>Cambios de estado</h3><div class="stat-value warnc">${data.summary.cambiosEstado}</div></div>
          <div class="card"><h3>Coincidencia</h3><div class="stat-value ${data.summary.pctCoincidencia>=90?'ok':'bad'}">${data.summary.pctCoincidencia}%</div></div>
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-success" onclick="ReportView.export()">⬇ Exportar a Excel</button>
          <button class="btn btn-outline" onclick="ReportView.renderReportSelector()">← Otro inventario</button>
        </div>
      </div>
      <div class="table-wrap card"><h3 style="margin-bottom:10px">Reporte detallado (${rows.length} registros)</h3>
        <table><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>`;
    document.getElementById('report-body') && (document.getElementById('report-body').innerHTML = '');
  }

  function statePill(s) {
    const map = { 'CUADRADO':'pill-green','FALTANTE':'pill-red','SOBRANTE':'pill-orange','CAMBIO DE ESTADO':'pill-purple','NO ENCONTRADO':'pill-gray','NO ESPERADO':'pill-yellow','SIN DIFERENCIA':'pill-green' };
    return `<span class="pill ${map[s]||'pill-gray'}">${UI.esc(s)}</span>`;
  }

  // ============ EXPORTACIÓN EXCEL ============
  function export(invId) {
    UI.loading(true);
    const build = currentData && currentInv && (!invId || currentInv.id === invId)
      ? Promise.resolve({ inv: currentInv, data: currentData })
      : (async () => { const inv = DB.getInventory(invId); const data = await AdminView.buildComparison(inv); return { inv, data }; })();
    build.then(({ inv, data }) => {
      try {
        const wb = XLSX.utils.book_new();
        const estados = inv.estados;
        const cols = (s) => ({ buenos:'Buenos', danados:'Dañados', arreglados:'Arreglados', reempacados:'Reempacados' }[s] || s.charAt(0).toUpperCase()+s.slice(1));

        // Hoja 1 — RESUMEN
        const resumen = [
          ['INVENTARIO TSC - RESUMEN'],
          ['Inventario', inv.name],
          ['ID', inv.id],
          ['Estado', inv.status],
          ['Total virtual (sacos)', data.summary.totalVirtual],
          ['Total físico (sacos)', data.summary.totalFisico],
          ['Faltantes (registros)', data.summary.faltantes],
          ['Sacos faltantes', data.summary.sacosFaltantes],
          ['Sobrantes (registros)', data.summary.sobrantes],
          ['Sacos sobrantes', data.summary.sacosSobrantes],
          ['Cambios de estado', data.summary.cambiosEstado],
          ['No encontrados', data.summary.noEncontrados],
          ['No esperados', data.summary.noEsperados],
          ['Lotes cuadrados', data.summary.cuadrados],
          ['Lotes con diferencias', data.summary.conDiferencias],
          ['Total registros', data.summary.totalRegistros],
          ['% Coincidencia', data.summary.pctCoincidencia + '%'],
          ['Completamente cuadrado', data.summary.completamenteCuadrado ? 'SI' : 'NO'],
          ['Generado', new Date().toLocaleString('es-CO')]
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'RESUMEN');

        // Hoja 2 — DETALLE
        const detHead = ['Producto','Lote', ...estados.map(s=>'Virtual '+cols(s)), ...estados.map(s=>'Físico '+cols(s)), 'Total Virtual', 'Total Físico', 'Diferencia', 'Estado'];
        const det = [detHead, ...data.summary.rows.map(r=>[
          r.producto, r.lote,
          ...estados.map(s=> r.estados[s]? r.estados[s].v : 0),
          ...estados.map(s=> r.estados[s]? r.estados[s].f : 0),
          r.vTotal, r.fTotal,
          r.totalDiff, r.estado
        ])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), 'DETALLE');

        // Hoja 3 — DIFERENCIAS
        const difRows = data.summary.rows.filter(r => r.hasDiff || ['FALTANTE','SOBRANTE','NO ENCONTRADO','NO ESPERADO'].includes(r.estado));
        const dif = [[...detHead], ...difRows.map(r=>[
          r.producto, r.lote,
          ...estados.map(s=> r.estados[s]? r.estados[s].v : 0),
          ...estados.map(s=> r.estados[s]? r.estados[s].f : 0),
          r.vTotal, r.fTotal, r.totalDiff, r.estado
        ])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dif), 'DIFERENCIAS');

        // Hoja 4 — CAMBIOS DE ESTADO
        const ceRows = [];
        data.summary.rows.forEach(r => {
          estados.forEach(s => {
            const d = r.estados[s] ? r.estados[s].diff : 0;
            if (d !== 0) ceRows.push([r.producto, r.lote, cols(s), r.estados[s].v, r.estados[s].f, d]);
          });
        });
        const ce = [[...['Producto','Lote','Estado','Virtual','Físico','Diferencia']], ...ceRows];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ce), 'CAMBIOS DE ESTADO');

        // Hoja 5 — HISTORIAL
        const hisRows = inv.historial || [];
        const his = [[...['Tipo','Usuario','Fecha/Hora','Items']],
          ...hisRows.map(h=>[h.type==='reconteo'?'RECONTEO':'CONTEO', h.userName, h.at, h.items]),
          ...Object.keys(inv.fisicos||{}).map(uid=>{
            const f = inv.fisicos[uid];
            return [f.userItem.isReconteo?'RECONTEO':'CONTEO', f.userItem.userName, f.userItem.finishedAt, (f.items||[]).length];
          })];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(his), 'HISTORIAL');

        XLSX.writeFile(wb, 'inventario_' + inv.id + '.xlsx');
        UI.loading(false);
        UI.toast('Exportado a Excel');
      } catch (err) {
        UI.loading(false);
        UI.toast('Error al exportar: ' + err.message, 'err');
      }
    });
  }

  return { init, selected, load, showReport, export };
})();
