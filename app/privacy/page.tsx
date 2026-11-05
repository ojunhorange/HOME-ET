import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "개인정보처리방침 · HOME:ET",
  description: "HOME:ET가 어떤 정보를 왜 저장하고, 어떻게 지울 수 있는지 안내합니다.",
};

const CONTACT = "chayunahn@gmail.com";
const EFFECTIVE = "2026년 11월 5일";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-fg-sub">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <Link href="/" className="mb-6 inline-block font-[family-name:var(--font-outfit)] text-xl font-semibold text-primary">
        HOME<span className="text-accent">:</span>ET
      </Link>
      <PageHeader
        title="개인정보처리방침"
        sub="HOME:ET(팀 「로컬에선 됐는데」)가 어떤 정보를 왜 저장하고, 어떻게 지울 수 있는지 안내합니다."
      />
      <Card className="space-y-7">
        <Section title="1. 저장하는 정보">
          <p>
            <b className="text-fg">로그인하지 않으면</b> 입력한 내용은 지금 연 브라우저 탭(sessionStorage)에만 저장되고, 탭이나 브라우저를 닫으면 지워집니다. 서버에는 저장하지 않습니다.
          </p>
          <p>
            <b className="text-fg">Google로 로그인하면</b> 이름, 이메일, 프로필 사진, Google 계정 고유 ID를 받아 로그인 상태를 유지합니다. 이 정보는
            암호화된 로그인 쿠키에만 담기며, 별도의 회원 데이터베이스에는 저장하지 않습니다.
          </p>
          <p>
            <b className="text-fg">리포트를 저장하면</b> 그 리포트의 입력값(학교, 본가 주소, 통학 시간·환승·교통비, 등교일, 대학생활 목표 글,
            가치관 조정값, 월세·비용 가정값, 계약 일정)과 계산 결과 요약이 Google 계정 고유 ID에 묶여 저장됩니다. 계정당 최대 3개입니다.
          </p>
          <p>
            <b className="text-fg">계약 D-day를 Google 캘린더에 등록하면</b> 그 버튼을 누를 때만 Google 캘린더 일정 권한(
            <code className="text-[13px]">calendar.events</code>)을 따로 요청합니다. 허용하면 Google이 주는 접근 토큰을 암호화된 로그인 쿠키에만
            담고, 서버나 데이터베이스에는 따로 저장하지 않습니다. 이 권한으로는 HOME:ET가 만든 계약 단계 일정(단계 이름, 할 일, 날짜)만 기본
            캘린더에 넣고, 다시 등록할 때는 HOME:ET가 붙여 둔 표시로 그 일정만 찾아 고치거나 지웁니다. 다른 일정은 읽지 않습니다.
          </p>
        </Section>

        <Section title="2. 이용 목적">
          <p>
            로그인 유지, 저장한 리포트를 다시 불러오고 고치는 기능, 계약 일정을 내 Google 캘린더에 넣는 기능에만 씁니다. 광고나 마케팅에는 쓰지
            않습니다.
          </p>
          <p>
            Google API에서 받은 정보의 사용과 다른 앱으로의 전송은 제한적 사용(Limited Use) 요건을 포함한{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Google API 서비스 사용자 데이터 정책
            </a>
            을 따릅니다.
          </p>
        </Section>

        <Section title="3. 처리를 맡기는 곳">
          <p>다른 사람이나 회사에 개인정보를 팔거나 제공하지 않습니다. 서비스를 운영하려고 아래 서비스를 씁니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Google Firebase Cloud Firestore: 저장한 리포트 보관 (서울 리전)</li>
            <li>Google Maps Platform: 본가 주소 자동완성과 통학 경로 계산 (입력한 주소를 보냄)</li>
            <li>Google Gemini API: 대학생활 목표 글로 가치관 분석 (입력한 목표 글을 보냄)</li>
            <li>Google 로그인(OAuth): 본인 확인</li>
            <li>Google Calendar API: 계약 D-day 일정 등록 (권한을 허용한 경우에만, 일정 내용을 보냄)</li>
            <li>Vercel: 웹사이트 호스팅</li>
          </ul>
        </Section>

        <Section title="4. 보관 기간과 삭제">
          <p>
            저장한 리포트는 직접 지울 때까지 보관합니다. 시작 화면의 <b className="text-fg">기존 리포트 보기</b>에서 언제든 지울 수 있고, 지우면 바로
            삭제됩니다.
          </p>
          <p>
            캘린더 권한은 로그아웃하면 이 기기의 쿠키에서 함께 사라집니다. 권한 자체를 철회하려면{" "}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
              Google 계정 → 보안 → 서드파티 연결
            </a>
            에서 HOME:ET를 삭제해 주세요. 캘린더에 넣은 일정은 내 캘린더에서 직접 지울 수 있습니다.
          </p>
          <p>
            계정에 저장된 리포트를 한꺼번에 지우고 싶거나 서비스를 운영하지 않게 되면, 아래 연락처로 요청해 주세요. 확인 후 지체 없이 삭제합니다.
          </p>
        </Section>

        <Section title="5. 쿠키">
          <p>로그인 상태(캘린더 권한을 허용했다면 그 토큰 포함)를 유지하는 암호화된 쿠키만 씁니다. 분석·광고용 쿠키는 쓰지 않습니다.</p>
        </Section>

        <Section title="6. 연락처">
          <p>
            개인정보 관련 문의·삭제 요청:{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold text-primary hover:underline">
              {CONTACT}
            </a>
          </p>
        </Section>

        <p className="border-t border-border pt-5 text-sm text-fg-muted">시행일: {EFFECTIVE}</p>
      </Card>
    </main>
  );
}
