// One-time script to backfill packsSelectedOrder on old chaos draft documents.
// Run with: node scripts/fix-packs-selected-order.mjs
//
// Fill in YOUR_PASSWORD below before running, then delete the file when done.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, updateDoc, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAZBYtnfnIB3G6w7yIXdRXJbmJOZzvBIi0',
  authDomain: 'mtg-chaos-draft.firebaseapp.com',
  projectId: 'mtg-chaos-draft',
  storageBucket: 'mtg-chaos-draft.firebasestorage.app',
  messagingSenderId: '997373326209',
  appId: '1:997373326209:web:0b9635e710c08e02d4ee80',
};

const EMAIL = 'spencer.carrillo98@gmail.com';
const PASSWORD = 'William$1998!';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
console.log('Signed in.');

const snap = await getDocs(query(collection(db, 'drafts'), where('type', '==', 'chaos')));

let updated = 0;
for (const docSnap of snap.docs) {
  const data = docSnap.data();
  if (data.packsSelectedOrder) {
    console.log(`Skipping ${docSnap.id} — already has packsSelectedOrder`);
    continue;
  }
  if (!Array.isArray(data.players)) {
    console.log(`Skipping ${docSnap.id} — no players array`);
    continue;
  }

  const packsSelectedOrder = [];
  for (const player of data.players) {
    if (Array.isArray(player.packs)) {
      packsSelectedOrder.push(...player.packs);
    }
  }

  if (packsSelectedOrder.length === 0) {
    console.log(`Skipping ${docSnap.id} — no packs found in players`);
    continue;
  }

  await updateDoc(docSnap.ref, { packsSelectedOrder });
  console.log(`Updated ${docSnap.id} with ${packsSelectedOrder.length} packs`);
  updated++;
}

console.log(`Done. Updated ${updated} document(s).`);
process.exit(0);
