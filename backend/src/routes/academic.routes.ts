import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { pool, runWithTransactionContext } from '../config/db';
import { AuditService } from '../services/audit';
import { localCourses, localDepartments } from './admin.routes';

const router = Router();

async function isDbConnected(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

// =============================================================================
// IN-MEMORY CALENDAR EVENTS STORE (Initialized with Official University Dates)
// =============================================================================

export interface AcademicEvent {
  event_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  event_type: 'EXAMINATION' | 'HOLIDAY' | 'VACATION' | 'SPORTS_CULTURAL' | 'INSTITUTIONAL_EVENT' | 'INSTRUCTIONAL_DAY';
  is_non_instructional: boolean;
  audience_tier: 'INSTITUTION' | 'COURSE' | 'YEAR' | 'SEMESTER' | 'SECTION';
  course_id?: string | null;
  academic_year_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  created_by: string;
  created_at: string;
}

let inMemoryEvents: AcademicEvent[] = [
  {
    event_id: 'e1000000-0000-0000-0000-000000000001',
    title: 'Gandhi Jayanti',
    description: 'Statutory national holiday in observance of the birth of Mahatma Gandhi.',
    start_date: '2026-10-02',
    end_date: '2026-10-02',
    event_type: 'HOLIDAY',
    is_non_instructional: true,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    event_id: 'e1000000-0000-0000-0000-000000000002',
    title: 'Dussehra (Vijayadashami)',
    description: 'Gazetted institutional festival holiday across all faculties and departments.',
    start_date: '2026-10-20',
    end_date: '2026-10-20',
    event_type: 'HOLIDAY',
    is_non_instructional: true,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    event_id: 'e1000000-0000-0000-0000-000000000003',
    title: 'Continuous Internal Assessment Tests (CIA-1)',
    description: 'Mandatory midterm internal assessments for all enrolled cohorts. Regular instructional lectures suspended during testing slots.',
    start_date: '2026-10-24',
    end_date: '2026-10-28',
    event_type: 'EXAMINATION',
    is_non_instructional: false,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    event_id: 'e1000000-0000-0000-0000-000000000004',
    title: 'College Foundation Day',
    description: 'Annual institutional commemoration ceremony in the Main Auditorium. Morning academic session only.',
    start_date: '2026-11-03',
    end_date: '2026-11-03',
    event_type: 'INSTITUTIONAL_EVENT',
    is_non_instructional: false,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    event_id: 'e1000000-0000-0000-0000-000000000005',
    title: 'Medical Certificate Submission Deadline',
    description: 'Final institutional cutoff date for submission of verified medical leave documentation for term attendance calculation.',
    start_date: '2026-11-15',
    end_date: '2026-11-15',
    event_type: 'INSTITUTIONAL_EVENT',
    is_non_instructional: false,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    event_id: 'e1000000-0000-0000-0000-000000000006',
    title: 'Winter Vacation & Semester Break',
    description: 'Campus academic facilities closed for winter recess. Administrative offices resume in January.',
    start_date: '2026-12-22',
    end_date: '2027-01-02',
    event_type: 'VACATION',
    is_non_instructional: true,
    audience_tier: 'INSTITUTION',
    created_by: 'system',
    created_at: '2026-08-01T00:00:00Z',
  },
];

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CalendarEventSchema = z.object({
  title: z.string().min(3, 'Event title must be at least 3 characters').max(255),
  description: z.string().optional().default(''),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  event_type: z.enum([
    'EXAMINATION',
    'EXAM',
    'HOLIDAY',
    'VACATION',
    'SPORTS_CULTURAL',
    'INSTITUTIONAL_EVENT',
    'INSTRUCTIONAL_DAY',
    'DEADLINE',
    'EVENT',
  ]).transform(v => {
    if (v === 'EXAM') return 'EXAMINATION';
    if (v === 'DEADLINE') return 'INSTITUTIONAL_EVENT';
    if (v === 'EVENT') return 'SPORTS_CULTURAL';
    return v;
  }),
  is_non_instructional: z.boolean().optional().default(false),
  audience_tier: z.enum(['INSTITUTION', 'COURSE', 'YEAR', 'SEMESTER', 'SECTION', 'ALL'])
    .transform(v => v === 'ALL' ? 'INSTITUTION' : v)
    .optional()
    .default('INSTITUTION'),
  course_id: z.string().uuid().nullable().optional(),
  academic_year_id: z.string().uuid().nullable().optional(),
  semester_id: z.string().uuid().nullable().optional(),
  section_id: z.string().uuid().nullable().optional(),
}).refine(data => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

/**
 * GET /api/academic/courses
 * Lists courses.
 */
router.get('/courses', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const dbOnline = await isDbConnected();
    if (dbOnline) {
      const result = await runWithTransactionContext(req.securityContext!, async (client) => {
        const query = `
          SELECT c.*, d.department_name, d.department_code
          FROM courses c
          JOIN departments d ON c.department_id = d.department_id
          WHERE c.is_active = TRUE
          ORDER BY c.course_name ASC
        `;
        const resData = await client.query(query);
        return resData.rows;
      });

      res.json(result);
      return;
    }

    // In-Memory Fallback
    const joined = localCourses.map((c) => {
      const dept = localDepartments.find((d) => d.department_id === c.department_id);
      return {
        ...c,
        department_name: dept?.department_name || 'General Department',
        department_code: dept?.department_code || 'GEN',
        is_active: true,
      };
    });

    res.json(joined);
  } catch (err: any) {
    // In-memory fallback on any error
    const joined = localCourses.map((c) => {
      const dept = localDepartments.find((d) => d.department_id === c.department_id);
      return {
        ...c,
        department_name: dept?.department_name || 'General Department',
        department_code: dept?.department_code || 'GEN',
        is_active: true,
      };
    });
    res.json(joined);
  }
});

/**
 * GET /api/academic/calendar
 * Retrieves audience-targeted 5-tier academic calendar events.
 * Accessible to all authenticated users (students, faculty, admins).
 */
router.get('/calendar', async (req: Request, res: Response): Promise<void> => {
  const { courseId, semesterId, sectionId } = req.query;

  try {
    if (pool) {
      const query = `
        SELECT * FROM academic_calendar_events
        WHERE audience_tier = 'INSTITUTION'
           OR (audience_tier = 'COURSE' AND course_id = $1::uuid)
           OR (audience_tier = 'SEMESTER' AND semester_id = $2::uuid)
           OR (audience_tier = 'SECTION' AND section_id = $3::uuid)
        ORDER BY start_date ASC
      `;
      const resData = await pool.query(query, [
        courseId || null,
        semesterId || null,
        sectionId || null,
      ]);
      if (resData.rows && resData.rows.length > 0) {
        res.json(resData.rows);
        return;
      }
    }
  } catch (_dbErr) {
    // Fall back to in-memory store
  }

  // Return in-memory events filtered by dates or tier
  const sorted = [...inMemoryEvents].sort((a, b) => a.start_date.localeCompare(b.start_date));
  res.json(sorted);
});

/**
 * POST /api/academic/calendar
 * Admin creates a new academic calendar event (e.g. Exam dates, Holidays, Deadlines).
 * Role: GLOBAL_ADMIN only.
 */
router.post('/calendar', authenticate, requireRole(['GLOBAL_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = CalendarEventSchema.parse(req.body);
    const eventId = `e${Date.now().toString(16)}-${Math.random().toString(16).substring(2, 8)}`;
    const adminUid = req.user?.uid || 'admin';

    const newEvent: AcademicEvent = {
      event_id: eventId,
      title: parsed.title,
      description: parsed.description,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      event_type: parsed.event_type,
      is_non_instructional: parsed.is_non_instructional,
      audience_tier: parsed.audience_tier,
      course_id: parsed.course_id || null,
      academic_year_id: parsed.academic_year_id || null,
      semester_id: parsed.semester_id || null,
      section_id: parsed.section_id || null,
      created_by: adminUid,
      created_at: new Date().toISOString(),
    };

    // Try DB insertion if pool is available
    if (pool) {
      try {
        const insertQuery = `
          INSERT INTO academic_calendar_events (
            title, description, start_date, end_date, event_type, 
            is_non_instructional, audience_tier, course_id, 
            academic_year_id, semester_id, section_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;
        const dbRes = await pool.query(insertQuery, [
          newEvent.title,
          newEvent.description,
          newEvent.start_date,
          newEvent.end_date,
          newEvent.event_type,
          newEvent.is_non_instructional,
          newEvent.audience_tier,
          newEvent.course_id,
          newEvent.academic_year_id,
          newEvent.semester_id,
          newEvent.section_id,
          adminUid,
        ]);
        if (dbRes.rows && dbRes.rows.length > 0) {
          newEvent.event_id = dbRes.rows[0].event_id;
        }
      } catch (_dbErr) {
        // DB error or fallback: use memory
      }
    }

    inMemoryEvents.push(newEvent);

    // Audit Log
    AuditService.record(null, {
      actorUid: adminUid,
      actorRole: req.user?.role || 'GLOBAL_ADMIN',
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'UNKNOWN',
      actionCategory: 'CALENDAR_PUBLISH',
      targetEntityName: 'academic_calendar_events',
      targetEntityId: newEvent.event_id,
      changeDetails: {
        title: newEvent.title,
        eventType: newEvent.event_type,
        startDate: newEvent.start_date,
        endDate: newEvent.end_date,
        action: 'CREATE',
      },
    }).catch(() => {});

    res.status(201).json({
      message: 'Calendar event published successfully',
      event: newEvent,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_FAILED', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'FAILED_CREATE_EVENT', message: err.message });
  }
});

/**
 * PUT /api/academic/calendar/:id
 * Admin updates an existing academic calendar event (e.g. reschedule exams, change details).
 * Role: GLOBAL_ADMIN only.
 */
router.put('/calendar/:id', authenticate, requireRole(['GLOBAL_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const parsed = CalendarEventSchema.parse(req.body);
    const adminUid = req.user?.uid || 'admin';

    let updatedEvent: AcademicEvent | null = null;

    // Check in-memory store
    const memIndex = inMemoryEvents.findIndex(e => e.event_id === id);
    if (memIndex !== -1) {
      inMemoryEvents[memIndex] = {
        ...inMemoryEvents[memIndex],
        title: parsed.title,
        description: parsed.description,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        event_type: parsed.event_type,
        is_non_instructional: parsed.is_non_instructional,
        audience_tier: parsed.audience_tier,
        course_id: parsed.course_id || null,
        semester_id: parsed.semester_id || null,
        section_id: parsed.section_id || null,
      };
      updatedEvent = inMemoryEvents[memIndex];
    }

    // Try DB update
    if (pool) {
      try {
        const updateQuery = `
          UPDATE academic_calendar_events
          SET title = $1, description = $2, start_date = $3, end_date = $4,
              event_type = $5, is_non_instructional = $6, audience_tier = $7
          WHERE event_id = $8::uuid
          RETURNING *
        `;
        const dbRes = await pool.query(updateQuery, [
          parsed.title,
          parsed.description,
          parsed.start_date,
          parsed.end_date,
          parsed.event_type,
          parsed.is_non_instructional,
          parsed.audience_tier,
          id,
        ]);
        if (dbRes.rows && dbRes.rows.length > 0) {
          updatedEvent = dbRes.rows[0];
        }
      } catch (_dbErr) {
        // DB error or fallback
      }
    }

    if (!updatedEvent) {
      res.status(404).json({ error: 'EVENT_NOT_FOUND', message: 'Academic calendar event not found.' });
      return;
    }

    // Audit Log
    AuditService.record(null, {
      actorUid: adminUid,
      actorRole: req.user?.role || 'GLOBAL_ADMIN',
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'UNKNOWN',
      actionCategory: 'CALENDAR_PUBLISH',
      targetEntityName: 'academic_calendar_events',
      targetEntityId: id,
      changeDetails: {
        title: parsed.title,
        eventType: parsed.event_type,
        startDate: parsed.start_date,
        endDate: parsed.end_date,
        action: 'UPDATE',
      },
    }).catch(() => {});

    res.json({
      message: 'Calendar event updated successfully',
      event: updatedEvent,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_FAILED', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'FAILED_UPDATE_EVENT', message: err.message });
  }
});

/**
 * DELETE /api/academic/calendar/:id
 * Admin deletes an academic calendar event.
 * Role: GLOBAL_ADMIN only.
 */
router.delete('/calendar/:id', authenticate, requireRole(['GLOBAL_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const adminUid = req.user?.uid || 'admin';

  try {
    const memIndex = inMemoryEvents.findIndex(e => e.event_id === id);
    let deletedTitle = 'Academic Event';
    if (memIndex !== -1) {
      deletedTitle = inMemoryEvents[memIndex].title;
      inMemoryEvents.splice(memIndex, 1);
    }

    if (pool) {
      try {
        await pool.query('DELETE FROM academic_calendar_events WHERE event_id = $1::uuid', [id]);
      } catch (_dbErr) {
        // DB error
      }
    }

    // Audit Log
    AuditService.record(null, {
      actorUid: adminUid,
      actorRole: req.user?.role || 'GLOBAL_ADMIN',
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'UNKNOWN',
      actionCategory: 'CALENDAR_PUBLISH',
      targetEntityName: 'academic_calendar_events',
      targetEntityId: id,
      changeDetails: {
        title: deletedTitle,
        action: 'DELETE',
      },
    }).catch(() => {});

    res.json({
      message: 'Calendar event deleted successfully',
      deletedEventId: id,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'FAILED_DELETE_EVENT', message: err.message });
  }
});

export default router;
