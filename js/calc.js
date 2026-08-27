const Calculator = {
  createEmptyGroup() {
    return { pallets: 0, sacosPerPallet: 0, total: 0 };
  },

  calculateGroupTotal(pallets, sacosPerPallet) {
    return (Number(pallets) || 0) * (Number(sacosPerPallet) || 0);
  },

  calculatePalletDetail(pallets, sacosPerPallet, states) {
    const totalFromPallets = this.calculateGroupTotal(pallets, sacosPerPallet);
    return {
      type: 'pallet',
      pallets: Number(pallets) || 0,
      sacosPerPallet: Number(sacosPerPallet) || 0,
      total: totalFromPallets,
      buenos: totalFromPallets,
      danados: 0,
      arreglados: 0,
      reempacados: 0
    };
  },

  calculateIndividualDetail(individualSacos) {
    const detail = { buenos: 0, danados: 0, arreglados: 0, reempacados: 0 };
    if (!Array.isArray(individualSacos)) return detail;
    individualSacos.forEach(s => {
      const state = (s.state || 'buenos').toLowerCase();
      const qty = Number(s.quantity) || 0;
      if (state === 'buenos') detail.buenos += qty;
      else if (state === 'danados') detail.danados += qty;
      else if (state === 'arreglados') detail.arreglados += qty;
      else if (state === 'reempacados') detail.reempacados += qty;
    });
    return detail;
  },

  calculateTotal(palletGroups, individualSacos) {
    let buenos = 0, danados = 0, arreglados = 0, reempacados = 0;

    if (Array.isArray(palletGroups)) {
      palletGroups.forEach(g => {
        const total = this.calculateGroupTotal(g.pallets, g.sacosPerPallet);
        buenos += total;
      });
    }

    const individual = this.calculateIndividualDetail(individualSacos);
    buenos += individual.buenos;
    danados += individual.danados;
    arreglados += individual.arreglados;
    reempacados += individual.reempacados;

    return {
      buenos, danados, arreglados, reempacados,
      total: buenos + danados + arreglados + reempacados
    };
  },

  getSummary(palletGroups, individualSacos) {
    const total = this.calculateTotal(palletGroups, individualSacos);
    const groupCount = Array.isArray(palletGroups) ? palletGroups.length : 0;
    const individualCount = Array.isArray(individualSacos) ? individualSacos.length : 0;

    let palletTotal = 0;
    if (Array.isArray(palletGroups)) {
      palletGroups.forEach(g => {
        palletTotal += this.calculateGroupTotal(g.pallets, g.sacosPerPallet);
      });
    }

    return {
      ...total,
      groupCount,
      individualCount,
      palletTotal,
      summary: `Pallets: ${palletTotal} buenos | Individuales: ${individualCount} registros`
    };
  },

  validateDetail(detail) {
    const errors = [];
    if (!detail.codigo) errors.push("Código requerido");
    if (!detail.producto) errors.push("Producto requerido");
    if (!detail.lote) errors.push("Lote requerido");
    const total = (detail.buenos || 0) + (detail.danados || 0) + (detail.arreglados || 0) + (detail.reempacados || 0);
    if (total <= 0) errors.push("La cantidad total debe ser mayor a 0");
    return errors;
  },

  buildDetailFromCalc(productInfo, palletGroups, individualSacos) {
    const calc = this.calculateTotal(palletGroups, individualSacos);
    return {
      codigo: productInfo.codigo,
      producto: productInfo.producto,
      lote: productInfo.lote,
      ...calc
    };
  }
};
