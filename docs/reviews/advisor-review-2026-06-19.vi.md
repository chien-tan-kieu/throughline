---
title: Advisor Review — Claude Control
date: 2026-06-19
reviewer: Claude (Opus 4.8) đóng vai advisor
scope: Review repo, tính năng plugin, tính thực tiễn khi dùng làm observer cho workflow superpowers, và mapping với Agile/Scrum
language: vi
---

# Advisor Review — Claude Control

> Ghi chú: Trong session này không có sẵn tool `advisor` (CLAUDE.md nhắc tới nó như một escalation tool nhưng hiện chưa được cài). Bản review này do Claude đóng vai advisor, dựa trên khảo sát mã nguồn nội bộ và research các tool/phương pháp luận tương tự trên GitHub/internet.

## 1. Verdict (tóm tắt điều hành)

1. **Định vị sản phẩm bị gọi sai tên.** Đây **không phải** một công cụ Scrum. Về bản chất nó là một **Kanban + Spec-Driven Development (SDD) companion** có khả năng observe. Vốn từ vựng Scrum (standup, story, sizing) được mượn, nhưng cơ chế bên dưới là *continuous-flow Kanban* phủ lên *vòng đời tuyến tính của một work-item*. Đây là điểm cần làm rõ nhất.
2. **Sự khác biệt cạnh tranh là CÓ THẬT và đáng giá.** Có cả chục tool observability cho Claude Code, nhưng **tất cả đều tự giới hạn ở telemetry/event** và nói rõ "project management out of scope". Claude Control là tool duy nhất nối *observation → lớp PM/phương pháp luận*. Đó là khoảng trống thật.
3. **Use case mạnh nhất không phải "Scrum", mà là "trí nhớ xuyên session" (handoff).** Chính tác giả superpowers thừa nhận phần memory/cross-session của họ "chưa wire xong". `/handoff` + stories bền vững trám đúng lỗ hổng đó. Đây nên là tính năng đinh, không phải standup.
4. **Rủi ro thực tiễn lớn nhất là độ giòn của coupling và đối tượng người dùng quá hẹp.** Phase inference hardcode tên skill của một framework bên thứ ba đang thay đổi nhanh, và toàn bộ lớp PM phụ thuộc vào kỷ luật viết story thủ công của con người.

## 2. Claude Control thực chất là gì

| Lớp | Cơ chế | Đánh giá |
|-----|--------|----------|
| **Observe** | Hooks (`PreToolUse`/`PostToolUse`/`SessionStart`/…) → daemon Bun + SQLite, không bao giờ block | Thiết kế observer-only đúng và an toàn. Nhưng **mỏng**: chỉ lưu event, chưa có timeline viewer/cost/token/multi-session trên dashboard |
| **Infer** | Map hoạt động → phase superpowers `brainstorm → spec → plan → implement` qua tên skill + `InstructionsLoaded` paths + thay đổi file plan/spec | Ý tưởng hay nhưng **heuristic giòn** (xem §5) |
| **Manage (PM)** | Stories (md+frontmatter, `backlog→in-progress→done→archived`, size S/M/L), standup, handoff, closure review, Kanban + phase tracker | Đây là phần khác biệt — nhưng cũng là phần dễ sai về *framing* nhất |

Điểm quan trọng: **"phase" và "status" là hai trục trực giao** — phase = vị trí trong vòng đời SDD của *một* story; status = cột trên board. Tách hai trục này là một quyết định thiết kế **đúng**. Vấn đề nằm ở chỗ gọi cả hệ thống là "Scrum".

## 3. Bối cảnh cạnh tranh (research)

Không gian "observability cho Claude Code qua hooks" đã rất đông:

| Tool | Stack | Phạm vi | Có lớp PM? |
|------|-------|---------|-----------|
| [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Bun + SQLite + WS + Vue | Timeline event, multi-agent swim-lane, pulse chart | ❌ "purely telemetry" |
| [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) | Node + SQLite + WS + React | Cost/token, subagent DAG, Sankey, **Kanban (Working/Waiting/Completed/Error)**, webhooks (Slack/PagerDuty…) | ❌ "PM & story tracking explicitly out of scope" |
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | OpenTelemetry + Grafana | Cost/performance/usage metrics | ❌ |
| eyes-on-claude-code, agents-observe, CAST, claude-session-dashboard | hooks/JSONL → dashboard | Session/agent monitoring | ❌ |
| **Claude Control (bạn)** | Bun + SQLite + WS + React | Observe **+ stories + standup + handoff + phase-of-methodology** | ✅ **duy nhất** |

**Hai insight từ bảng này:**

- **Differentiation thật:** không tool nào khác bước sang lớp PM/methodology. Nếu định vị đúng, đây là "blue ocean" nhỏ.
- **Đừng đua đường telemetry:** các tool kia đã dẫn rất xa về cost/token/DAG/Sankey/notifications — và dashboard của bạn (theo khảo sát) còn *thiếu* cả event timeline lẫn cost. Đua mảng đó là lao vào red ocean và sẽ thua. Hãy để observability ở mức "đủ dùng" và dồn lực vào lớp PM.

## 4. Mapping với Agile/Scrum — phân tích thẳng

| Scrum | Claude Control | Khớp? |
|-------|----------------|-------|
| Product Backlog | stories `status=backlog` | 🟡 có, nhưng không có thứ tự ưu tiên/epic |
| User Story + Acceptance Criteria | story md ("As a… I want… so that…") + AC checklist | 🟢 khớp tốt |
| Estimation | size S/M/L (T-shirt) | 🟡 có sizing nhưng **không có velocity** → ước lượng không có vòng phản hồi, chỉ là trang trí |
| Definition of Done | acceptance criteria | 🟡 nhưng checkbox **không đáng tin** (chính `done.md` thừa nhận điều này) |
| Sprint (time-box) | — | 🔴 **không tồn tại** |
| Sprint Backlog / Planning | — (gần nhất: `/start backlog`→brainstorming, nhưng là per-story) | 🔴 |
| Daily Standup | `/standup` digest | 🟡 có format, nhưng là **nhật ký tiến độ solo**, không phải nghi thức đồng bộ team |
| Sprint Review | `/start done`→closure review, `/handoff` | 🟡 per-story, không per-sprint |
| Retrospective | — (closure review là product-focused, không process-focused) | 🔴 |
| Burndown / Velocity | — | 🔴 |
| Roles (PO/SM/Dev) | con người = PO+SM, AI = Dev | 🔴 không mô hình hóa |

**Kết luận mapping:** hệ thống **mạnh trên trục work-item** (story, AC, sizing, board) nhưng **vắng hoàn toàn trục iteration/cadence/team** (sprint, velocity, ceremony, role). Đó chính xác là định nghĩa **Kanban, không phải Scrum**.

Và điều này **không phải lỗi — đó là sự thật đáng đón nhận:** một lập trình viên đơn lẻ + AI vốn dĩ hợp với *continuous-flow Kanban* hơn là *time-boxed team Scrum*. Phần lớn nghi thức Scrum tồn tại để điều phối *con người với con người* — thứ không có ở đây. Martin Fowler chỉ ra đúng mâu thuẫn gốc: [SDD vốn tuyến tính và front-load đặc tả, ngược pha với Agile "working software over comprehensive documentation"](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). Superpowers cũng là họ SDD ([brainstorm→plan→execute, "primarily linear"](https://blog.fsck.com/2025/10/09/superpowers/)) — cùng nhà với [Kiro, spec-kit, BMAD](https://github.com/github/spec-kit).

→ **Khuyến nghị framing:** bỏ nhãn "Scrum". Định vị là **"Kanban board + SDD lifecycle tracker cho luồng dev người-một-mình-với-AI"**. Giữ standup/handoff như *tiện ích context*, đừng bán chúng như *ceremony*.

## 5. Tính thực tiễn của use case "observer cho superpowers"

**Điểm yếu về độ chính xác (rủi ro vận hành thật):**

- **Hardcode tên skill** (`superpowers:brainstorming`→brainstorm…). Superpowers đang [thay đổi nhanh, tác giả còn nói sẽ redesign cơ chế plugin/skill](https://blog.fsck.com/2025/10/09/superpowers/). Một lần đổi tên skill ở upstream → observer **âm thầm** infer sai mà không báo lỗi.
- **Thiếu nhánh detect `spec`** trong inference theo `InstructionsLoaded` (không match `writing-specs`).
- **Phase đơn điệu, không hạ cấp** → kẹt ở phase cao mãi mãi (brainstorm→plan rồi xóa plan vẫn "plan").
- **Cửa sổ chỉ 20 event gần nhất** → session dài dễ mất tín hiệu.
- **Checkbox AC không đáng tin** — đã được chính code thừa nhận; đồng nghĩa "Definition of Done" hiện dựa vào git log chứ không vào AC.

Những thứ này khiến lời hứa cốt lõi của observer ("phản ánh đúng bạn đang ở đâu") chỉ đáng tin bằng mấy heuristic giòn này.

**Đối tượng người dùng — giao của ba tập hẹp:** cần đồng thời (Claude Code) ∩ (cài superpowers) ∩ (có kỷ luật viết story/spec/plan dạng markdown trong `docs/superpowers/`). Đa số người dùng Claude Code không dùng superpowers; nhiều người dùng superpowers không viết story hình thức. Đây là ràng buộc tăng trưởng lớn nhất.

**Use case "đinh" (mạnh nhất, nên dồn lực):** **trí nhớ/handoff xuyên session.** Session Claude Code là phù du; story + handoff sống sót qua ranh giới session. Tác giả superpowers tự nhận đây là [phần họ "chưa kịp wire lại"](https://blog.fsck.com/2025/10/09/superpowers/). Claude Control trám đúng lỗ hổng đó — đáng giá hơn nhiều so với standup.

## 6. Rủi ro chính

1. **Coupling giòn với một upstream động** — phụ thuộc tên skill + quy ước thư mục `docs/superpowers/{specs,plans,stories}` của superpowers.
2. **Lớp PM phụ thuộc kỷ luật thủ công** — observer không tự tạo story; giá trị PM chỉ hiện ra nếu con người chăm tạo/link story. Mâu thuẫn với tinh thần "để AI giảm việc thủ công".
3. **"Scrum cho một người" là khiên cưỡng** — standup/velocity/ceremony thiếu team để có ý nghĩa; dễ bị đánh giá là vỏ Scrum.
4. **Observability mỏng** so với mặt bằng — thiếu timeline/cost/multi-session, nếu bị so sánh trực diện sẽ yếu.
5. **Inconsistency nhỏ nhưng lộ:** CLI dùng size `S|M|L`, dashboard cycle `XS→S→M→L→XL`. Lệch contract.

## 7. Khuyến nghị (ưu tiên cao → thấp)

1. **Reframe sản phẩm: "Kanban + SDD companion", bỏ nhãn Scrum.** Sửa README/`plugin.json` description cho khớp thực tế. Đây là thay đổi rẻ nhất, tác động nhận thức lớn nhất.
2. **Dồn lực vào handoff/cross-session memory** — auto-generate handoff khi `SessionEnd`/`PreCompact`; auto-load handoff gần nhất khi `/start`. Đây là moat.
3. **Tháo coupling cứng với superpowers:** đưa skill→phase map và đường dẫn thư mục ra **config**; coi superpowers là *một adapter*. Hedge trước churn của upstream + mở rộng sang spec-kit/Kiro.
4. **Làm cứng phase inference:** bổ sung nhánh `writing-specs`→spec; cho phép **manual override** + hiển thị "confidence"; xử lý staleness/downgrade thay vì monotonic tuyệt đối.
5. **Đóng lỗ hổng kỷ luật thủ công:** khi quan sát thấy phiên brainstorm mà *không có active story* → gợi ý "tạo story?". Biến observer thành nudge nhẹ.
6. **Sửa nguồn "Done":** hoặc làm workflow tự tick checkbox, hoặc bỏ hẳn dựa vào checkbox và derive Done từ tín hiệu tường minh (commit/PR/handoff). Đồng bộ luôn size S/M/L giữa CLI và UI.
7. **Đừng đua telemetry.** Giữ observability "đủ dùng"; nếu thêm, chỉ thêm thứ phục vụ lớp PM (vd: thời lượng thực ở mỗi phase để feed lại estimation → tạo *velocity thật*, biến sizing từ trang trí thành dữ liệu).

---

**Một câu chốt:** Claude Control giải đúng một bài toán thật mà cả hệ sinh thái observability bỏ trống — nhưng đang tự mặc một chiếc áo (Scrum) hơi rộng và buộc dây vào một cái cọc (superpowers) hơi lung lay. Sửa hai điều đó, và đẩy mạnh handoff, thì nó từ "demo thú vị" thành "công cụ tôi dùng mỗi ngày".

## Nguồn tham khảo

- [obra/superpowers](https://github.com/obra/superpowers/)
- [Jesse Vincent — "Superpowers: How I'm using coding agents" (blog.fsck.com)](https://blog.fsck.com/2025/10/09/superpowers/)
- [Martin Fowler — Spec-Driven Development: Kiro, spec-kit, Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- [GitHub spec-kit](https://github.com/github/spec-kit)
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)
- [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel)
