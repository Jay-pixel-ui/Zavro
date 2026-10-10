import { Resend } from 'resend';
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendLeadEmails(lead) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.MAIL_FROM;
  const jobs = [];
  if (process.env.NOTIFY_EMAIL) jobs.push(resend.emails.send({
    from, to: process.env.NOTIFY_EMAIL, replyTo: lead.email,
    subject: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    html: `<p><b>${esc(lead.name)}</b> &lt;${esc(lead.email)}&gt; ${esc(lead.phone)}</p><p>${esc(lead.company)}</p><p>${esc(lead.message)}</p>`,
  }));
  jobs.push(resend.emails.send({
    from, to: lead.email, subject: 'Thanks for contacting Zavro Solutions',
    html: `<p>Hi ${esc(lead.name)},</p><p>Thanks for reaching out. We got your message and will reply shortly.</p><p>Zavro Solutions</p>`,
  }));
  await Promise.allSettled(jobs);
}
