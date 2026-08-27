/* ============================================================
   CALCULADORA DE CONTEO POR PALLETS Y SACOS
   Calcula automáticamente sin que el usuario haga matemáticas.
   Reglas:
   - Todo PALLET COMPLETO = sacos BUENOS automáticamente.
   - Pallets incompletos = se descomponen en sacos individuales.
   - Múltiples grupos de pallets (distintos tamaños).
   - Sacos individuales por estado.
   - Retorna estados {buenos, danados, arreglados, reempacados, ...} y total.
   ============================================================ */
const Calc = (() => {

  function defaultState() {
    return { buenos: 0, danados: 0, arreglados: 0, reempacados: 0 };
  }

  // Calcula a partir del modelo de un conteo
  // modelo = { palletGroups:[{qty, per}], indiv: {estado:n} }
  // estadosExtra = lista de estados (estándar y/o dinámicos)
  function compute(modelo, estadosExtra = []) {
    modelo = modelo || { palletGroups: [], indiv: {} };
    const res = {};
    ['buenos','danados','arreglados','reempacados'].forEach(s => res[s] = 0);
    (estadosExtra || []).forEach(s => { if (!(s in res)) res[s] = 0; });

    let totalSacosFromPallets = 0, totalPallets = 0;
    (modelo.palletGroups || []).forEach(g => {
      const q = Math.max(0, parseInt(g.qty) || 0);
      const p = Math.max(0, parseInt(g.per) || 0);
      totalPallets += q;
      totalSacosFromPallets += q * p;
    });
    // Pallets completos => BUENOS
    res.buenos += totalSacosFromPallets;

    // Sacos individuales por cada estado (estándar y extra), sumando
    const indiv = modelo.indiv || {};
    Object.keys(res).forEach(s => {
      res[s] += Math.max(0, parseInt(indiv[s]) || 0);
    });

    let total = Object.values(res).reduce((a, b) => a + b, 0);
    const totalSacosIndiv = (modelo.palletGroups || []).length
      ? total - totalSacosFromPallets
      : total;

    return {
      estados: res,
      total,
      totalPallets,
      totalSacosFromPallets,
      totalSacosIndiv
    };
  }

  // Resumen textual para mostrar en bodega
  function resumen(modelo, estadosExtra) {
    const c = compute(modelo, estadosExtra);
    const lineas = [];
    (modelo.palletGroups || []).forEach((g, i) => {
      lineas.push(`${g.qty} pallets x ${g.per} sacos = ${(g.qty||0)*(g.per||0)} BUENOS`);
    });
    return { ...c, lineas };
  }

  function emptyModelo() {
    return { palletGroups: [], indiv: {} };
  }

  return { compute, resumen, emptyModelo, defaultState };
})();
