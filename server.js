const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║          🛡️  WhistleGuard API Server                ║
  ║──────────────────────────────────────────────────────║
  ║  Server:     http://localhost:${PORT}                  ║
  ║  Swagger:    http://localhost:${PORT}/api-docs          ║
  ║  Health:     http://localhost:${PORT}/api/health        ║
  ║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(39)}║
  ╚══════════════════════════════════════════════════════╝
  `);
});
