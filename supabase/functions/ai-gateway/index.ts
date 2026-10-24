// Secure AI gateway scaffold. Deploy as a Supabase Edge Function.
// Current mode is deliberately demo-only: it never calls an external model or spends money.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Sign-in required.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete.' }, 500);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(url, serviceKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Invalid session.' }, 401);

  let body: { taskId?: string; prompt?: string; capability?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body.taskId || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return json({ error: 'taskId and a non-empty prompt are required.' }, 400);
  }
  if (body.prompt.length > 12000) return json({ error: 'Prompt too long (max 12000 characters).' }, 413);

  const { data: task, error: taskError } = await adminClient.from('company_tasks')
    .select('id,owner_id,title,status,estimated_cost_eur,approved_cost_eur')
    .eq('id', body.taskId).eq('owner_id', authData.user.id).maybeSingle();
  if (taskError) return json({ error: 'Could not validate task.' }, 500);
  if (!task) return json({ error: 'Task not found for this account.' }, 404);
  if (!['Approved', 'In progress'].includes(task.status)) {
    return json({ error: 'Founder approval is required before execution.' }, 403);
  }

  // This initial implementation is intentionally a no-cost stub.
  // Future provider adapters must check budget_policies and provider billing mode here,
  // and reject paid calls unless allow_paid_calls=true and limits have been approved.
  const output = `DEMO MODE — no external AI model was called and no money was spent.\n\nTask: ${task.title}\nCapability: ${body.capability ?? 'text'}\n\nPrompt received:\n${body.prompt}\n\nNext: attach an approved provider adapter to the server-side gateway.`;
  await adminClient.from('audit_events').insert({
    owner_id: authData.user.id,
    task_id: task.id,
    event_type: 'ai_gateway_demo_response',
    actor: 'system',
    details: { capability: body.capability ?? 'text', provider: 'demo', estimated_cost_eur: 0 },
  });
  return json({ providerId: 'demo-text', output, estimatedCostEUR: 0, demo: true });
});
