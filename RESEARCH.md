# Log365 캘린더 설계 조사

11년 동안 써 온 다이어리에서 월말에 가장 중요한 동작은 일정을 많이 입력하는 것만큼이나 목표 일곱 개를 한눈에 보고 평가하는 일이다. 월간 달력에서 선택한 날짜의 일과와 그달의 목표를 가까이 둔다. 연간 목표 열두 개는 해가 바뀔 때도 이전 기록과 구분한다.

## 네 앱에서 살펴본 동작

| 앱 | 확인한 동작과 화면 | Log365에 가져올 점 |
| --- | --- | --- |
| Apple 캘린더 | 캘린더마다 이름과 색을 부여한다. 날짜로 이동하거나 보기 단위를 바꾸는 단축키가 있다. | 색으로 일정 묶음을 고르는 동작을 참고한다. 사용자가 고른 봄 웜 팔레트는 이름 없는 색상칩으로 표시한다. [색상 설정](https://support.apple.com/guide/calendar/edit-calendars-icl1030/mac) · [Mac 단축키](https://support.apple.com/guide/calendar/keyboard-shortcuts-ical002/mac) |
| Google 캘린더 | 일정 색에 라벨을 붙일 수 있다. 웹에서는 C로 생성하고 T로 오늘로 가며 Backspace로 선택한 일정을 지운다. | 날짜 선택과 일정 편집의 키 동작을 구분한다. 텍스트를 쓰는 동안에는 Backspace가 글자를 지워야 한다. [색상 라벨](https://support.google.com/calendar/answer/12377581) · [웹 단축키](https://support.google.com/calendar/answer/37034) |
| Notion Calendar | 데스크톱과 웹에서 방향키로 날짜를 이동하고 물음표 키로 단축키 목록을 찾을 수 있다. | 마우스 없이 날짜를 훑고 일정을 추가할 수 있게 한다. 단축키는 화면 안에서 다시 찾아볼 수 있어야 한다. [탐색 안내](https://www.notion.com/help/guides/getting-started-with-notion-calendar) · [단축키](https://www.notion.com/help/notion-calendar-keyboard-shortcuts) |
| TimeBlocks | 월간 칸에서 바로 일정을 입력하고, 일정이 많으면 표시 영역이 확장된다. 색 라벨과 드래그 이동을 지원한다. | 작은 폰 화면에서는 날짜를 탭한 뒤 그날의 일정 전체를 읽을 수 있게 한다. 색은 일정의 분류를 알려주는 데 집중한다. [TimeBlocks 제품 안내](https://timeblocks.com/) · [개발사 App Store 설명](https://apps.apple.com/kr/app/timeblocks-mobile-planner/id821381018) |

## 글자와 숫자

- **Apple** — 이 맥에 설치된 캘린더 14.0의 날짜 이동 대화상자 리소스 `Base.lproj/GoToDay.nib`에서 `.AppleSystemUIFont`와 `.AppleSystemUIFontBold` 참조를 확인했다. Apple은 시스템의 산세리프 계열로 San Francisco를 제공한다. 확인 범위는 해당 대화상자이며 실제 한글 글리프는 운영체제의 언어별 대체 글꼴에 따라 달라진다. [Apple의 시스템 서체 안내](https://developer.apple.com/fonts/)
- **Google** — 공개 한국 공휴일 달력의 임베드 CSS에서 Google Sans Flex, Google Sans Text, Google Sans와 Roboto 대체 글꼴을 확인했다. 컨트롤마다 적용 순서가 다르다. Google은 웹 캘린더를 Material Design 3에 맞췄다고 설명한다. [Google Calendar 웹 디자인 변경 안내](https://workspaceupdates.googleblog.com/2024/10/new-look-and-feel-and-dark-mode-google-calendar.html)
- **Notion Calendar** — 공식 웹앱의 공개 진입 번들에서 본문 기본 크기 16px와 시스템 산세리프를 우선하는 순서를 확인했다. ui-sans-serif, -apple-system, BlinkMacSystemFont가 먼저 나온다. 한국어용 별도 지정은 세리프에 있다. [데스크톱 화면](https://www.notion.com/product/calendar/download)
- **TimeBlocks** — 공식 웹앱 CSS는 Pretendard JP Variable을 먼저 선언하며 Apple SD Gothic Neo와 Noto Sans KR 등도 대체 글꼴로 둔다. 모바일 앱은 스토어에서 폰트를 고를 수 있다. [TimeBlocks 한국어 제품 안내](https://timeblocks.com/)

Log365의 본문에는 기기의 시스템 산세리프를 우선하고, 날짜·시간·점수에는 고정폭 숫자(`tabular-nums`)를 적용하는 구성이 적합하다. 월간 칸에서는 날짜 숫자를 작게 두고 일정 제목이 먼저 읽히게 한다. 화면의 색상 이름을 모두 생략하고, 선택 상태는 색상칩의 윤곽이나 체크 표시로 알린다. 월간·연간 평가에는 ✓·△·×를 사용한다. 사용자가 확인한 배점에서 월간 만점은 14점, 연간 만점은 24점이다. 미평가와 ×는 각각 평가 전과 평가 완료를 뜻한다.

## 실행 파일 및 번들에서 직접 확인한 범위

Apple 캘린더 14.0(`com.apple.iCal`)은 이 맥에서 x86_64와 arm64e 실행 파일을 함께 제공한다. `file`과 `otool -L`로 범용 Mach-O 형식과 AppKit·EventKit·CoreText 연결을 확인했다. `strings`로 위 날짜 이동 리소스의 시스템 글꼴 참조를 확인했다. 연결된 프레임워크는 프로그램이 사용할 수 있는 구성요소를 보여 준다. 각 날짜 셀의 실제 서체는 해당 셀의 표시 리소스나 실행 화면에서 별도로 확인해야 한다.

Notion Calendar 1.144.0의 공식 macOS 배포 디스크를 읽기 전용으로 열었다. Craft Anything으로 본체 실행 파일의 x86_64·arm64 슬라이스와 Electron Framework 연결을 확인했다. 내장 `app.asar`의 항목 5,409개 중 독립된 WOFF·WOFF2·OTF·TTF 파일은 0개였다. 웹 진입 번들 `cron-CI_Xoo_B.js`의 시스템 글꼴 선언과 일치하지만, 이 두 결과만으로 로그인 후 각 화면의 렌더링 글꼴까지 확정할 수는 없다. [Mac 공식 다운로드](https://www.notion.com/product/calendar/download) · [Notion Calendar 웹앱](https://calendar.notion.so/)

Google 캘린더에서는 공개 공휴일 임베드에 연결된 실제 CSS를, TimeBlocks에서는 공식 웹앱의 `index-BwjONxpG.css`를 조사했다. 해당 CSS에서 참조하는 Pretendard JP Variable 첫 번째 서브셋 파일도 읽어 WOFF2(TrueType), 26,376바이트임을 확인했다. 이 결과는 해당 웹 클라이언트의 표시 방식에 적용된다. Google과 TimeBlocks의 iOS·Android 설치 패키지는 이번 작업에서 입수하지 못해 네이티브 실행 파일을 분석하지 않았다. [Google Calendar 공개 공휴일 화면](https://calendar.google.com/calendar/embed?src=en.south_korea%23holiday%40group.v.calendar.google.com&ctz=Asia%2FSeoul) · [TimeBlocks 웹앱](https://app.timeblocks.com/)

## 사용한 도구

- **REA 3.2.1**의 번들 검사에서 Apple Calendar의 관찰 항목 1,012개를 얻었다. 여기에는 날짜 이동 화면의 `GoToDay.nib`와 다국어 문자열 표가 포함된다. [REA 프로젝트](https://github.com/morluto/rea)
- **Craft Anything 0.6.1**의 Mach-O 판독기로 Apple Calendar와 Notion Calendar 본체의 아키텍처·연결 라이브러리를 확인했다. [Craft Anything 프로젝트](https://github.com/storytold/craft-anything)
- **Ghidra 12.2 headless**로 두 앱의 Apple Silicon 슬라이스를 가져왔다. Apple Calendar의 코드 구역은 1,741,040바이트, Objective-C 메서드 이름 구역은 278,816바이트였다. Notion Calendar 본체의 코드 구역은 348바이트였다. Electron과 웹 UI 패키지가 별도로 있으므로 이 크기는 앱 전체의 규모를 뜻하지 않는다. [Ghidra 공식 릴리스](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.2_build)

## 월 보기에서 마우스로 일정 만들기와 이동하기

Apple의 Mac 도움말은 월 보기에서 날짜를 더블클릭해 제목을 입력하고, 기존 일정을 다른 날짜로 끌어 옮길 수 있다고 설명한다. 설치된 Calendar 14.0을 REA 3.2.1로 검사해 빠른 메뉴 리소스에서 선택한 위치에 일정을 만드는 동작 이름 `newEventHere:`를 확인했다. 실행 파일의 문자열에도 날짜 드래그 처리와 드래그의 시작·종료일 설정을 나타내는 `handleMouseDraggedOnDay:forMouseEvent:`와 `_setUIDragStartEndDatesOnEvent`가 있다. 이 이름들만으로 월 보기의 빈 날짜 범위를 끌었을 때의 실행 경로까지 확정할 수는 없다. Log365는 사용자가 요청한 대로 첫날과 마지막 날을 모두 포함하는 기간으로 해석한다. [Apple 캘린더의 이벤트 추가 및 변경](https://support.apple.com/guide/calendar/add-modify-or-delete-events-icalwr13-events/27.0/mac/27)
