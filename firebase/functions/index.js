const functions = require("firebase-functions");
const admin = require("firebase-admin");
const XLSX = require("xlsx");

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();
const auth = admin.auth();

const VALID_ROLES = ["ADMIN", "BODEGA"];
const VALID_COUNT_STATUSES = ["BORRADOR", "ENVIADO", "APROBADO", "RECHAZADO", "BLOQUEADO"];
const VALID_CYCLE_STATUSES = ["BORRADOR", "CONTEO_ABIERTO", "RECONTEO", "EN_REVISION", "CONCILIADO", "CERRADO"];
const VALID_ITEM_STATES = ["Buenos", "Dañados", "Arreglados", "Reempacados"];

exports.setUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede asignar roles.");
  }
  const { uid, role } = data;
  if (!uid || !VALID_ROLES.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "uid y role válido requeridos.");
  }
  await auth.setCustomUserClaims(uid, { role });
  await db.collection("users").doc(uid).set({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await logAudit("SET_ROLE", context.auth.uid, { targetUid: uid, role });
  return { success: true };
});

exports.importVirtualInventory = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede importar inventario virtual.");
  }
  const { cycleId, fileBase64, fileName } = data;
  if (!cycleId || !fileBase64 || !fileName) {
    throw new functions.https.HttpsError("invalid-argument", "cycleId, fileBase64 y fileName requeridos.");
  }

  const cycleRef = db.collection("inventoryCycles").doc(cycleId);
  const cycleDoc = await cycleRef.get();
  if (!cycleDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Inventario semanal no encontrado.");
  }
  if (cycleDoc.data().status === "CERRADO") {
    throw new functions.https.HttpsError("failed-precondition", "No se puede importar en un inventario cerrado.");
  }

  const buffer = Buffer.from(fileBase64, "base64");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet["!ref"]) {
    throw new functions.https.HttpsError("invalid-argument", "El archivo Excel está vacío.");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let headerRow = -1;
  const expectedHeaders = ["Código", "Producto", "Lote", "Ingresos", "Egresos", "Saldo", "Buenos", "Dañados", "Arreglados", "Reempacados"];

  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    const rowVals = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      rowVals.push(cell ? String(cell.v).trim() : "");
    }
    const matchCount = expectedHeaders.filter((h, i) => rowVals[i] === h).length;
    if (matchCount >= 7) {
      headerRow = r;
      break;
    }
  }

  if (headerRow === -1) {
    throw new functions.https.HttpsError("invalid-argument", "No se encontraron los encabezados esperados: Código, Producto, Lote, Buenos, Dañados, Arreglados, Reempacados.");
  }

  const items = [];
  const errors = [];
  const seenKeys = new Set();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const codigo = getCellValue(sheet, r, 0);
    const producto = getCellValue(sheet, r, 1);
    const lote = getCellValue(sheet, r, 2);

    if (!codigo || !producto || !lote) continue;
    if (codigo.toUpperCase() === "TOTALES" || codigo.toUpperCase().includes("TOTAL")) continue;

    const ingresos = getNumericValue(sheet, r, 3);
    const egresos = getNumericValue(sheet, r, 4);
    const saldo = getNumericValue(sheet, r, 5);
    const buenos = getNumericValue(sheet, r, 6);
    const danados = getNumericValue(sheet, r, 7);
    const arreglados = getNumericValue(sheet, r, 8);
    const reempacados = getNumericValue(sheet, r, 9);

    const key = `${codigo}|${producto}|${lote}`;
    if (seenKeys.has(key)) {
      errors.push(`Fila ${r + 1}: Duplicado detectado (${key}).`);
      continue;
    }
    seenKeys.add(key);

    if (buenos + danados + arreglados + reempacados !== saldo) {
      errors.push(`Fila ${r + 1}: Suma de estados (${buenos + danados + arreglados + reempacados}) ≠ Saldo (${saldo}).`);
    }

    items.push({
      codigo, producto, lote, ingresos, egresos, saldo,
      buenos, danados, arreglados, reempacados,
      importId: cycleId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  if (items.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "No se encontraron datos válidos en el archivo.");
  }

  const batch = db.batch();
  const existingImport = await db.collection("virtualImports")
    .where("cycleId", "==", cycleId).limit(1).get();
  if (!existingImport.empty) {
    const oldItems = await db.collection("virtualItems")
      .where("importId", "==", cycleId).get();
    oldItems.forEach(doc => batch.delete(doc.ref));
    existingImport.forEach(doc => batch.delete(doc.ref));
  }

  const importRef = db.collection("virtualImports").doc();
  batch.set(importRef, {
    cycleId, fileName, userId: context.auth.uid,
    itemCount: items.length,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  items.forEach(item => {
    const itemRef = db.collection("virtualItems").doc();
    batch.set(itemRef, item);
  });

  batch.update(cycleRef, {
    status: "CONTEO_ABIERTO",
    virtualImportId: importRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  await logAudit("IMPORT_VIRTUAL", context.auth.uid, { cycleId, itemCount: items.length, errorCount: errors.length });

  return {
    success: true,
    importId: importRef.id,
    itemCount: items.length,
    errors: errors.slice(0, 20)
  };
});

exports.runComparison = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede ejecutar comparaciones.");
  }
  const { cycleId } = data;
  if (!cycleId) throw new functions.https.HttpsError("invalid-argument", "cycleId requerido.");

  const virtualItems = await db.collection("virtualItems")
    .where("importId", "==", cycleId).get();
  if (virtualItems.empty) {
    throw new functions.https.HttpsError("failed-precondition", "No hay inventario virtual importado.");
  }

  const physicalCounts = await db.collection("inventoryCycles").doc(cycleId)
    .collection("physicalCounts").where("status", "in", ["APROBADO", "BLOQUEADO"]).get();
  if (physicalCounts.empty) {
    throw new functions.https.HttpsError("failed-precondition", "No hay conteos físicos aprobados.");
  }

  const physicalMap = {};
  physicalCounts.forEach(doc => {
    const count = doc.data();
    if (count.detail && Array.isArray(count.detail)) {
      count.detail.forEach(d => {
        const key = `${d.codigo}|${d.producto}|${d.lote}`;
        if (!physicalMap[key]) {
          physicalMap[key] = { codigo: d.codigo, producto: d.producto, lote: d.lote, buenos: 0, danados: 0, arreglados: 0, reempacados: 0 };
        }
        physicalMap[key].buenos += d.buenos || 0;
        physicalMap[key].danados += d.danados || 0;
        physicalMap[key].arreglados += d.arreglados || 0;
        physicalMap[key].reempacados += d.reempacados || 0;
      });
    }
  });

  const results = [];
  const virtualMap = {};

  virtualItems.forEach(doc => {
    const v = doc.data();
    const key = `${v.codigo}|${v.producto}|${v.lote}`;
    virtualMap[key] = { ...v, itemId: doc.id };
  });

  Object.keys(virtualMap).forEach(key => {
    const v = virtualMap[key];
    const p = physicalMap[key];

    const vTotal = v.buenos + v.danados + v.arreglados + v.reempacados;

    if (!p) {
      results.push({
        key, codigo: v.codigo, producto: v.producto, lote: v.lote,
        tipo: "FALTANTE",
        virtual: { buenos: v.buenos, danados: v.danados, arreglados: v.arreglados, reempacados: v.reempacados, total: vTotal },
        physical: { buenos: 0, danados: 0, arreglados: 0, reempacados: 0, total: 0 },
        diferencia: -vTotal,
        cambioEstado: false
      });
      return;
    }

    const pTotal = p.buenos + p.danados + p.arreglados + p.reempacados;
    const diff = pTotal - vTotal;

    const cambioEstado =
      v.buenos !== p.buenos || v.danados !== p.danados ||
      v.arreglados !== p.arreglados || v.reempacados !== p.reempacados;

    let tipo = "SIN_DIFERENCIA";
    if (diff < 0) tipo = "FALTANTE";
    else if (diff > 0) tipo = "SOBRANTE";
    else if (cambioEstado) tipo = "CAMBIO_ESTADO";

    results.push({
      key, codigo: v.codigo, producto: v.producto, lote: v.lote,
      tipo,
      virtual: { buenos: v.buenos, danados: v.danados, arreglados: v.arreglados, reempacados: v.reempacados, total: vTotal },
      physical: { buenos: p.buenos, danados: p.danados, arreglados: p.arreglados, reempacados: p.reempacados, total: pTotal },
      diferencia: diff,
      cambioEstado
    });
  });

  Object.keys(physicalMap).forEach(key => {
    if (!virtualMap[key]) {
      const p = physicalMap[key];
      const pTotal = p.buenos + p.danados + p.arreglados + p.reempacados;
      results.push({
        key, codigo: p.codigo, producto: p.producto, lote: p.lote,
        tipo: "SOBRANTE",
        virtual: { buenos: 0, danados: 0, arreglados: 0, reempacados: 0, total: 0 },
        physical: { buenos: p.buenos, danados: p.danados, arreglados: p.arreglados, reempacados: p.reempacados, total: pTotal },
        diferencia: pTotal,
        cambioEstado: false
      });
    }
  });

  const summary = {
    total: results.length,
    sinDiferencia: results.filter(r => r.tipo === "SIN_DIFERENCIA").length,
    faltantes: results.filter(r => r.tipo === "FALTANTE").length,
    sobrantes: results.filter(r => r.tipo === "SOBRANTE").length,
    cambioEstado: results.filter(r => r.tipo === "CAMBIO_ESTADO").length
  };

  const compRef = db.collection("comparisons").doc();
  await compRef.set({
    cycleId, userId: context.auth.uid,
    results, summary,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await db.collection("inventoryCycles").doc(cycleId).update({
    status: "EN_REVISION",
    comparisonId: compRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await logAudit("RUN_COMPARISON", context.auth.uid, { cycleId, comparisonId: compRef.id, summary });

  return { comparisonId: compRef.id, summary, results };
});

exports.reconcileInventory = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede conciliar.");
  }
  const { cycleId, comparisonId, acceptedCounts, adjustments, notes } = data;
  if (!cycleId || !comparisonId) {
    throw new functions.https.HttpsError("invalid-argument", "cycleId y comparisonId requeridos.");
  }

  const cycleDoc = await db.collection("inventoryCycles").doc(cycleId).get();
  if (!cycleDoc.exists) throw new functions.https.HttpsError("not-found", "Inventario no encontrado.");
  if (cycleDoc.data().status === "CERRADO") {
    throw new functions.https.HttpsError("failed-precondition", "Inventario ya cerrado.");
  }

  const newVirtualItems = [];
  const comparisonDoc = await db.collection("comparisons").doc(comparisonId).get();
  if (!comparisonDoc.exists) throw new functions.https.HttpsError("not-found", "Comparación no encontrada.");

  const comparisonResults = comparisonDoc.data().results;

  comparisonResults.forEach(result => {
    if (result.tipo === "SIN_DIFERENCIA") {
      newVirtualItems.push({
        codigo: result.codigo, producto: result.producto, lote: result.lote,
        buenos: result.physical.buenos, danados: result.physical.danados,
        arreglados: result.physical.arreglados, reempacados: result.physical.reempacados
      });
    } else {
      const adj = adjustments && adjustments[result.key];
      if (adj) {
        newVirtualItems.push({
          codigo: result.codigo, producto: result.producto, lote: result.lote,
          buenos: adj.buenos ?? result.physical.buenos,
          danados: adj.danados ?? result.physical.danados,
          arreglados: adj.arreglados ?? result.physical.arreglados,
          reempacados: adj.reempacados ?? result.physical.reempacados
        });
      } else {
        newVirtualItems.push({
          codigo: result.codigo, producto: result.producto, lote: result.lote,
          buenos: result.physical.buenos, danados: result.physical.danados,
          arreglados: result.physical.arreglados, reempacados: result.physical.reempacados
        });
      }
    }
  });

  const batch = db.batch();

  const reconRef = db.collection("reconciliations").doc();
  batch.set(reconRef, {
    cycleId, comparisonId, userId: context.auth.uid,
    acceptedCounts: acceptedCounts || [],
    adjustments: adjustments || {},
    notes: notes || "",
    previousStatus: cycleDoc.data().status,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  batch.update(db.collection("inventoryCycles").doc(cycleId), {
    status: "CONCILIADO",
    reconciliationId: reconRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  await logAudit("RECONCILE", context.auth.uid, { cycleId, comparisonId, reconciliationId: reconRef.id });

  return { success: true, reconciliationId: reconRef.id };
});

exports.closeCycle = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede cerrar inventarios.");
  }
  const { cycleId } = data;
  if (!cycleId) throw new functions.https.HttpsError("invalid-argument", "cycleId requerido.");

  const cycleDoc = await db.collection("inventoryCycles").doc(cycleId).get();
  if (!cycleDoc.exists) throw new functions.https.HttpsError("not-found", "Inventario no encontrado.");
  if (cycleDoc.data().status !== "CONCILIADO") {
    throw new functions.https.HttpsError("failed-precondition", "El inventario debe estar CONCILIADO para cerrar.");
  }

  await db.collection("inventoryCycles").doc(cycleId).update({
    status: "CERRADO",
    closedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedBy: context.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await logAudit("CLOSE_CYCLE", context.auth.uid, { cycleId });
  return { success: true };
});

exports.createRecountRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede solicitar reconteos.");
  }
  const { cycleId, productKey, motivo, assignedTo } = data;
  if (!cycleId || !productKey || !motivo || !assignedTo) {
    throw new functions.https.HttpsError("invalid-argument", "Todos los campos son requeridos.");
  }

  const reqRef = db.collection("inventoryCycles").doc(cycleId)
    .collection("recountRequests").doc();
  await reqRef.set({
    productKey, motivo, assignedTo,
    requestedBy: context.auth.uid,
    status: "PENDIENTE",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await logAudit("CREATE_RECOUNT", context.auth.uid, { cycleId, productKey, assignedTo });
  return { success: true, requestId: reqRef.id };
});

exports.registerPhysicalCount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Autenticación requerida.");
  }
  const { cycleId, countId, detail, palletGroups, individualSacos, recountRequestId } = data;
  if (!cycleId || !detail || !Array.isArray(detail) || detail.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "cycleId y detail requeridos.");
  }

  const cycleDoc = await db.collection("inventoryCycles").doc(cycleId).get();
  if (!cycleDoc.exists) throw new functions.https.HttpsError("not-found", "Inventario no encontrado.");
  if (cycleDoc.data().status === "CERRADO" || cycleDoc.data().status === "BORRADOR") {
    throw new functions.https.HttpsError("failed-precondition", "Inventario no acepta conteos.");
  }

  for (const item of detail) {
    if (!item.codigo || !item.producto || !item.lote) {
      throw new functions.https.HttpsError("invalid-argument", "Cada registro debe tener código, producto y lote.");
    }
    const total = (item.buenos || 0) + (item.danados || 0) + (item.arreglados || 0) + (item.reempacados || 0);
    if (total <= 0) {
      throw new functions.https.HttpsError("invalid-argument", `Registro ${item.codigo}/${item.lote}: cantidad total debe ser > 0.`);
    }
  }

  const countsRef = db.collection("inventoryCycles").doc(cycleId)
    .collection("physicalCounts");

  if (countId) {
    const existingDoc = await countsRef.doc(countId).get();
    if (!existingDoc.exists) throw new functions.https.HttpsError("not-found", "Conteo no encontrado.");
    const existing = existingDoc.data();
    if (existing.status === "BLOQUEADO" && context.auth.token.role !== "ADMIN") {
      throw new functions.https.HttpsError("failed-precondition", "Conteo bloqueado.");
    }
    if (existing.userId !== context.auth.uid && context.auth.token.role !== "ADMIN") {
      throw new functions.https.HttpsError("permission-denied", "No puedes editar conteos de otro usuario.");
    }

    const version = (existing.version || 1) + 1;
    await countsRef.doc(countId).update({
      detail, palletGroups: palletGroups || [],
      individualSacos: individualSacos || [],
      version, status: "BORRADOR",
      recountRequestId: recountRequestId || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await logAudit("UPDATE_COUNT", context.auth.uid, { cycleId, countId, version });
    return { success: true, countId, version };
  }

  const newCount = {
    cycleId, userId: context.auth.uid,
    detail, palletGroups: palletGroups || [],
    individualSacos: individualSacos || [],
    version: 1, status: "BORRADOR",
    recountRequestId: recountRequestId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await countsRef.add(newCount);
  await logAudit("CREATE_COUNT", context.auth.uid, { cycleId, countId: docRef.id });
  return { success: true, countId: docRef.id, version: 1 };
});

exports.approvePhysicalCount = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede aprobar conteos.");
  }
  const { cycleId, countId, approved } = data;
  if (!cycleId || !countId || approved === undefined) {
    throw new functions.https.HttpsError("invalid-argument", "Todos los campos requeridos.");
  }

  const status = approved ? "APROBADO" : "RECHAZADO";
  await db.collection("inventoryCycles").doc(cycleId)
    .collection("physicalCounts").doc(countId).update({
      status, approvedBy: context.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  if (approved) {
    const countDoc = await db.collection("inventoryCycles").doc(cycleId)
      .collection("physicalCounts").doc(countId).get();
    if (countDoc.exists && countDoc.data().recountRequestId) {
      await db.collection("inventoryCycles").doc(cycleId)
        .collection("recountRequests").doc(countDoc.data().recountRequestId)
        .update({ status: "COMPLETADO" });
    }
  }

  await logAudit("APPROVE_COUNT", context.auth.uid, { cycleId, countId, approved });
  return { success: true };
});

exports.blockPhysicalCounts = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "ADMIN") {
    throw new functions.https.HttpsError("permission-denied", "Solo ADMIN puede bloquear conteos.");
  }
  const { cycleId } = data;
  if (!cycleId) throw new functions.https.HttpsError("invalid-argument", "cycleId requerido.");

  const snapshot = await db.collection("inventoryCycles").doc(cycleId)
    .collection("physicalCounts").where("status", "==", "APROBADO").get();

  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.update(doc.ref, { status: "BLOQUEADO" });
  });
  await batch.commit();

  await logAudit("BLOCK_COUNTS", context.auth.uid, { cycleId, count: snapshot.size });
  return { success: true, blocked: snapshot.size };
});

function getCellValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell ? String(cell.v).trim() : "";
}

function getNumericValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return 0;
  const num = Number(cell.v);
  return isNaN(num) ? 0 : num;
}

async function logAudit(action, userId, details) {
  await db.collection("auditLogs").add({
    action, userId, details,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}
