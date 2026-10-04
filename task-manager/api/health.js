export default function handler(req, res) {
  res.setHeader('cache-control','no-store');
  res.status(200).json({ ok: true, service: 'master-task-manager', time: new Date().toISOString() });
}
