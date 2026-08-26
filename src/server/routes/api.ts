import { Hono } from 'hono';
import { meetingsRouter } from './meetings.js';
import { elearningRouter } from './elearning.js';
import { lecturersRouter } from './lecturers.js';
import { assignmentsRouter } from './assignments.js';
import { telemetryRouter } from './telemetry.js';

export const apiRouter = new Hono();

// Mount Modular Sub-Routers
apiRouter.route('/', meetingsRouter);
apiRouter.route('/', elearningRouter);
apiRouter.route('/', lecturersRouter);
apiRouter.route('/', assignmentsRouter);
apiRouter.route('/', telemetryRouter);
