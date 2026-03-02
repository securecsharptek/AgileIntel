// src/index.ts — Agile Intel Supademo Integration v3.0
import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Load env before other imports
import supademoRoutes from './routes/supademo.routes';
import mediaRoutes from './routes/media.routes'; // [v3.0] FFmpeg
import copilotRoutes from './routes/copilot.routes'; // [v3.0] Copilot
import { runStartupDiagnostics } from './utils/configLogger'; // [v3.0] Startup health checks
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));              // [v3.0] Increased for media
app.use(express.urlencoded({ extended: true }));

app.use('/api', supademoRoutes);
app.use('/api', mediaRoutes);                          // [v3.0]
app.use('/api', copilotRoutes);                        // [v3.0]

app.listen(PORT, async () => {
  console.log(`
  ======================================================
   Agile Intel — Supademo Integration v3.0
   Server: port ${PORT}
   Webhook:  /api/webhooks/supademo
   Media:    /api/media/*                    [v3.0]
   Copilot:  /api/copilot/*                  [v3.0]
   Health:   /api/health
  ======================================================`);

  // Run startup diagnostics (non-blocking — server is already listening)
  await runStartupDiagnostics();
});
export default app;
