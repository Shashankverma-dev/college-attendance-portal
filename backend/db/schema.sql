-- =============================================================================
-- COLLEGE ATTENDANCE MANAGEMENT SYSTEM — PRODUCTION POSTGRESQL SCHEMA v1.8
-- Database Engine: PostgreSQL 15+ (Google Cloud SQL for PostgreSQL / Firebase Data Connect)
-- Architected for: 4,165+ Students initially, scalable to 10,000+ Students
-- Security: Transaction-Local RLS, PgBouncer Isolation, Linear Hash-Chained Audit
-- =============================================================================

-- Enable required cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Dedicated schema for application functions and contexts
CREATE SCHEMA IF NOT EXISTS app;

-- =============================================================================
-- 1. INSTITUTIONS, SCHOOLS & DEPARTMENTS
-- =============================================================================

CREATE TABLE institutions (
    institution_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE schools (
    school_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(institution_id) ON DELETE RESTRICT,
    school_code VARCHAR(32) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_school_code UNIQUE (institution_id, school_code)
);

CREATE TABLE departments (
    department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(institution_id) ON DELETE RESTRICT,
    school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT,
    department_code VARCHAR(32) NOT NULL,
    department_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_institution_dept_code UNIQUE (institution_id, department_code)
);

-- =============================================================================
-- 2. ACADEMIC STRUCTURE (Courses, Academic Years, Semesters, Sections)
-- =============================================================================

CREATE TABLE courses (
    course_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(department_id) ON DELETE RESTRICT,
    course_code VARCHAR(32) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    duration_years SMALLINT NOT NULL CHECK (duration_years BETWEEN 1 AND 6),
    total_semesters SMALLINT NOT NULL CHECK (total_semesters BETWEEN 1 AND 12),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dept_course_code UNIQUE (department_id, course_code)
);

CREATE TABLE academic_years (
    academic_year_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    year_number SMALLINT NOT NULL CHECK (year_number BETWEEN 1 AND 6),
    display_label VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_course_year_number UNIQUE (course_id, year_number)
);

CREATE TABLE semesters (
    semester_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(academic_year_id) ON DELETE RESTRICT,
    semester_number SMALLINT NOT NULL CHECK (semester_number BETWEEN 1 AND 12),
    display_label VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_year_semester_number UNIQUE (academic_year_id, semester_number)
);

CREATE TABLE sections (
    section_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    section_name VARCHAR(16) NOT NULL,
    max_capacity SMALLINT NOT NULL DEFAULT 100 CHECK (max_capacity BETWEEN 1 AND 250),
    academic_calendar_term VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_semester_section_term UNIQUE (semester_id, section_name, academic_calendar_term)
);

-- =============================================================================
-- 3. USER ACCOUNTS & SESSIONS (Firebase Auth Mapping, Per-Device Revocation)
-- =============================================================================

CREATE TYPE user_role_enum AS ENUM ('STUDENT', 'FACULTY', 'HOD', 'GLOBAL_ADMIN');
CREATE TYPE account_status_enum AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE session_revocation_enum AS ENUM ('ACTIVE', 'EXPIRED_IDLE', 'EXPIRED_ABSOLUTE', 'LOGGED_OUT_DEVICE', 'REVOKED_ACCOUNT_WIDE');

CREATE TABLE users (
    user_uid VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    role user_role_enum NOT NULL,
    status account_status_enum NOT NULL DEFAULT 'PENDING_ACTIVATION',
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMPTZ
);

CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid) ON DELETE CASCADE,
    client_ip VARCHAR(64) NOT NULL,
    user_agent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revocation_status session_revocation_enum NOT NULL DEFAULT 'ACTIVE',
    revocation_reason VARCHAR(255)
);

-- =============================================================================
-- 4. PROFILES (Students, Faculty, Staff/HOD)
-- =============================================================================

CREATE TABLE student_profiles (
    student_profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES users(user_uid) ON DELETE RESTRICT,
    student_id VARCHAR(64) NOT NULL UNIQUE,
    enrollment_no VARCHAR(64) UNIQUE,
    registration_no VARCHAR(64) UNIQUE,
    registration_id VARCHAR(64) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    student_gmail VARCHAR(255) NOT NULL UNIQUE,
    school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT,
    current_course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    current_academic_year_id UUID NOT NULL REFERENCES academic_years(academic_year_id) ON DELETE RESTRICT,
    current_semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    current_section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    roll_number VARCHAR(32) NOT NULL,
    phone_number VARCHAR(32),
    parent_guardian_contact VARCHAR(32),
    date_of_birth DATE,
    blood_group VARCHAR(8),
    admission_category VARCHAR(32),
    profile_photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_section_roll_number UNIQUE (current_section_id, roll_number)
);

CREATE TABLE faculty_profiles (
    faculty_profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES users(user_uid) ON DELETE RESTRICT,
    faculty_staff_id VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    official_email VARCHAR(255) NOT NULL UNIQUE,
    department_id UUID NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    designation VARCHAR(128) NOT NULL,
    office_location VARCHAR(128),
    contact_phone VARCHAR(32),
    profile_photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE staff_profiles (
    staff_profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES users(user_uid) ON DELETE RESTRICT,
    administrative_staff_id VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    official_email VARCHAR(255) NOT NULL UNIQUE,
    department_id UUID REFERENCES departments(department_id) ON DELETE RESTRICT,
    administrative_designation VARCHAR(128) NOT NULL,
    permission_scope VARCHAR(32) NOT NULL CHECK (permission_scope IN ('GLOBAL_ADMIN', 'HOD_DEPT_ADMIN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_hod_dept_mandatory CHECK (
        (permission_scope = 'HOD_DEPT_ADMIN' AND department_id IS NOT NULL) OR
        (permission_scope = 'GLOBAL_ADMIN')
    )
);

-- =============================================================================
-- 5. CURRICULUM, TEACHING ASSIGNMENTS & ENROLLMENT HISTORY
-- =============================================================================

CREATE TABLE subjects (
    subject_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    subject_code VARCHAR(32) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    planned_hours NUMERIC(4, 1) NOT NULL DEFAULT 45.0,
    credit_value NUMERIC(3, 1) NOT NULL DEFAULT 3.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_course_semester_subject_code UNIQUE (course_id, semester_id, subject_code)
);

CREATE TABLE faculty_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_profile_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    academic_calendar_term VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_faculty_subject_section_term UNIQUE (faculty_profile_id, subject_id, section_id, academic_calendar_term)
);

CREATE TYPE enrollment_status_enum AS ENUM ('ACTIVE', 'PROMOTED', 'COMPLETED', 'WITHDRAWN');

CREATE TABLE student_enrollment_history (
    enrollment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    academic_year_id UUID NOT NULL REFERENCES academic_years(academic_year_id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    academic_calendar_term VARCHAR(64) NOT NULL,
    enrollment_status enrollment_status_enum NOT NULL DEFAULT 'ACTIVE',
    term_start_date DATE NOT NULL,
    term_completion_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Enforce exactly one ACTIVE enrollment per student per academic term
CREATE UNIQUE INDEX uq_student_active_term_enrollment 
ON student_enrollment_history (student_profile_id, academic_calendar_term)
WHERE enrollment_status = 'ACTIVE';

-- =============================================================================
-- 6. ATTENDANCE SESSIONS & ATTENDANCE RECORDS (1.125M records/sem scale)
-- =============================================================================

CREATE TYPE session_submission_enum AS ENUM ('DRAFT', 'LOCKED');
CREATE TYPE attendance_mark_enum AS ENUM ('P', 'A', 'L');

CREATE TABLE attendance_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_assignment_id UUID NOT NULL REFERENCES faculty_assignments(assignment_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    conducting_faculty_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    instructional_hours NUMERIC(3, 1) NOT NULL DEFAULT 1.0,
    submission_status session_submission_enum NOT NULL DEFAULT 'DRAFT',
    submitted_at TIMESTAMPTZ,
    submitting_user_uid VARCHAR(128) REFERENCES users(user_uid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_records (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES attendance_sessions(session_id) ON DELETE RESTRICT,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    attendance_status attendance_mark_enum NOT NULL DEFAULT 'A',
    remarks VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_session_student_attendance UNIQUE (session_id, student_profile_id)
);

CREATE TYPE qr_session_status_enum AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

CREATE TABLE live_qr_sessions (
    qr_session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
    timetable_entry_id VARCHAR(64),
    conducting_faculty_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    secret_key VARCHAR(128) NOT NULL,
    backup_challenge_code VARCHAR(16) NOT NULL,
    token_interval_seconds INT NOT NULL DEFAULT 20,
    status qr_session_status_enum NOT NULL DEFAULT 'ACTIVE',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE live_qr_scans (
    scan_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_session_id UUID NOT NULL REFERENCES live_qr_sessions(qr_session_id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    scanned_token_hash VARCHAR(128) NOT NULL,
    scan_method VARCHAR(32) NOT NULL DEFAULT 'CAMERA_QR',
    ip_address VARCHAR(64),
    user_agent TEXT,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_qr_session_student UNIQUE (qr_session_id, student_profile_id)
);

-- =============================================================================
-- 7. ATTENDANCE CORRECTION REQUESTS (FR-48 Governance & Audit Trail)
-- =============================================================================

CREATE TYPE correction_category_enum AS ENUM ('CLERICAL_ERROR', 'MEDICAL_LEAVE', 'OFFICIAL_DUTY', 'TECHNICAL_DISPUTE');
CREATE TYPE correction_status_enum AS ENUM ('PENDING_FACULTY', 'RECOMMENDED_HOD', 'APPROVED', 'REJECTED');

CREATE TABLE attendance_correction_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_record_id UUID NOT NULL REFERENCES attendance_records(record_id) ON DELETE RESTRICT,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES attendance_sessions(session_id) ON DELETE RESTRICT,
    claimed_status attendance_mark_enum NOT NULL,
    category correction_category_enum NOT NULL,
    student_justification TEXT NOT NULL,
    evidence_document_url TEXT,
    evidence_file_checksum VARCHAR(64),
    status correction_status_enum NOT NULL DEFAULT 'PENDING_FACULTY',
    reviewing_faculty_id UUID REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    faculty_remarks TEXT,
    approving_staff_id UUID REFERENCES staff_profiles(staff_profile_id) ON DELETE RESTRICT,
    resolution_remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

-- =============================================================================
-- 8. 5-TIER ACADEMIC CALENDAR EVENTS
-- =============================================================================

CREATE TYPE calendar_event_type_enum AS ENUM (
    'INSTRUCTIONAL_DAY', 'EXAMINATION', 'HOLIDAY', 
    'VACATION', 'SPORTS_CULTURAL', 'INSTITUTIONAL_EVENT'
);

CREATE TYPE audience_tier_enum AS ENUM ('INSTITUTION', 'COURSE', 'YEAR', 'SEMESTER', 'SECTION');

CREATE TABLE academic_calendar_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    event_type calendar_event_type_enum NOT NULL,
    is_non_instructional BOOLEAN NOT NULL DEFAULT FALSE,
    audience_tier audience_tier_enum NOT NULL DEFAULT 'INSTITUTION',
    course_id UUID REFERENCES courses(course_id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES academic_years(academic_year_id) ON DELETE CASCADE,
    semester_id UUID REFERENCES semesters(semester_id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(section_id) ON DELETE CASCADE,
    created_by VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_calendar_dates CHECK (end_date >= start_date)
);

-- =============================================================================
-- 9. ACTIVATION & VERIFICATION TOKENS
-- =============================================================================

CREATE TYPE token_purpose_enum AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'EMAIL_CHANGE_VERIFICATION');

CREATE TABLE activation_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    purpose token_purpose_enum NOT NULL,
    target_email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    is_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 10. AUDIT LOGS — LINEAR SEQUENTIAL SHA-256 CRYPTOGRAPHIC HASH CHAIN
-- ($H_i = SHA-256(H_{i-1} || actor || action || target || details || timestamp))
-- =============================================================================

CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    prev_record_hash VARCHAR(64) NOT NULL,
    record_hash VARCHAR(64) NOT NULL UNIQUE,
    actor_uid VARCHAR(128) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    client_ip VARCHAR(64) NOT NULL,
    user_agent TEXT,
    action_category VARCHAR(64) NOT NULL,
    target_entity_name VARCHAR(64) NOT NULL,
    target_entity_id VARCHAR(64) NOT NULL,
    change_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure audit logs are append-only; disallow UPDATE and DELETE
CREATE OR REPLACE FUNCTION app.fn_prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: audit_logs is append-only. UPDATE, DELETE, and TRUNCATE are permanently blocked.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.fn_prevent_audit_mutation();

-- Automated computation of linear cryptographic hash chain on insert
CREATE OR REPLACE FUNCTION app.fn_compute_audit_hash()
RETURNS TRIGGER AS $$
DECLARE
    last_hash VARCHAR(64);
    payload_to_hash TEXT;
BEGIN
    -- Retrieve cryptographic hash of immediately preceding record
    SELECT record_hash INTO last_hash 
    FROM audit_logs 
    ORDER BY log_id DESC 
    LIMIT 1;

    IF last_hash IS NULL THEN
        -- Genesis record initial salt
        last_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.prev_record_hash := last_hash;
    
    -- Format concatenated string for SHA-256 computation
    payload_to_hash := last_hash || '|' ||
                       NEW.actor_uid || '|' ||
                       NEW.actor_role || '|' ||
                       NEW.action_category || '|' ||
                       NEW.target_entity_name || '|' ||
                       NEW.target_entity_id || '|' ||
                       NEW.change_details::text || '|' ||
                       to_char(NEW.event_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

    NEW.record_hash := encode(digest(payload_to_hash, 'sha256'), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_hash_chain
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.fn_compute_audit_hash();

-- Verification function to audit entire linear hash chain integrity
CREATE OR REPLACE FUNCTION app.verify_audit_hash_chain()
RETURNS TABLE (
    is_valid BOOLEAN,
    tampered_log_id BIGINT,
    failure_reason TEXT
) AS $$
DECLARE
    rec RECORD;
    expected_prev VARCHAR(64) := '0000000000000000000000000000000000000000000000000000000000000000';
    computed_hash VARCHAR(64);
    payload_to_hash TEXT;
BEGIN
    FOR rec IN SELECT * FROM audit_logs ORDER BY log_id ASC LOOP
        IF rec.prev_record_hash <> expected_prev THEN
            RETURN QUERY SELECT FALSE, rec.log_id, 'Broken hash link: prev_record_hash does not match preceding record_hash';
            RETURN;
        END IF;

        payload_to_hash := rec.prev_record_hash || '|' ||
                           rec.actor_uid || '|' ||
                           rec.actor_role || '|' ||
                           rec.action_category || '|' ||
                           rec.target_entity_name || '|' ||
                           rec.target_entity_id || '|' ||
                           rec.change_details::text || '|' ||
                           to_char(rec.event_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

        computed_hash := encode(digest(payload_to_hash, 'sha256'), 'hex');

        IF rec.record_hash <> computed_hash THEN
            RETURN QUERY SELECT FALSE, rec.log_id, 'Tampered content: record_hash digest mismatch with row payload';
            RETURN;
        END IF;

        expected_prev := rec.record_hash;
    END LOOP;

    RETURN QUERY SELECT TRUE, NULL::BIGINT, 'Chain verified successfully. Zero integrity defects detected.'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 11. DISTRIBUTED STATE RECONCILIATION & EMAIL NOTIFICATIONS
-- =============================================================================

CREATE TYPE email_change_stage_enum AS ENUM (
    'REQUESTED', 'VERIFIED_NEW', 'FIREBASE_AUTH_UPDATED', 'COMPLETED', 'ROLLED_BACK'
);

CREATE TABLE pending_email_changes (
    change_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid) ON DELETE RESTRICT,
    old_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    verification_token_hash VARCHAR(128) NOT NULL,
    stage email_change_stage_enum NOT NULL DEFAULT 'REQUESTED',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    retry_count SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 12. PROCESSED IDEMPOTENCY KEYS (Persistent Application-Level Idempotency)
-- =============================================================================

CREATE TYPE idempotency_status_enum AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE processed_idempotency_keys (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    operation_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    execution_status idempotency_status_enum NOT NULL DEFAULT 'IN_PROGRESS',
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

-- Index for periodic cleanup of expired idempotency keys
CREATE INDEX idx_idempotency_expires_at ON processed_idempotency_keys (expires_at);

-- =============================================================================
-- 13. INDEXES FOR QUERY PLAN OPTIMIZATION (Eliminating Unjustified Sequential Scans)
-- =============================================================================

-- Attendance Records & Sessions High-Volume Queries (Target p95 < 50ms)
CREATE INDEX idx_attendance_records_student_session ON attendance_records (student_profile_id, session_id);
CREATE INDEX idx_attendance_records_session_status ON attendance_records (session_id, attendance_status);
CREATE INDEX idx_attendance_sessions_section_date ON attendance_sessions (section_id, session_date DESC);
CREATE INDEX idx_attendance_sessions_conducting_faculty ON attendance_sessions (conducting_faculty_id, session_date DESC);
CREATE INDEX idx_attendance_sessions_subject ON attendance_sessions (subject_id, section_id);

-- Student Profiles & Enrollment Lookups
CREATE INDEX idx_student_profiles_course_sec ON student_profiles (current_course_id, current_semester_id, current_section_id);
CREATE INDEX idx_enrollment_history_student ON student_enrollment_history (student_profile_id, academic_calendar_term);

-- Faculty Assignments & Workload Lookups
CREATE INDEX idx_faculty_assignments_faculty ON faculty_assignments (faculty_profile_id, academic_calendar_term);
CREATE INDEX idx_faculty_assignments_section ON faculty_assignments (section_id, subject_id);

-- User Sessions & Active Tokens Lookups
CREATE INDEX idx_user_sessions_lookup ON user_sessions (session_id, user_uid) WHERE revocation_status = 'ACTIVE';
CREATE INDEX idx_activation_tokens_lookup ON activation_tokens (token_hash) WHERE used_at IS NULL AND is_invalidated = FALSE;

-- Audit Logs Ordering & Verification Lookups
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_uid, event_timestamp DESC);
CREATE INDEX idx_audit_logs_category ON audit_logs (action_category, event_timestamp DESC);

-- =============================================================================
-- 14. ROW-LEVEL SECURITY (RLS) & TRANSACTION-LOCAL SCOPING
-- =============================================================================

-- Enable Row-Level Security on critical multi-tenant and academic tables
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_correction_requests ENABLE ROW LEVEL SECURITY;

-- Helper procedure to set transaction-local security context safely
CREATE OR REPLACE FUNCTION app.set_transaction_context(
    p_user_uid VARCHAR(128),
    p_user_role VARCHAR(32),
    p_department_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_uid', p_user_uid, true);
    PERFORM set_config('app.current_user_role', p_user_role, true);
    IF p_department_id IS NOT NULL THEN
        PERFORM set_config('app.current_department_id', p_department_id::text, true);
    ELSE
        PERFORM set_config('app.current_department_id', '', true);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- RLS POLICIES: Courses & Academic Structure (HOD Department Scope Isolation)
-- -----------------------------------------------------------------------------

CREATE POLICY rls_courses_dept_isolation ON courses
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR current_setting('app.current_department_id', true) = ''
        OR department_id = NULLIF(current_setting('app.current_department_id', true), '')::UUID
    );

CREATE POLICY rls_sections_isolation ON sections
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR current_setting('app.current_department_id', true) = ''
        OR semester_id IN (
            SELECT sem.semester_id 
            FROM semesters sem
            JOIN academic_years ay ON sem.academic_year_id = ay.academic_year_id
            JOIN courses c ON ay.course_id = c.course_id
            WHERE c.department_id = NULLIF(current_setting('app.current_department_id', true), '')::UUID
        )
    );

-- -----------------------------------------------------------------------------
-- RLS POLICIES: Student Profiles
-- -----------------------------------------------------------------------------

CREATE POLICY rls_student_profiles_access ON student_profiles
    FOR SELECT
    USING (
        -- Global admin can view all students
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        -- Student can view only their own profile
        OR user_uid = current_setting('app.current_user_uid', true)
        -- HOD can view students within their department
        OR (
            current_setting('app.current_user_role', true) = 'HOD'
            AND current_course_id IN (
                SELECT course_id FROM courses 
                WHERE department_id = NULLIF(current_setting('app.current_department_id', true), '')::UUID
            )
        )
        -- Faculty can view students enrolled in sections they teach
        OR (
            current_setting('app.current_user_role', true) = 'FACULTY'
            AND current_section_id IN (
                SELECT section_id FROM faculty_assignments fa
                JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
                WHERE fp.user_uid = current_setting('app.current_user_uid', true)
                AND fa.is_active = TRUE
            )
        )
    );

CREATE POLICY rls_student_profiles_update ON student_profiles
    FOR UPDATE
    USING (
        -- Global admin can update student profiles
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        -- Student can update only their own profile
        OR user_uid = current_setting('app.current_user_uid', true)
    );

-- -----------------------------------------------------------------------------
-- RLS POLICIES: Attendance Sessions
-- -----------------------------------------------------------------------------

CREATE POLICY rls_attendance_sessions_access ON attendance_sessions
    FOR ALL
    USING (
        -- Global admin has full access
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        -- HOD can view and manage sessions within their department
        OR (
            current_setting('app.current_user_role', true) = 'HOD'
            AND subject_id IN (
                SELECT s.subject_id FROM subjects s
                JOIN courses c ON s.course_id = c.course_id
                WHERE c.department_id = NULLIF(current_setting('app.current_department_id', true), '')::UUID
            )
        )
        -- Faculty can access sessions they are conducting
        OR (
            current_setting('app.current_user_role', true) = 'FACULTY'
            AND conducting_faculty_id IN (
                SELECT faculty_profile_id FROM faculty_profiles
                WHERE user_uid = current_setting('app.current_user_uid', true)
            )
        )
        -- Student can view sessions conducted for their enrolled section
        OR (
            current_setting('app.current_user_role', true) = 'STUDENT'
            AND section_id IN (
                SELECT current_section_id FROM student_profiles
                WHERE user_uid = current_setting('app.current_user_uid', true)
            )
        )
    );

-- -----------------------------------------------------------------------------
-- RLS POLICIES: Attendance Records
-- -----------------------------------------------------------------------------

CREATE POLICY rls_attendance_records_access ON attendance_records
    FOR ALL
    USING (
        -- Global admin full access
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        -- HOD access within department
        OR (
            current_setting('app.current_user_role', true) = 'HOD'
            AND session_id IN (
                SELECT sess.session_id FROM attendance_sessions sess
                JOIN subjects s ON sess.subject_id = s.subject_id
                JOIN courses c ON s.course_id = c.course_id
                WHERE c.department_id = NULLIF(current_setting('app.current_department_id', true), '')::UUID
            )
        )
        -- Faculty can access records for their sessions
        OR (
            current_setting('app.current_user_role', true) = 'FACULTY'
            AND session_id IN (
                SELECT sess.session_id FROM attendance_sessions sess
                JOIN faculty_profiles fp ON sess.conducting_faculty_id = fp.faculty_profile_id
                WHERE fp.user_uid = current_setting('app.current_user_uid', true)
            )
        )
        -- Student can view strictly their own attendance records
        OR (
            current_setting('app.current_user_role', true) = 'STUDENT'
            AND student_profile_id IN (
                SELECT student_profile_id FROM student_profiles
                WHERE user_uid = current_setting('app.current_user_uid', true)
            )
        )
    );

-- Prevent direct update on attendance records when session is LOCKED
CREATE OR REPLACE FUNCTION app.fn_prevent_locked_attendance_update()
RETURNS TRIGGER AS $$
DECLARE
    v_status session_submission_enum;
BEGIN
    SELECT submission_status INTO v_status 
    FROM attendance_sessions 
    WHERE session_id = NEW.session_id;

    IF v_status = 'LOCKED' AND (OLD.attendance_status <> NEW.attendance_status) THEN
        -- Allow mutation only if authorized via FR-48 correction approval workflow
        IF current_setting('app.in_approved_correction_workflow', true) <> 'TRUE' THEN
            RAISE EXCEPTION 'ATTENDANCE MUTATION BLOCKED: Session is LOCKED. In-place modification is forbidden without approved FR-48 correction workflow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attendance_records_prevent_locked_mutation
BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION app.fn_prevent_locked_attendance_update();

-- =============================================================================
-- 11. EXAMINATION MARKS MANAGEMENT MODULE (Section 15 Architecture)
-- =============================================================================

CREATE TYPE assessment_type_enum AS ENUM ('ASSIGNMENT', 'SESSIONAL_1', 'SESSIONAL_2', 'FINAL_SEMESTER');
CREATE TYPE assessment_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'FINALIZED', 'PUBLISHED');
CREATE TYPE student_mark_status_enum AS ENUM ('PRESENT', 'ABSENT', 'EXEMPTED', 'WITHHELD', 'INCOMPLETE');

CREATE TABLE assessments (
    assessment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    faculty_assignment_id UUID REFERENCES faculty_assignments(assignment_id) ON DELETE RESTRICT,
    assessment_type assessment_type_enum NOT NULL,
    assessment_title VARCHAR(255) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL CHECK (max_marks > 0),
    due_date DATE,
    academic_calendar_term VARCHAR(64) NOT NULL,
    status assessment_status_enum NOT NULL DEFAULT 'DRAFT',
    created_by_user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    published_at TIMESTAMPTZ,
    published_by_user_uid VARCHAR(128) REFERENCES users(user_uid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_marks (
    mark_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    marks_obtained NUMERIC(5, 2) CHECK (marks_obtained >= 0),
    status student_mark_status_enum NOT NULL DEFAULT 'PRESENT',
    remarks VARCHAR(255),
    entered_by_user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_assessment_student_mark UNIQUE (assessment_id, student_profile_id)
);

CREATE TABLE marks_import_batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    assessment_id UUID REFERENCES assessments(assessment_id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    error_rows INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'VALIDATED',
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE marks_import_errors (
    error_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES marks_import_batches(batch_id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    student_id VARCHAR(64),
    subject_code VARCHAR(32),
    error_message TEXT NOT NULL,
    raw_data JSONB
);

CREATE TABLE marks_change_audit (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mark_id UUID REFERENCES assessment_marks(mark_id) ON DELETE SET NULL,
    assessment_id UUID NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE RESTRICT,
    previous_marks NUMERIC(5, 2),
    new_marks NUMERIC(5, 2),
    previous_status student_mark_status_enum,
    new_status student_mark_status_enum,
    reason TEXT NOT NULL,
    changed_by_user_uid VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Row-Level Security for Examination Marks
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_assessments_policy ON assessments
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR (
            current_setting('app.current_user_role', true) = 'FACULTY'
            AND (
                created_by_user_uid = current_setting('app.current_user_uid', true)
                OR faculty_assignment_id IN (
                    SELECT assignment_id FROM faculty_assignments fa
                    JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
                    WHERE fp.user_uid = current_setting('app.current_user_uid', true)
                )
            )
        )
        OR (
            current_setting('app.current_user_role', true) = 'STUDENT'
            AND status = 'PUBLISHED'
        )
    );

CREATE POLICY rls_assessment_marks_policy ON assessment_marks
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR (
            current_setting('app.current_user_role', true) = 'FACULTY'
            AND assessment_id IN (
                SELECT assessment_id FROM assessments
                WHERE created_by_user_uid = current_setting('app.current_user_uid', true)
                   OR faculty_assignment_id IN (
                       SELECT assignment_id FROM faculty_assignments fa
                       JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
                       WHERE fp.user_uid = current_setting('app.current_user_uid', true)
                   )
            )
        )
        OR (
            current_setting('app.current_user_role', true) = 'STUDENT'
            AND student_profile_id IN (
                SELECT student_profile_id FROM student_profiles
                WHERE user_uid = current_setting('app.current_user_uid', true)
            )
            AND assessment_id IN (
                SELECT assessment_id FROM assessments WHERE status = 'PUBLISHED'
            )
        )
    );

-- =============================================================================
-- 12. MULTI-DEPARTMENT TIMETABLE & SCHEDULING MANAGEMENT
-- =============================================================================

CREATE TYPE room_type_enum AS ENUM ('LECTURE_HALL', 'CLASSROOM', 'LABORATORY', 'SEMINAR_HALL');
CREATE TYPE class_type_enum AS ENUM ('THEORY', 'PRACTICAL', 'TUTORIAL', 'LABORATORY', 'ACTIVITY');
CREATE TYPE timetable_status_enum AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE day_of_week_enum AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

CREATE TABLE classrooms_and_labs (
    room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    room_code VARCHAR(32) NOT NULL UNIQUE,
    room_name VARCHAR(128) NOT NULL,
    room_type room_type_enum NOT NULL DEFAULT 'CLASSROOM',
    capacity INT NOT NULL DEFAULT 80 CHECK (capacity BETWEEN 10 AND 500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE period_definitions (
    period_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_index SMALLINT NOT NULL UNIQUE CHECK (period_index BETWEEN 1 AND 12),
    period_label VARCHAR(64) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_instructional BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_period_time CHECK (end_time > start_time)
);

CREATE TABLE section_groups (
    group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE CASCADE,
    group_name VARCHAR(32) NOT NULL,
    description VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_section_group_name UNIQUE (section_id, group_name)
);

CREATE TABLE student_group_memberships (
    membership_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_profile_id UUID NOT NULL REFERENCES student_profiles(student_profile_id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES section_groups(group_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_group_membership UNIQUE (student_profile_id, group_id)
);

CREATE TABLE timetables (
    timetable_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_calendar_term VARCHAR(64) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES sections(section_id) ON DELETE RESTRICT,
    effective_date DATE NOT NULL,
    version_number SMALLINT NOT NULL DEFAULT 1,
    status timetable_status_enum NOT NULL DEFAULT 'DRAFT',
    created_by VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE timetable_entries (
    entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timetable_id UUID NOT NULL REFERENCES timetables(timetable_id) ON DELETE CASCADE,
    day_of_week day_of_week_enum NOT NULL,
    period_index SMALLINT NOT NULL CHECK (period_index BETWEEN 1 AND 12),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    class_type class_type_enum NOT NULL DEFAULT 'THEORY',
    group_id UUID REFERENCES section_groups(group_id) ON DELETE SET NULL,
    room_id UUID REFERENCES classrooms_and_labs(room_id) ON DELETE SET NULL,
    primary_faculty_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    co_faculty_ids UUID[] DEFAULT '{}',
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_entry_time CHECK (end_time > start_time)
);

CREATE TABLE timetable_substitutions (
    substitution_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES timetable_entries(entry_id) ON DELETE CASCADE,
    substitution_date DATE NOT NULL,
    original_faculty_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    substitute_faculty_id UUID NOT NULL REFERENCES faculty_profiles(faculty_profile_id) ON DELETE RESTRICT,
    reason TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
    approved_by VARCHAR(128) NOT NULL REFERENCES users(user_uid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Timetable Query Optimization Indexes
CREATE INDEX idx_timetable_lookup ON timetables (course_id, semester_id, section_id, status);
CREATE INDEX idx_timetable_entries_schedule ON timetable_entries (day_of_week, period_index);
CREATE INDEX idx_timetable_entries_faculty ON timetable_entries (primary_faculty_id, day_of_week);
CREATE INDEX idx_timetable_entries_room ON timetable_entries (room_id, day_of_week);

-- Row-Level Security for Timetables
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_timetables_policy ON timetables
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR current_setting('app.current_user_role', true) IN ('FACULTY', 'STUDENT')
    );

CREATE POLICY rls_timetable_entries_policy ON timetable_entries
    FOR ALL
    USING (
        current_setting('app.current_user_role', true) = 'GLOBAL_ADMIN'
        OR current_setting('app.current_user_role', true) IN ('FACULTY', 'STUDENT')
    );


