export default function handler(req, res) {
  res.setHeader('cache-control','no-store');
  res.status(200).json({ ok: true, service: 'master-task-manager', version: '1.0.1', time: new Date().toISOString() });
}
