import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

// 웹 설정값은 공개 식별자라 코드에 둬도 됨. 접근 제어는 보안 규칙과 API 키 제한으로 함
const firebaseConfig = {
  apiKey: "AIzaSyAfxgu606Oan7YLmg5UOnpnhkzidQB-LXw",
  authDomain: "homeet-894c0.firebaseapp.com",
  projectId: "homeet-894c0",
  storageBucket: "homeet-894c0.firebasestorage.app",
  messagingSenderId: "470389350708",
  appId: "1:470389350708:web:ce0fb353498227bec50561",
  measurementId: "G-SWBTCEBGJ8",
};

// 개발 서버 핫 리로드 때 중복 초기화 방지
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/** Analytics는 브라우저 전용이라 클라이언트에서만 호출 */
export const initAnalytics = async () => ((await isSupported()) ? getAnalytics(app) : null);
