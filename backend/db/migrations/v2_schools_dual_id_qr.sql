-- =============================================================================
-- MIGRATION v2.0: Institutional Student Identity, School Hierarchy & Live QR Attendance
-- Database Engine: PostgreSQL 15+ (Google Cloud SQL / Firebase Data Connect)
-- =============================================================================

BEGIN;

-- 1. Create Schools Table
CREATE TABLE IF NOT EXISTS schools (
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

-- 2. Add School References to Departments and Courses
ALTER TABLE departments 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT;

ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT;

-- Make department_id nullable on courses so schools can offer direct programmes
ALTER TABLE courses 
ALTER COLUMN department_id DROP NOT NULL;

-- 3. Enhance student_profiles with Dual Institutional Identifiers & School
ALTER TABLE student_profiles 
ADD COLUMN IF NOT EXISTS enrollment_no VARCHAR(64),
ADD COLUMN IF NOT EXISTS registration_no VARCHAR(64),
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(school_id) ON DELETE RESTRICT;

-- Unique constraints for independent identifiers
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_enrollment_no ON student_profiles (enrollment_no) WHERE enrollment_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_registration_no ON student_profiles (registration_no) WHERE registration_no IS NOT NULL;

-- 4. Seed Initial 3 Schools
INSERT INTO schools (school_id, institution_id, school_code, school_name, description)
VALUES 
(
    's0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'SST',
    'School of Science & Technology',
    'Premier engineering and computer applications academic school.'
),
(
    's0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'SBS',
    'School of Bioscience',
    'Biotechnology, microbiology, and biomedical sciences faculty.'
),
(
    's0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'SOM',
    'School of Management',
    'Business administration, management analytics, and commerce faculty.'
)
ON CONFLICT (institution_id, school_code) DO NOTHING;

-- Map existing departments to School of Science & Technology
UPDATE departments 
SET school_id = 's0000000-0000-0000-0000-000000000001'
WHERE school_id IS NULL;

-- Map existing courses to School of Science & Technology
UPDATE courses 
SET school_id = 's0000000-0000-0000-0000-000000000001'
WHERE school_id IS NULL;

-- 5. Live QR Attendance Subsystem Tables
CREATE TYPE qr_session_status_enum AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

CREATE TABLE IF NOT EXISTS live_qr_sessions (
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

CREATE TABLE IF NOT EXISTS live_qr_scans (
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

CREATE INDEX IF NOT EXISTS idx_live_qr_session_status ON live_qr_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_live_qr_scans_session ON live_qr_scans(qr_session_id);

COMMIT;
