const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
const db = getFirestore();

async function limpar() {
  const agora = new Date();
  const snapshot = await db.collection('noticias')
    .where('dataExpiracao', '<', agora)
    .get();
  if (snapshot.empty) {
    console.log('✅ Nenhuma notícia expirada.');
    return;
  }
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`🗑️ ${snapshot.size} notícias removidas.`);
}
limpar().then(() => process.exit(0));
