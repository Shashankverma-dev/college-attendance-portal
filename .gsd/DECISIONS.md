# DECISIONS.md — Architecture Decision Records

> **Purpose**: Log significant technical decisions and their rationale.

## Template

```markdown
## [DECISION-XXX] Title

**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Deprecated | Superseded

### Context
What is the issue we're facing?

### Decision
What have we decided to do?

### Rationale
Why did we make this decision?

### Consequences
What are the trade-offs?

### Alternatives Considered
What other options were evaluated?
```

---

## Decisions

### [DECISION-001] Hybrid PostgreSQL and Cloud Firestore Storage
**Date**: 2026-10-24
**Status**: Accepted

- **Context**: Real-time rotating QR codes and live scan feedback require low-latency synchronization, while academic transcripts, timetable rules, marks, and audit logs require strict ACID guarantees and foreign-key constraints.
- **Decision**: Authoritative state is stored in PostgreSQL (Cloud SQL); live ephemeral scan tokens and attendance sessions are coordinated through Cloud Firestore.
- **Rationale**: Firestore excels at push-based real-time subscriptions, while PostgreSQL provides robust Row-Level Security, relational joins, and cryptographic hash-chain triggers.

### [DECISION-002] Dual Institutional Identifiers Support
**Date**: 2026-10-24
**Status**: Accepted

- **Context**: The university maintains both Enrollment Numbers (e.g., `SRHU/2026/001`) and Registration Numbers (e.g., `REG2026101`).
- **Decision**: Validate and index both identifiers distinctly, preserving exact casing and leading zeros.
- **Rationale**: Prevents identity collision across academic cycles and enables seamless lookup from registrar and department records.

### [DECISION-003] Linear SHA-256 Hash-Chained Audit Logging
**Date**: 2026-10-24
**Status**: Accepted

- **Context**: Regulatory accreditation requires tamper-evident tracking for changes to student marks and attendance percentages.
- **Decision**: Implement sequential cryptographic hash chaining ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$) at the database level.
- **Rationale**: Any post-hoc manual tampering immediately invalidates downstream chain verification.

---

*Last updated: 2026-10-25*
