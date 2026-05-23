require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/products',     require('./routes/products'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/inventory',    require('./routes/inventory'));

app.get('/inventory', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inventory.html')));
app.get('/reports',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'reports.html')));
app.get('/settings',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('*',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ██╗██╗██╗     ███╗   ███╗ █████╗ ██████╗ ████████╗`);
  console.log(`  ██║██║██║     ████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝`);
  console.log(`  ██║██║██║     ██╔████╔██║███████║██████╔╝   ██║   `);
  console.log(`  ██║██║██║     ██║╚██╔╝██║██╔══██║██╔══██╗   ██║   `);
  console.log(`  ██║██║███████╗██║ ╚═╝ ██║██║  ██║██║  ██║   ██║   `);
  console.log(`  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   `);
  console.log(`\n  🟢 JilMart POS System running at http://localhost:${PORT}`);
  console.log(`  📦 Database: SQLite (jilmart.db)`);
  console.log(`  🔑 Default admin PIN: 1234\n`);
});
