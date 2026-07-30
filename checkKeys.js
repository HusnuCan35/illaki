import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const keysSnap = await getDocs(collection(db, 'userKeys'));
  console.log(`Users: ${usersSnap.size}, Keys: ${keysSnap.size}`);
  
  const userIds = usersSnap.docs.map(d => d.id);
  const keyIds = keysSnap.docs.map(d => d.id);
  
  for (const uid of userIds) {
    if (!keyIds.includes(uid)) {
      console.log(`User ${uid} missing key!`);
    }
  }
  process.exit(0);
}
check();
