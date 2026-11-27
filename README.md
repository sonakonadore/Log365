# Log365

월간 달력 옆에 하루 일정과 일과를 펼쳐 두고, 월말과 연말에는 종이 다이어리에서 쓰던 방식으로 목표를 평가하는 개인 웹앱이다.

## 맥에서 쓰고 폰에서 이어쓰기

맥과 폰에서 [Log365](https://log365.sonakonadore.chatgpt.site)를 열고 같은 ChatGPT 계정으로 로그인한다. 맥에서 날짜를 골라 일정을 저장하고 폰에서 같은 날짜를 연다. 화면으로 돌아오거나 아래쪽의 동기화 버튼을 누르면 최신 기록을 가져온다. 열려 있는 화면은 15초마다 갱신된다. 맥을 꺼도 배포된 앱에서 기록을 읽고 쓸 수 있다. 개발용 localhost와 배포된 앱은 별도의 데이터베이스를 사용한다.

아이폰에서 홈 화면 아이콘을 추가하려면 Safari에서 달력을 열고 공유 → 홈 화면에 추가 → 추가를 누른다. 웹 앱으로 열기 옵션이 보이면 켠다.

아이폰(iOS 16.4 이상)에서 홈 화면의 Log365를 열고 같은 계정으로 로그인한 뒤 **오른쪽 위 톱니바퀴 → 알림·배점 → 이 기기 알림 켜기 → 허용**을 누른다. 새 일정의 알림은 ‘없음’이 기본이다. 맥이나 폰에서 일정에 ‘10분 전’ 등을 지정하면 허용한 기기에서 Log365 알림을 받는다. 종일 일정은 오전 9시, 반복 일정은 각 회차의 시작일을 기준으로 한다. 알림 시간대는 알림을 처음 지정한 기기의 시간대다.

오른쪽 위 톱니바퀴(setting)에서 warm white, pale white, warm gray, cold black을 미리 보고 저장할 수 있다. 기본은 pale white다. 로그인하면 같은 계정의 기기에 적용되고, 로그인 전에는 현재 브라우저에 저장된다.

## Google Calendar 연결

Google Calendar 연동을 구성한 환경에서 Log365에 로그인한 뒤 **톱니바퀴 → Google Calendar → Google 계정 연결**을 누른다. Google에서 권한을 승인하고 Log365로 돌아오면 같은 설정에서 소유한 캘린더 하나를 선택한다. 연결과 캘린더 선택은 즉시 적용된다.

연결한 뒤에는 달력 더블클릭이나 Agenda의 +로 Google 일정을 만든다. 기존 방식으로 기록하려면 입력창에서 ‘Log365에 쓰기’를 고른다. Google 일정은 선택한 캘린더의 원본을 직접 읽고 수정한다. 반복 일정과 참석자가 있는 일정은 읽기 전용이다. 시간은 서울 기준이며 종일 일정은 화면에서 마지막 날까지 포함한다. 연결 해제 후에도 Google 원본과 기존 다이어리 기록은 각각 남는다.

Apple 캘린더에서도 보려면 Mac의 **캘린더 → 계정 추가 → Google**에서 같은 계정을 연결하고 캘린더 목록에서 대상 캘린더를 켠다. 이미 연결했다면 해당 캘린더의 체크 표시만 확인한다. [Google의 Apple 캘린더 연결 안내](https://support.google.com/calendar/answer/99358?hl=ko)

### 개발 환경 설정

1. Google Cloud에서 Calendar API를 켠다. 개인 테스트는 Google 인증 플랫폼의 대상을 외부·테스트로 두고 테스트 사용자를 등록한다. 데이터 액세스에서 `calendar.calendarlist.readonly`와 `calendar.events.owned`를 설정한다. [Google 권한 범위](https://developers.google.com/workspace/calendar/api/auth)
2. 웹 애플리케이션 OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 `http://127.0.0.1:48218/api/google-calendar/callback`을 등록한다. 서버는 Google에서 발급한 클라이언트 ID와 비밀번호를 각각 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`으로 읽는다. [Google 웹 서버 인증 안내](https://developers.google.com/identity/protocols/oauth2/web-server)
3. 로컬 서버의 비공개 `.dev.vars`에 위 값, `GOOGLE_REDIRECT_URI`, 임의의 32바이트를 Base64로 인코딩한 `GOOGLE_TOKEN_KEY`, `GOOGLE_CALENDAR_MODE=test`, 승인받은 캘린더 ID인 `GOOGLE_CALENDAR_TEST_ID`를 설정한다. 암호화 키는 연결이 유지되는 동안 보관한다. 배포할 때는 호스팅의 서버 비밀 설정에 넣고 해당 사이트의 HTTPS 복귀 주소를 별도로 등록한다.
4. 로컬 D1에 마이그레이션을 순서대로 적용하고 `npm run dev -- --port 48218 --strictPort --logLevel error`로 실행한다. Google 연결용 마이그레이션은 `drizzle/0002_google_calendar_connection.sql`이다. 테스트 모드에서는 계정과 캘린더별로 이 앱에서 만든 시간 일정 한 건과 종일 일정 한 건만 다룬다. 실사용 전환은 별도로 `GOOGLE_CALENDAR_MODE=live`를 지정해야 한다.
5. 네트워크 없이 계정 분리, 시간대, 같은 일정 수정, 저장 실패, 연결 해제를 검증하려면 `node tests/google-calendar.mjs`를 실행한다. 기기 검증에서는 Google·Apple·Log365에서 같은 일정의 수와 변경 시각을 확인한 뒤 테스트 일정을 삭제한다.

## 기록하기

- 입력창 밖에서 1은 `calendar`, 2는 `goals`, 3은 `to-do`로 이동한다. 목표 편집창에서 ✓·△·×를 고른 뒤 Enter를 누르면 평가가 저장된다.
- 빈 날짜를 맥에서 더블클릭하거나 폰에서 두 번 탭하고 제목을 쓴 뒤 Enter를 누르면 바로 저장된다. 여러 날짜를 끌면 해당 기간의 일정을 만들고, 일정 제목을 끌면 기간을 유지한 채 이동한다. 폰에서는 일정 편집창에서 시작일과 종료일을 지정한다.
- 달력의 한 주는 일요일부터 토요일까지다. 빠른 입력창과 일정 편집창에서 제목, 시작 시간, 색상을 정하고 Enter로 저장한다.
- 일정의 반복 주기는 매일·매주·매월·매년 중 고른다. 무기한으로 두거나 첫 일정을 포함한 총 횟수를 지정한다. 매월 31일이나 매년 2월 29일처럼 날짜가 없는 달·해는 건너뛰며 횟수에 포함하지 않는다. 반복 일정의 편집·이동·삭제는 시리즈 전체에 적용된다.
- `to-do`에서 선택한 날짜의 할 일을 Enter로 추가하고 ✓·△·×로 표시한다. 같은 표시를 다시 누르면 미평가로 돌아간다. 자유 메모는 달력의 같은 날짜 Journal과 연결된다.
- Journal 아래의 ‘이 달의 목표’ 버튼으로 일곱 목표를 펼치고 접는다. 목록 오른쪽 아래의 점수는 획득 점수와 평가한 목표의 만점이다. 기본 배점에서 ✓ 하나와 × 하나를 표시하면 `2/4`가 된다.
- 월간 달력에서 날짜를 고르면 하루 일정과 일과가 보인다. 시간 입력을 비우면 종일 일정이 된다.
- 이름표 없이 12가지 봄빛 색상 견본으로 분류한다. 달력 아래에서 여러 색을 선택해 일정을 거른다. Agenda는 종일 일정과 시간순 일정을 보여준다.
- goals → 월간 목표 모아보기에서 한 해 열두 달의 목표와 점수를 확인하고 각 달에 바로 기록할 수 있다. 상단의 이전·다음 버튼으로 연도를 바꾼다.
- 매월 7칸, 매년 12칸의 목표를 쓴다. ✓는 2점, △는 1점, ×는 0점이며, 비어 있는 평가는 미평가로 집계한다. 기본 만점은 월간 14점, 연간 24점이다. setting에서 배점을 바꾸면 지난 기간도 새 배점으로 계산한다.
- 달력에서 ←·→는 선택한 날짜를 하루씩, ↑·↓는 일주일씩 옮긴다. 달이나 해가 바뀌면 달력도 함께 넘어간다. 선택한 날짜에서 Enter로 일정을 추가한다. Space를 누르면 하루 일정 목록으로 이동한다. Tab으로 선택한 일정에서 Backspace를 누르면 삭제 확인창이 열린다. C로 일정을 추가하고 T로 오늘로 돌아간다. 편집창에서 ⌘/Ctrl + Enter로 저장하고 Esc로 닫는다. 물음표 키로 단축키를 확인한다.

## 로컬 개발

Node.js 24와 npm으로 실행한다.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_free_cobalt_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_event_reminders.sql
npm run dev
```

최초 설정 시 SQL을 한 번 적용한다. 터미널에 표시된 로컬 주소에서 ‘내 계정으로 로그인’을 누르면 개발용 사용자로 화면을 확인할 수 있다. 배포된 Sites는 실제 사용자 인증을 제공한다. GitHub에는 소스와 빈 데이터베이스 스키마가 들어가고, 개인 기록은 배포된 D1에 계정별로 저장된다.

서버는 예약 실행 시각마다 수신을 허용한 기기로 암호화한 Web Push를 보낸다. Worker의 분 단위 타이머가 동작하지 않는 호스팅에서는 GitHub Actions 예약 작업이 5분 간격으로 확인하고, 다음 5분 안에 예정된 알림이 있으면 해당 시각까지 기다린다. GitHub 대기열에 따라 알림이 늦거나 누락될 수 있다. 공개 저장소에서 60일간 활동이 없으면 GitHub가 예약 작업을 중지하므로 Actions에서 다시 켜야 한다.

테스트용으로 빌드된 Worker를 루프백에서 실행할 때는 `npm run start -- --port 48161`을 사용한다. 다른 터미널에서 `node tests/sync.mjs`를 실행하면 독립된 테스트 사용자로 저장·조회, 계정 간 격리, 동시 수정, 삭제, 윤일과 목표 개수 제한을 검사한다.

네 캘린더의 서체·입력 방식과 실제 분석 범위는 [설계 조사](RESEARCH.md)에 정리했다.
