// 학교·주변 동 데이터.
// 주변 동 = 학교에서 가까운 법정동 5곳(1년 거래 100건 이상). 월세는 국토부 전월세 실거래가 1년치 중앙값
// (단독/다가구·연립/다세대, 보증금 5,000만·월세 100만 이하, 14~40㎡, 반지하 제외).
// 학교까지 시간은 Google Routes API 대중교통(평일 오전 8시)과 도보 어림 중 빠른 쪽 (scripts/school-commute.mts 캐시).
// data/school-dongs.json 은 scripts/analyze_rent.py 가 만듦. 관리비는 실거래가에 없어서 가정값.
import schoolCommute from "@/data/school-commute.json";
import schoolDongs from "@/data/school-dongs.json";

export type Mode = "도보" | "버스" | "지하철";

export interface Region {
  id: string;
  name: string; // 동 이름
  mode: Mode;
  oneWayMin: number; // 학교까지 편도
  rentMedian: number; // 원룸 월세 중앙값(원)
  mgmtMedian: number; // 관리비 중앙값(원)
  lat: number;
  lng: number;
}

export interface School {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  regions: Region[];
}

/** 실거래가에 관리비가 없어서 모든 동에 같은 가정값 */
const MGMT_EXAMPLE = 60_000;

/** 캐시에 없으면(분석을 다시 돌리고 school-commute.mts 를 안 돌린 경우) 바로 알 수 있게 에러 */
const commuteOf = (school: keyof typeof schoolDongs.schools, dong: string): Pick<Region, "mode" | "oneWayMin"> => {
  const c = (schoolCommute as Record<string, Record<string, { mode: string; oneWayMin: number }>>)[school]?.[dong];
  if (!c) throw new Error(`data/school-commute.json에 ${school} ${dong}이 없어요. scripts/school-commute.mts를 실행하세요.`);
  return { mode: c.mode as Mode, oneWayMin: c.oneWayMin };
};

type DongRow = (typeof schoolDongs.schools)[keyof typeof schoolDongs.schools][number];
const regionsOf = (school: keyof typeof schoolDongs.schools): Region[] =>
  schoolDongs.schools[school].map((d: DongRow) => ({
    id: d.dong,
    name: d.dong,
    ...commuteOf(school, d.dong),
    rentMedian: Math.round(d.rent_median * 10_000),
    mgmtMedian: MGMT_EXAMPLE,
    lat: d.lat,
    lng: d.lng,
  }));

/** 동 목록은 학교에서 가까운 순(json 순서 그대로). 첫 번째 동이 기본 선택이 됨 */
export const SCHOOLS: School[] = [
  { id: "korea", name: "고려대학교", district: "서울 성북구", lat: 37.5894, lng: 127.0322, regions: regionsOf("고려대학교") },
  { id: "yonsei", name: "연세대학교", district: "서울 서대문구", lat: 37.5658, lng: 126.9386, regions: regionsOf("연세대학교") },
  { id: "snu", name: "서울대학교", district: "서울 관악구", lat: 37.4599, lng: 126.9519, regions: regionsOf("서울대학교") },
  { id: "hanyang", name: "한양대학교", district: "서울 성동구", lat: 37.5572, lng: 127.0453, regions: regionsOf("한양대학교") },
  { id: "konkuk", name: "건국대학교", district: "서울 광진구", lat: 37.5408, lng: 127.0793, regions: regionsOf("건국대학교") },
  { id: "kyunghee", name: "경희대학교", district: "서울 동대문구", lat: 37.5964, lng: 127.0525, regions: regionsOf("경희대학교") },
];

export const findSchool = (id: string) => SCHOOLS.find((s) => s.id === id) ?? SCHOOLS[0];
