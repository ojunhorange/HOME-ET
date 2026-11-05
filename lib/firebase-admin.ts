import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { firebaseConfig, firebaseEnabled } from "./firebase-env";

// 서버 전용 (API 라우트에서만 import). Firestore 보안 규칙은 클라이언트 접근을 모두 막고
// (allow read, write: if false), 읽기·쓰기는 이 서비스 계정으로만 한다.
let db: Firestore | null = null;

export function firestore(): Firestore {
  if (!firebaseEnabled) throw new Error("Firebase env not configured");
  if (db) return db;
  const { projectId, clientEmail, privateKey } = firebaseConfig;
  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  db = getFirestore(app);
  return db;
}
