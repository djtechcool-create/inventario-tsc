const Auth = {
  currentUser: null,
  userRole: null,

  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const tokenResult = await cred.user.getIdTokenResult();
    this.currentUser = cred.user;
    this.userRole = tokenResult.claims.role || null;
    return { user: cred.user, role: this.userRole };
  },

  async logout() {
    await auth.signOut();
    this.currentUser = null;
    this.userRole = null;
  },

  async refreshRole() {
    if (!this.currentUser) return null;
    await this.currentUser.getIdToken(true);
    const tokenResult = await this.currentUser.getIdTokenResult();
    this.userRole = tokenResult.claims.role || null;
    return this.userRole;
  },

  async getUserProfile() {
    if (!this.currentUser) return null;
    const doc = await db.collection("users").doc(this.currentUser.uid).get();
    return doc.exists ? doc.data() : null;
  },

  async updateUserProfile(uid, data) {
    await db.collection("users").doc(uid).set(data, { merge: true });
  },

  async getAllUsers() {
    const snapshot = await db.collection("users").get();
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  },

  onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }
};
