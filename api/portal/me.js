import { handle, send, httpError } from '../_lib/http.js';
import { requireUser } from '../_lib/auth.js';

// Client portal: everything is read as the client, so RLS limits it to their own rows.
export default handle(['GET'], async (req, res) => {
  const { db, clientId } = await requireUser(req, ['client']);
  if (!clientId) throw httpError(404, 'no_client_linked');
  const [client, projects, invoices, files] = await Promise.all([
    db.from('clients').select('id, name').eq('id', clientId).single(),
    db.from('projects').select('id, name, status, progress, notes').order('created_at', { ascending: false }),
    db.from('invoices').select('id, number, amount_cents, currency, status, due_date').order('created_at', { ascending: false }),
    db.from('client_files').select('id, name, storage_path, project_id').order('created_at', { ascending: false }),
  ]);
  for (const r of [client, projects, invoices, files]) if (r.error) throw r.error;
  const signed = await Promise.all(files.data.map(async (f) => {
    const { data } = await db.storage.from('client-files').createSignedUrl(f.storage_path, 300);
    return { id: f.id, name: f.name, project_id: f.project_id, url: data?.signedUrl ?? null };
  }));
  send(res, 200, { client: client.data, projects: projects.data, invoices: invoices.data, files: signed });
});
