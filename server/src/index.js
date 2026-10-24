import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from './config.js';
import { sql } from './db.js';
import { issueToken, requireAuth } from './auth.js';
import { runHermes } from './hermes.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: [config.APP_ORIGIN, config.PUBLIC_APP_ORIGIN], methods: ['GET','POST'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', async (_req,res) => {
  try { await sql`SELECT 1`; res.json({ ok:true, database:'connected', hermesConfigured:config.HERMES_ENABLED }); }
  catch { res.status(503).json({ ok:false, database:'unavailable' }); }
});

const loginSchema = z.object({ email:z.string().email().max(254), password:z.string().min(1).max(200) });
async function login(req,res,scope) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Valid email and password are required.' });
  const email = parsed.data.email.toLowerCase();
  const rows = await sql`SELECT id, email, password_hash, scope FROM app_users WHERE lower(email)=${email} AND scope=${scope} LIMIT 1`;
  if (!rows.length || !(await bcrypt.compare(parsed.data.password, rows[0].password_hash))) return res.status(401).json({ error:'Invalid credentials.' });
  const user = { id:rows[0].id, email:rows[0].email, scope:rows[0].scope };
  await sql`INSERT INTO audit_events (user_id, scope, event_type, details) VALUES (${user.id}, ${scope}, 'login', ${JSON.stringify({ channel:scope })}::jsonb)`;
  return res.json({ token:issueToken(user), user:{ id:user.id, email:user.email, scope:user.scope } });
}
app.post('/api/founder/login', (req,res,next) => login(req,res,'founder').catch(next));
app.post('/api/public/register', async (req,res,next) => {
  try {
    const parsed = z.object({ email:z.string().email().max(254), password:z.string().min(12).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error:'Use a valid email and a password with at least 12 characters.' });
    const email = parsed.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const rows = await sql`INSERT INTO app_users (email,password_hash,scope) VALUES (${email},${passwordHash},'public') ON CONFLICT (email) DO NOTHING RETURNING id,email,scope`;
    if (!rows.length) return res.status(409).json({ error:'An account with this email already exists.' });
    const user = rows[0];
    await sql`INSERT INTO audit_events (user_id,scope,event_type,details) VALUES (${user.id},'public','signup','{}'::jsonb)`;
    res.status(201).json({ token:issueToken(user), user });
  } catch(e) { next(e); }
});
app.post('/api/public/login', (req,res,next) => login(req,res,'public').catch(next));
app.get('/api/founder/me', requireAuth('founder'), (req,res) => res.json({ user:req.auth }));
app.get('/api/public/me', requireAuth('public'), (req,res) => res.json({ user:req.auth }));

const taskSchema = z.object({ title:z.string().trim().min(3).max(180), department:z.enum(['Research','Development','Media Studio','Growth & Sales','Finance','Quality']), description:z.string().trim().min(3).max(12000) });
async function createTask(req,res,scope) {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid task. Check title, department and description.' });
  const {title,department,description}=parsed.data;
  const rows = await sql`INSERT INTO agent_tasks (owner_id,scope,title,department,description,status) VALUES (${req.auth.id},${scope},${title},${department},${description},'needs_approval') RETURNING id,title,department,description,status,created_at`;
  const task=rows[0];
  await sql`INSERT INTO audit_events (user_id,scope,task_id,event_type,details) VALUES (${req.auth.id},${scope},${task.id},'task_created',${JSON.stringify({ department })}::jsonb)`;
  return res.status(201).json({ task });
}
app.post('/api/founder/tasks', requireAuth('founder'), (req,res,next) => createTask(req,res,'founder').catch(next));
app.post('/api/public/tasks', requireAuth('public'), (req,res,next) => createTask(req,res,'public').catch(next));
async function listTasks(req,res,scope) {
  const rows=await sql`SELECT id,title,department,description,status,result,error,created_at,updated_at FROM agent_tasks WHERE owner_id=${req.auth.id} AND scope=${scope} ORDER BY created_at DESC LIMIT 100`;
  res.json({ tasks:rows });
}
app.get('/api/founder/tasks', requireAuth('founder'), (req,res,next) => listTasks(req,res,'founder').catch(next));
app.get('/api/public/tasks', requireAuth('public'), (req,res,next) => listTasks(req,res,'public').catch(next));

async function approveTask(req,res,scope) {
  const rows=await sql`UPDATE agent_tasks SET status='approved', updated_at=now() WHERE id=${req.params.id} AND owner_id=${req.auth.id} AND scope=${scope} AND status='needs_approval' RETURNING id,status`;
  if (!rows.length) return res.status(404).json({ error:'Task not found or it is not awaiting approval.' });
  await sql`INSERT INTO audit_events (user_id,scope,task_id,event_type,details) VALUES (${req.auth.id},${scope},${req.params.id},'task_approved','{}'::jsonb)`;
  res.json({ task:rows[0] });
}
app.post('/api/founder/tasks/:id/approve', requireAuth('founder'), (req,res,next) => approveTask(req,res,'founder').catch(next));
app.post('/api/public/tasks/:id/approve', requireAuth('public'), (req,res,next) => approveTask(req,res,'public').catch(next));

async function executeTask(req,res,scope) {
  if (!config.HERMES_ENABLED) return res.status(503).json({ error:'Hermes is not enabled yet. Configure and verify it first; no task was run.' });
  if (scope==='public' && !config.PUBLIC_AGENT_EXECUTION_ENABLED) return res.status(403).json({ error:'Public agent execution is disabled by the platform administrator.' });
  const rows=await sql`UPDATE agent_tasks SET status='in_progress', updated_at=now() WHERE id=${req.params.id} AND owner_id=${req.auth.id} AND scope=${scope} AND status='approved' RETURNING id,title,department,description`;
  if (!rows.length) return res.status(409).json({ error:'Only a task approved by its owner can execute.' });
  const task=rows[0];
  await sql`INSERT INTO audit_events (user_id,scope,task_id,event_type,details) VALUES (${req.auth.id},${scope},${task.id},'execution_started',${JSON.stringify({ engine:'hermes' })}::jsonb)`;
  res.status(202).json({ taskId:task.id, status:'in_progress', message:'Task accepted. Check task history for the result.' });
  runHermes({ title:task.title, description:task.description, department:task.department, scope })
    .then(async result => {
      await sql`UPDATE agent_tasks SET status='completed', result=${result}, error=NULL, updated_at=now() WHERE id=${task.id} AND owner_id=${req.auth.id} AND scope=${scope}`;
      await sql`INSERT INTO audit_events (user_id,scope,task_id,event_type,details) VALUES (${req.auth.id},${scope},${task.id},'execution_completed',${JSON.stringify({ engine:'hermes' })}::jsonb)`;
    })
    .catch(async error => {
      const message=String(error?.message || 'Unknown agent error').slice(0,3000);
      await sql`UPDATE agent_tasks SET status='failed', error=${message}, updated_at=now() WHERE id=${task.id} AND owner_id=${req.auth.id} AND scope=${scope}`;
      await sql`INSERT INTO audit_events (user_id,scope,task_id,event_type,details) VALUES (${req.auth.id},${scope},${task.id},'execution_failed',${JSON.stringify({ message })}::jsonb)`;
    });
}
app.post('/api/founder/tasks/:id/execute', requireAuth('founder'), (req,res,next) => executeTask(req,res,'founder').catch(next));
app.post('/api/public/tasks/:id/execute', requireAuth('public'), (req,res,next) => executeTask(req,res,'public').catch(next));

app.use((err,_req,res,_next) => { console.error(err); if (!res.headersSent) res.status(500).json({ error:'Unexpected server error.' }); });
app.listen(config.PORT, () => console.log(`TENVORIA API listening on port ${config.PORT}`));
