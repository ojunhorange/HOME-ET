// Firebase 서비스 계정 env. firebase-admin을 불러오지 않고 켜짐 여부만 알 수 있게 따로 둠 (layout에서 씀)
export const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Vercel·.env에 한 줄로 넣으면 줄바꿈이 "\n" 글자로 들어옴 → 실제 줄바꿈으로
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

export const firebaseEnabled = Boolean(firebaseConfig.projectId && firebaseConfig.clientEmail && firebaseConfig.privateKey);
