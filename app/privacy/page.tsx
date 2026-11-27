import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침 · Log365" };

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <a href="/">Log365로 돌아가기</a>
      <h1>개인정보처리방침</h1>
      <p>시행일 <time dateTime="2026-11-28">2026년 11월 28일</time></p>

      <h2>다이어리 기록</h2>
      <p>Log365는 같은 계정으로 로그인한 기기에서 다이어리를 이어 쓸 수 있도록 로그인 계정의 식별자와 직접 입력한 일정, 일기, 목표, 할 일 및 설정을 서버에 저장합니다. 기기 알림을 켜면 해당 기기의 푸시 구독 정보와 알림 전송 상태도 저장합니다. 알림을 보내기 위해 기기의 푸시 서비스에 암호화한 알림을 전송합니다.</p>

      <h2>Google Calendar 연결</h2>
      <p>연결은 선택 사항입니다. 연결을 선택하면 Google에서 구독한 캘린더 목록을 확인하고 본인이 소유한 일정에 접근하는 권한을 요청합니다. 목록에서 대상 캘린더 하나를 고르면 Log365가 화면에 필요한 날짜의 일정 제목, 날짜와 시각, 종일 여부를 Google에서 읽습니다. 반복·참석자·주최자 정보는 편집 가능 여부를 판단하는 데 사용합니다.</p>
      <p>Google 일정의 원본은 Google Calendar에 있습니다. Log365에서 추가, 수정 또는 삭제를 요청하면 그 작업을 Google에 전송합니다. 다른 기기에서 로그인해도 같은 캘린더를 열 수 있도록 선택한 캘린더 ID와 암호화한 Google 인증 토큰을 Log365 서버에 계정별로 보관합니다. 조회한 Google 일정은 화면에 표시하는 동안 사용하며 다이어리 데이터베이스에 복사해 저장하지 않습니다.</p>

      <h2>데이터 사용과 연결 해제</h2>
      <p>Log365는 Google에서 받은 데이터를 사용자가 요청한 캘린더 기능에만 사용합니다. 이 데이터를 판매하거나 광고 타기팅에 제공하지 않습니다. 앱과 저장소는 Sites 호스팅 환경에서 실행됩니다. Google API 데이터의 사용 및 전송에는 Google API 서비스 사용자 데이터 정책과 제한적 사용 요건이 적용됩니다. <a href="https://developers.google.com/terms/api-services-user-data-policy">Google 사용자 데이터 정책</a></p>
      <p>Log365의 톱니바퀴 → Google Calendar → 연결 해제를 누르면 서버에서 해당 계정의 Google 연결 정보와 토큰을 삭제합니다. Google 일정과 기존 Log365 기록은 각 서비스에 남습니다. Google에 부여한 권한도 철회하려면 Google 계정의 연결 관리에서 Log365에 해당하는 연결을 삭제할 수 있습니다. <a href="https://myaccount.google.com/connections">Google 계정 연결 관리</a></p>
      <p>개인정보 열람 또는 삭제를 요청하려면 Google 동의 화면에 표시된 Log365 사용자 지원 이메일로 문의해 주세요.</p>
    </main>
  );
}
