-- =============================================================================
-- MIGRATION v3: ENROLLMENT STATUS ENUM EXTENSION & AUDIT COMPATIBILITY
-- Safe, repeatable migration for PostgreSQL Cloud SQL / Render databases
-- =============================================================================

DO $$
BEGIN
    -- Add 'PENDING' to enrollment_status_enum if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'enrollment_status_enum'::regtype 
        AND enumlabel = 'PENDING'
    ) THEN
        ALTER TYPE enrollment_status_enum ADD VALUE 'PENDING' BEFORE 'ACTIVE';
    END IF;

    -- Add 'TRANSFERRED' to enrollment_status_enum if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'enrollment_status_enum'::regtype 
        AND enumlabel = 'TRANSFERRED'
    ) THEN
        ALTER TYPE enrollment_status_enum ADD VALUE 'TRANSFERRED' AFTER 'ACTIVE';
    END IF;
END $$;
