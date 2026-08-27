const DB = {
  async getCycles() {
    const snapshot = await db.collection("inventoryCycles")
      .orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getCycle(cycleId) {
    const doc = await db.collection("inventoryCycles").doc(cycleId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async createCycle(data) {
    const ref = await db.collection("inventoryCycles").add({
      ...data,
      status: "BORRADOR",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
  },

  async updateCycle(cycleId, data) {
    await db.collection("inventoryCycles").doc(cycleId).update({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async getVirtualItems(importId) {
    const snapshot = await db.collection("virtualItems")
      .where("importId", "==", importId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getVirtualImports(cycleId) {
    const snapshot = await db.collection("virtualImports")
      .where("cycleId", "==", cycleId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getPhysicalCounts(cycleId, filters = {}) {
    let query = db.collection("inventoryCycles").doc(cycleId)
      .collection("physicalCounts");
    if (filters.userId) query = query.where("userId", "==", filters.userId);
    if (filters.status) query = query.where("status", "==", filters.status);
    query = query.orderBy("createdAt", "desc");
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getPhysicalCount(cycleId, countId) {
    const doc = await db.collection("inventoryCycles").doc(cycleId)
      .collection("physicalCounts").doc(countId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async getRecountRequests(cycleId) {
    const snapshot = await db.collection("inventoryCycles").doc(cycleId)
      .collection("recountRequests").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getComparisons(cycleId) {
    const snapshot = await db.collection("comparisons")
      .where("cycleId", "==", cycleId)
      .orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getComparison(comparisonId) {
    const doc = await db.collection("comparisons").doc(comparisonId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async getReconciliations(cycleId) {
    const snapshot = await db.collection("reconciliations")
      .where("cycleId", "==", cycleId)
      .orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getAuditLogs(filters = {}) {
    let query = db.collection("auditLogs").orderBy("timestamp", "desc").limit(200);
    if (filters.cycleId) query = query.where("cycleId", "==", filters.cycleId);
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getCatalogs() {
    const snapshot = await db.collection("catalogs").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async callFunction(name, data) {
    return functions.httpsCallable(name)(data);
  }
};
