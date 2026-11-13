# Constraints — NezFocus Frontend

Chuẩn chất lượng của repo này, chốt ở G0 (05/11/2026) qua skill `agent-skills:constraint-driven-development`. Mỗi luật có lệnh kiểm tra và lý do. AI và người viết code đều đọc file này trước khi code; **không hạ chuẩn ở đây để một thay đổi qua được kiểm tra**. Muốn nới một luật thì chủ dự án quyết, ghi lý do, và sửa file này trong một commit riêng, không chung với code đang đỏ; commit message của commit đó có dòng `Constraints-approved: <lý do>`.

Lần rà gần nhất: 05/11/2026, Phạm Trung Hiếu.

## Chạy lúc nào

Mọi kiểm tra chỉ xét **phần thay đổi**, so với một mốc gốc: trên `main` là những gì chưa commit (chủ dự án commit một lần ở bước A4); trên CI là so với commit trước lần push. Frontend không có nhánh `learn/*` (frontend do AI dựng, chủ dự án chỉ cần hiểu; docs/WORKFLOW.md mục 5), nên không có miễn trừ nào.

| Lúc | Lệnh | Chạy gì | Thời gian đo được |
|---|---|---|---|
| Trong lúc sửa | — | Không có hook chạy sau mỗi lần sửa: ESLint có kiểu và vitest với jsdom đều nặng, lặp lại hàng chục lần thì máy yếu không chịu nổi | — |
| Giữa lát, khi cần | `pnpm check:fast` | lint file đã đổi, sàn, secret | vài giây |
| Cuối mỗi lát của A2 | `pnpm check:task` | `check:fast` + `tsc -b` + test liên quan (`vitest related`, 2 worker) + coverage dòng đổi | 32 giây (sửa `src/lib/api.ts`, kéo theo 11 file test); giới hạn 90 giây |
| Commit | hook `pre-commit`, `commit-msg` | secret trên file staged, lint-staged, sàn trên commit | vài giây |
| Push | hook `pre-push` | `pnpm test` | như base |
| Cuối A2, một lần | `pnpm check:full` | lint + format + sàn + secret + toàn bộ vitest + build (`tsc -b` + vite) + size-limit + `api:types:check` với `openapi.json` của backend + `pnpm audit`; chạy lần lượt từng lệnh | vài phút |
| Cuối A2, một lần, bằng tay | `pnpm test:e2e --project=chromium` | Playwright, chỉ Chromium. Cần backend, Mailpit và dev server đang chạy (docs/e2e-testing.md); không chạy kèm lệnh nặng nào khác | — |
| CI (mỗi lần push ở A4) | `.github/workflows/ci.yml` | mọi thứ trên trừ e2e và `api:types:check`, cộng coverage dòng đổi trên cả suite, Semgrep, gitleaks, Trivy, chạy thử image với CSP | không giới hạn |

**Mốc đụng cả hai repo:** chạy `pnpm check:full` của backend trước (trong đó có `openapi:check`, bảo đảm `openapi.json` khớp code backend), rồi mới tới `pnpm check:full` của frontend. `api:types:check` so kiểu của frontend với `../NezFocus-Backend/openapi.json`, nên chỉ đúng khi file đó mới. Hai lệnh nặng này chạy lần lượt, không cùng lúc.

Lệnh ở cột "Lệnh" là bản tiện dụng; bảng "Luật có số" bên dưới là nguồn chính. Hai chỗ lệch nhau thì file này đúng.

## Sàn (luôn áp dụng)

Kiểm bởi `node scripts/constraints/floor-guard.mjs` (cùng script với backend, chỉ khác cách nhận ra file test). Chạy trong `check:fast`, hook `commit-msg`, `check:full` và job `guard` trên CI.

- Không thêm comment tắt kiểm tra: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `eslint-disable`, `istanbul ignore`, `c8 ignore`, `nosemgrep`, `gitleaks:allow`. Code base hiện không có comment nào loại này.
- Không để việc dở: `throw new Error('Not implemented')`, `catch {}` rỗng, `TODO` trong code.
- Không làm test dễ đi: không thêm `.skip`, `.only`, `.todo`, `xit`, `xdescribe`.
- Không xóa test hay assertion mà không có lý do: xóa file test (`*.test.ts(x)`, `e2e/*.spec.ts`) hay bỏ một `expect` thì commit message phải có dòng `Tests-removed: <vì sao>`. `check:task` liệt kê những chỗ này để AI đưa lý do vào commit message gợi ý; hook `commit-msg` và CI chặn khi thiếu.
- Không có secret trong code: xem dòng "Secret" ở bảng dưới.
- File này không bị nới để một thay đổi qua được: hạ một ngưỡng, xóa một luật hay thêm một dòng ngoại lệ đều bị floor-guard báo. Đổi hay xóa một ngưỡng, hay thêm một dòng ngoại lệ (từ 10/11/2026), chỉ qua được khi commit message có dòng `Constraints-approved: <lý do>`, tức chủ dự án đã duyệt (thêm 06/11/2026); floor-guard vẫn in ra để thay đổi không lặng lẽ.

## Luật có số

| Chiều | Luật | Kiểm bởi | Chạy lúc | Lý do |
|---|---|---|---|---|
| Kiểu | 0 lỗi kiểu | `tsc -b` (trong `check:task` và `pnpm build`) | `check:task`, `check:full`, CI | Lỗi kiểu là lỗi; kiểu API sinh từ OpenAPI biến một thay đổi ở backend thành lỗi biên dịch |
| Lint | 0 lỗi ESLint theo `eslint.config.js` (cảnh báo không chặn) | `node scripts/constraints/lint-changed.mjs`; toàn bộ: `pnpm lint` | `check:fast`, commit (lint-staged), `check:full`, CI | Cấu hình của base đã cấm `any`, promise bị bỏ quên, và có jsx-a11y |
| Format | 0 file lệch Prettier | `pnpm format:check` | commit (lint-staged), `check:full`, CI | Như base |
| Kiến trúc | 0 vi phạm: code dùng chung (`lib`, `components`, `hooks`) không import feature; trang ngoài feature và feature khác chỉ dùng một feature qua `index.ts`; feature không import `@/lib/idempotency`; `components/` và `pages/` của feature không import giá trị từ `*.api.ts` hay `@/lib/api` (chỉ type), trừ các trang đăng nhập của auth (liệt kê từng file) | Luật `no-restricted-imports` và `@typescript-eslint/no-restricted-imports` trong `eslint.config.js`, chạy cùng lint | như Lint | Có sẵn từ base (docs/project-structure.md). Từ 05/11/2026 danh sách feature đọc từ thư mục `src/features`, nên feature mới bị giữ ngay từ file đầu tiên. Từ 10/11/2026 (M1 › R1) feature không import `@/lib/idempotency`: khóa đến từ hook dựng trên `useIdempotentMutation`; một ngoại lệ, E1 ở bảng Ngoại lệ. Từ 10/11/2026 (M1 › R3) component và trang gọi API qua hook trong `api/`, nơi cập nhật cache cho mọi màn (docs/data-fetching.md › Query keys); trang đăng nhập của auth nằm ngoài luật vì store giữ phiên (docs/auth/forms-and-errors.md mục 4), chủ dự án chốt |
| Test liên quan | Mọi test liên quan đến file đã đổi phải xanh | `vitest related` trong `coverage-changed.mjs` | `check:task` | Bắt lỗi trước khi chạy cả suite |
| Coverage dòng đổi | Dòng đổi chạy được trong file logic (`src/lib`, `src/hooks`, `api/`, `hooks/`, `lib/` của feature, `*.store.ts`): ≥ 80% được test chạy qua | `node scripts/constraints/coverage-changed.mjs` (CI: đọc lcov của `pnpm test --coverage.enabled`, không chạy lại) | `check:task`, CI | 80% đủ để bắt phải có test. Chỉ đo chỗ có luật xử lý dữ liệu; component và trang được kiểm bằng thử tay ở A3, test hành vi khi đáng viết, và dòng Accessibility |
| Suite đầy đủ | Toàn bộ vitest xanh | `pnpm test` | push, `check:full`, CI | Như base |
| Accessibility | 0 lỗi axe mức critical / serious theo WCAG 2.1 A / AA. Mỗi trang mới và mỗi phần của AppShell có một test gọi `expectNoA11yViolations` | axe-core qua `src/test/a11y.ts` trong vitest; jsx-a11y trong lint | `check:task` (test liên quan), push, `check:full`, CI | **Bên ngoài** (axe-core mã hóa WCAG). NFR-A11Y-01. jsdom không tính được màu nên luật tương phản tắt; tương phản giữ bằng bảng tương phản trong DESIGN.md và checklist thử tay A3; quét axe trong trình duyệt thật để M7. Việc "trang nào đã có test axe" do review soát, không có máy chặn |
| Hợp đồng API | `src/lib/api-schema.d.ts` khớp `openapi.json` của backend | `pnpm api:types:check ../NezFocus-Backend/openapi.json` | `check:full` | Hai repo tách nhau nên CI không làm được. Đúng khi `openapi.json` mới: xem "Mốc đụng cả hai repo" ở trên |
| Secret | 0 phát hiện | `node scripts/constraints/secrets.mjs` (gitleaks, luôn `--redact`) | `check:fast`, pre-commit (`--staged`), `check:full`, CI | **Bên ngoài.** Thiếu gitleaks thì pre-commit đỏ kèm cách cài: `winget install --id Gitleaks.Gitleaks -e` |
| Bảo mật: code | 0 phát hiện mức high / critical / `ERROR` trên file `src/` đã đổi | Semgrep `p/default` 1.181.0 + `scripts/constraints/quality-gate.mjs` | CI (job `semgrep`) | **Bên ngoài.** Chỉ chạy trên CI vì nặng |
| Bảo mật: dependency | 0 advisory mức high trở lên ở dependency production | `pnpm audit --prod --audit-level high` | `check:full`, CI | **Bên ngoài.** Dưới mức high phần lớn là nhiễu |
| Bảo mật: image | 0 lỗ hổng high / critical đã có bản vá; image chạy được với CSP | Trivy và `scripts/smoke-image.sh` (job `image`) | CI | **Bên ngoài.** Như base |

## Đo, chưa ép

| Chỉ số | Hiện tại | Hướng | Ghi chú |
|---|---|---|---|
| Coverage toàn dự án (dòng, `src/`) | 54.77% | must not fall (dung sai 0.5%) | Đo 05/11/2026 sau lát dọn base của M0 (700/1278 dòng). Số đo nằm trong dòng `text-summary` của bước `pnpm test --coverage.enabled` trên CI. Xuống dưới 54.27% là một phát hiện cần giải thích |
| JS tải trước màn hình đầu (gzip) | 246.41 kB | must not grow (dung sai 0.5%) | Đo 07/11/2026 sau lát L12 của M0: chữ hai ngôn ngữ của trang Hồ sơ (catalogue `users`) nằm trong gói i18n tải đầu; chủ dự án duyệt nâng `limit` lên 246.75 kB ngày 07/11/2026 (cách khác đã cân: tải chữ `users` cùng chunk của trang dùng nó). Trước đó: 245.03 kB, đo 06/11/2026 sau lát L8: chữ hai ngôn ngữ của ba màn đăng ký mới nằm trong gói i18n tải đầu; chủ dự án duyệt nâng ngưỡng ngày 06/11/2026 (cách khác đã cân: chỉ tải ngôn ngữ đang dùng, giảm khoảng 10 kB nhưng phải đổi cách khởi động i18n). Trước đó: 242.78 kB (sau L4, bỏ chunk vendor `ui`), 245.83 kB (05/11/2026, sau lát dọn base), 249.28 kB (trước khi dọn). `pnpm size` sau `pnpm build` (`.size-limit.mjs` đọc `dist/index.html`); `limit` ở đó là 246.75 kB, nên size-limit chặn thật ở `check:full` và CI. Lý do: LiveKit (M4), dnd-kit, biểu đồ phải tải lười theo trang, giữ NFR-PERF-04 |
| CSS tải trước màn hình đầu (gzip) | 8.79 kB | must not grow (dung sai 0.5%) | Đo 13/11/2026 sau lát L3 của M2: chữ của tin giữ nguyên dòng (`whitespace-pre-wrap`, `break-words`) và bộ đếm ký tự của ô soạn (`items-end`), sau khi đổi 15 class mới khác của chat sang class sẵn có (hai giá trị lẻ, `overflow-anchor` và cao tối đa 50 % của ô soạn, để inline). Chủ dự án duyệt nâng `limit` lên 8.80 kB ngày 13/11/2026 (cách khác đã cân: tệp CSS riêng cho chunk chat, inline cả ba). Trước đó: 8.75 kB, đo 11/11/2026 sau lát L9b của M1: giới hạn rộng 160 của cột vai trò trong bước chọn người nhận quyền chủ (S-SET-07), sau khi đổi các class mới khác của lát sang class sẵn có. Chủ dự án duyệt nâng `limit` lên 8.77 kB ngày 11/11/2026 (cách khác đã cân: cột rộng 240 bằng `max-w-60` sẵn có, lệch spec). Trước đó: 8.67 kB, đo 09/11/2026 sau lát L5 của M1: class của rail và danh sách kênh từ API, kéo thả, các hộp thoại kênh / danh mục, Select (C-25) và trang Cài đặt server (L3–L5); gọt class trùng trước (−0.02 kB), phần còn lại là class thật sự cần. Chủ dự án duyệt nâng `limit` lên 8.72 kB ngày 09/11/2026 (cách khác đã cân: chỉ nâng không gọt; ngân sách theo cả mốc). Lúc đó CI đã đỏ từ lần đẩy L4 (8.66 kB) vì `check:task` không chạy size-limit; từ L5 mỗi lát frontend chạy `pnpm build && pnpm size`. Trước đó: 8.13 kB, đo 06/11/2026 sau lát L8: class của ba màn đăng ký, ô nhập theo C-22, CodeInput, Checkbox, Combobox múi giờ và trang điều khoản (Tailwind gom mọi class vào một file tải đầu). Chủ dự án duyệt nâng ngưỡng ngày 06/11/2026. Trước đó: 7.28 kB (sau L4: token màu hai theme, `@font-face`, class của AppShell), 5.92 kB (sau lát dọn base), 6.07 kB (trước khi dọn); `limit` 8.80 kB |

## Không chọn

- **Lighthouse (LCP, CLS):** cần một trang chạy thật có dữ liệu; đo ở M7 trên bản đã deploy (NFR-PERF-04). size-limit ở trên giữ phần gói tải đầu cho tới lúc đó.
- **Ranh giới thêm (cấm import `axios` ngoài `lib/`):** ba file của auth import nó có chủ đích; không đáng một luật kèm ngoại lệ.
- **Mutation testing (Stryker):** quá nặng cho máy hiện tại.

## Ngoại lệ

| ID | Luật | Đường dẫn | Lý do | Người chịu trách nhiệm | Hết hạn |
|---|---|---|---|---|---|
| E1 | Kiến trúc: feature không import `@/lib/idempotency` | `src/features/servers/api/useCreateServer.ts` (`saveNewServerIcon`) | "Thử lại" ảnh của server vừa tạo chạy từ toast, sau khi dialog và hook của nó đã đóng; khóa tạo một lần rồi đi theo closure (chủ dự án chọn 10/11/2026, M1 › R1) | Chủ dự án | 08/02/2027: xem lại; còn đúng thì gia hạn |

Một ngoại lệ mới cần chủ dự án duyệt, có người chịu trách nhiệm và ngày hết hạn (mặc định 90 ngày).
