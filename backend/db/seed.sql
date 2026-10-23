-- =============================================================================
-- COLLEGE ATTENDANCE MANAGEMENT SYSTEM — SEED DATA SCRIPT v1.8
-- Establishes Core Academic Hierarchy: BCA & B.Tech Programs, Departments,
-- Semesters, Sections, Subjects, Faculty Assignments, and Test Users
-- =============================================================================

-- 1. Create Institution
INSERT INTO institutions (institution_id, institution_code, name, domain)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'COLLEGE-MAIN',
    'St. Xavier College of Engineering & Technology',
    'college.edu'
) ON CONFLICT (institution_code) DO NOTHING;

-- 2. Create Initial Schools
INSERT INTO schools (school_id, institution_id, school_code, school_name, description)
VALUES 
(
    's0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'SST',
    'School of Science & Technology',
    'Premier engineering, computer applications, and technology school.'
),
(
    's0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'SBS',
    'School of Bioscience',
    'Biotechnology, biomedical sciences, and life sciences school.'
),
(
    's0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'SOM',
    'School of Management',
    'Business administration, leadership, and commerce school.'
) ON CONFLICT (institution_id, school_code) DO NOTHING;

-- 3. Create Departments (mapped to Schools)
INSERT INTO departments (department_id, institution_id, school_id, department_code, department_name)
VALUES 
(
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    's0000000-0000-0000-0000-000000000001',
    'CA',
    'Department of Computer Applications'
),
(
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    's0000000-0000-0000-0000-000000000001',
    'CSE',
    'Department of Computer Science & Engineering'
) ON CONFLICT (institution_id, department_code) DO NOTHING;

-- 4. Create Courses (mapped to Schools and Departments)
INSERT INTO courses (course_id, school_id, department_id, course_code, course_name, duration_years, total_semesters)
VALUES
(
    'c0000000-0000-0000-0000-000000000001',
    's0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'BCA',
    'Bachelor of Computer Applications',
    3,
    6
),
(
    'c0000000-0000-0000-0000-000000000002',
    's0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'BTECH-CSE',
    'Bachelor of Technology in Computer Science & Engineering',
    4,
    8
) ON CONFLICT (department_id, course_code) DO NOTHING;

-- 4. Create Academic Years for BCA (Year 1, 2, 3)
INSERT INTO academic_years (academic_year_id, course_id, year_number, display_label)
VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 'BCA 1st Year'),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2, 'BCA 2nd Year'),
('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 3, 'BCA 3rd Year')
ON CONFLICT (course_id, year_number) DO NOTHING;

-- 5. Create Semesters for BCA
INSERT INTO semesters (semester_id, academic_year_id, semester_number, display_label)
VALUES
('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'Semester 1'),
('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2, 'Semester 2'),
('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 3, 'Semester 3'),
('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 4, 'Semester 4'),
('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', 5, 'Semester 5'),
('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003', 6, 'Semester 6')
ON CONFLICT (academic_year_id, semester_number) DO NOTHING;

-- 6. Create Sections for BCA Semester 1 (Sections A, B, C, D - capacity 80 each)
INSERT INTO sections (section_id, semester_id, section_name, max_capacity, academic_calendar_term)
VALUES
('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'A', 80, 'Autumn 2026'),
('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'B', 80, 'Autumn 2026'),
('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'C', 80, 'Autumn 2026'),
('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'D', 80, 'Autumn 2026')
ON CONFLICT (semester_id, section_name, academic_calendar_term) DO NOTHING;

-- 7. Create Curricular Subjects for BCA Semester 1
INSERT INTO subjects (subject_id, course_id, semester_id, subject_code, subject_name, planned_hours, credit_value)
VALUES
('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'BCA-101', 'Programming Fundamentals using C', 45.0, 4.0),
('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'BCA-102', 'Computer Architecture & Digital Logic', 45.0, 4.0),
('10000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'BCA-103', 'Discrete Mathematics', 40.0, 3.0),
('10000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'BCA-104', 'Technical Communication', 30.0, 2.0)
ON CONFLICT (course_id, semester_id, subject_code) DO NOTHING;

-- 8. Create Administrative, HOD, Faculty, and Student Users
-- Global Admin
INSERT INTO users (user_uid, email, role, status, is_email_verified)
VALUES ('usr-admin-001', 'admin@college.edu', 'GLOBAL_ADMIN', 'ACTIVE', TRUE)
ON CONFLICT (user_uid) DO NOTHING;

INSERT INTO staff_profiles (staff_profile_id, user_uid, administrative_staff_id, full_name, official_email, permission_scope, administrative_designation)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'usr-admin-001',
    'ADM-001',
    'Dr. Arvind Sharma',
    'admin@college.edu',
    'GLOBAL_ADMIN',
    'Dean of Academic Affairs & Global Admin'
) ON CONFLICT (administrative_staff_id) DO NOTHING;

-- HOD of Computer Applications
INSERT INTO users (user_uid, email, role, status, is_email_verified)
VALUES ('usr-hod-ca-001', 'hod.ca@college.edu', 'HOD', 'ACTIVE', TRUE)
ON CONFLICT (user_uid) DO NOTHING;

INSERT INTO staff_profiles (staff_profile_id, user_uid, administrative_staff_id, full_name, official_email, department_id, permission_scope, administrative_designation)
VALUES (
    '20000000-0000-0000-0000-000000000002',
    'usr-hod-ca-001',
    'HOD-CA-01',
    'Dr. K. R. Ramanathan',
    'hod.ca@college.edu',
    'b0000000-0000-0000-0000-000000000001',
    'HOD_DEPT_ADMIN',
    'Head of Department (Computer Applications)'
) ON CONFLICT (administrative_staff_id) DO NOTHING;

-- Faculty Member (Dr. Meenakshi Sundaram - FAC-201)
INSERT INTO users (user_uid, email, role, status, is_email_verified)
VALUES ('usr-fac-201', 'm.sundaram@college.edu', 'FACULTY', 'ACTIVE', TRUE)
ON CONFLICT (user_uid) DO NOTHING;

INSERT INTO faculty_profiles (faculty_profile_id, user_uid, faculty_staff_id, full_name, official_email, department_id, designation)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    'usr-fac-201',
    'FAC-201',
    'Dr. Meenakshi Sundaram',
    'm.sundaram@college.edu',
    'b0000000-0000-0000-0000-000000000001',
    'Associate Professor'
) ON CONFLICT (faculty_staff_id) DO NOTHING;

-- Assign Dr. Meenakshi Sundaram to teach BCA-101 in Section A
INSERT INTO faculty_assignments (assignment_id, faculty_profile_id, subject_id, section_id, academic_calendar_term, is_active)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    'Autumn 2026',
    TRUE
) ON CONFLICT (faculty_profile_id, subject_id, section_id, academic_calendar_term) DO NOTHING;

-- Student Aarav Sharma (STU-101) enrolled in BCA Sem 1 Section A
INSERT INTO users (user_uid, email, role, status, is_email_verified)
VALUES ('usr-stu-101', 'aarav.sharma@student.college.edu', 'STUDENT', 'ACTIVE', TRUE)
ON CONFLICT (user_uid) DO NOTHING;

INSERT INTO student_profiles (
    student_profile_id, user_uid, student_id, enrollment_no, registration_no, registration_id, full_name, 
    student_gmail, school_id, current_course_id, current_academic_year_id, 
    current_semester_id, current_section_id, roll_number
) VALUES (
    '50000000-0000-0000-0000-000000000001',
    'usr-stu-101',
    'STU-101',
    'SRHU238990',
    'dd241104301172',
    'REG-2026-BCA-001',
    'Aarav Sharma',
    'aarav.sharma@student.college.edu',
    's0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '01'
) ON CONFLICT (student_id) DO NOTHING;

INSERT INTO student_enrollment_history (
    student_profile_id, course_id, academic_year_id, semester_id, 
    section_id, academic_calendar_term, enrollment_status, term_start_date
) VALUES (
    '50000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    'Autumn 2026',
    'ACTIVE',
    '2026-08-01'
) ON CONFLICT DO NOTHING;

-- 9. Insert Sample Academic Calendar Events
INSERT INTO academic_calendar_events (
    event_id, title, description, start_date, end_date, 
    event_type, is_non_instructional, audience_tier, created_by
) VALUES 
(
    '60000000-0000-0000-0000-000000000001',
    'Autumn 2026 Term Commencement',
    'Official start of classroom instruction for all courses.',
    '2026-08-01',
    '2026-08-01',
    'INSTRUCTIONAL_DAY',
    FALSE,
    'INSTITUTION',
    'usr-admin-001'
),
(
    '60000000-0000-0000-0000-000000000002',
    'Mid-Term Sessional Examinations',
    'Continuous internal assessment exams for all semesters.',
    '2026-10-12',
    '2026-10-17',
    'EXAMINATION',
    TRUE,
    'INSTITUTION',
    'usr-admin-001'
),
(
    '60000000-0000-0000-0000-000000000003',
    'Deepavali Institutional Recess',
    'National festival holiday. College closed.',
    '2026-11-01',
    '2026-11-05',
    'HOLIDAY',
    TRUE,
    'INSTITUTION',
    'usr-admin-001'
) ON CONFLICT DO NOTHING;

-- 10. Examination Marks Module Seed Data (Section 15)
-- Create Assessments for BCA Semester 1 Section A (Subject: BCA-101)
INSERT INTO assessments (
    assessment_id, course_id, semester_id, section_id, subject_id,
    faculty_assignment_id, assessment_type, assessment_title, max_marks,
    due_date, academic_calendar_term, status, created_by_user_uid,
    published_at, published_by_user_uid
) VALUES 
(
    '70000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'ASSIGNMENT',
    'Assignment 1: Pointer Arithmetic & Memory Allocation',
    20.00,
    '2026-09-15',
    'Autumn 2026',
    'PUBLISHED',
    'usr-fac-201',
    '2026-09-18 10:00:00+00',
    'usr-fac-201'
),
(
    '70000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'ASSIGNMENT',
    'Assignment 2: Structured Data Types & File I/O',
    20.00,
    '2026-10-25',
    'Autumn 2026',
    'DRAFT',
    'usr-fac-201',
    NULL,
    NULL
),
(
    '70000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'SESSIONAL_1',
    'Sessional Examination 1 (Theory & Code Tracing)',
    30.00,
    '2026-10-15',
    'Autumn 2026',
    'PUBLISHED',
    'usr-fac-201',
    '2026-10-18 14:00:00+00',
    'usr-fac-201'
),
(
    '70000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'SESSIONAL_2',
    'Sessional Examination 2 (Algorithms & Data Structures)',
    30.00,
    '2026-11-20',
    'Autumn 2026',
    'SUBMITTED',
    'usr-fac-201',
    NULL,
    NULL
),
(
    '70000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'FINAL_SEMESTER',
    'Final Semester University Examination — Autumn 2026',
    100.00,
    '2026-12-10',
    'Autumn 2026',
    'FINALIZED',
    'usr-admin-001',
    NULL,
    NULL
) ON CONFLICT (assessment_id) DO NOTHING;

-- Seed Marks for Student Aarav Sharma (STU-101: 50000000-0000-0000-0000-000000000001)
INSERT INTO assessment_marks (
    mark_id, assessment_id, student_profile_id, marks_obtained,
    status, remarks, entered_by_user_uid
) VALUES
(
    '80000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    18.50,
    'PRESENT',
    'Excellent dynamic memory handling and edge cases',
    'usr-fac-201'
),
(
    '80000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    27.00,
    'PRESENT',
    'Strong theoretical comprehension of pointer concepts',
    'usr-fac-201'
),
(
    '80000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000001',
    84.00,
    'PRESENT',
    'Final Semester Verified University Result',
    'usr-admin-001'
) ON CONFLICT (assessment_id, student_profile_id) DO NOTHING;


