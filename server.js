const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://hlomoto110_db_user:BWZQu4H2F6Lqgmfq@lionautobet.xl7iyuw.mongodb.net/lionbot?retryWrites=true&w=majority&appName=LionAutoBet";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "LION_ADMIN_2026";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected to LionAutoBet Cluster!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  user_id: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  pass: { type: String, required: true },
  ip: String,
  deviceId: String,
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: "global", unique: true },
  force_off: { type: Boolean, default: false },
  broadcast_msg: { type: String, default: "Welcome to LION AUTO BOT! Contact @lion_fi for activation." },
  version: { type: Number, default: 10 },
  release_notes: { type: String, default: "" },
  update_script: { type: String, default: "" },
  force_update: { type: Boolean, default: false },
  update_repeat: { type: Number, default: 1 }
});
const Settings = mongoose.model('Settings', settingsSchema);

async function ensureDefaultSettings() {
  const exists = await Settings.findOne({ key: "global" });
  if (!exists) await Settings.create({ key: "global" });
}
ensureDefaultSettings();

app.get('/', (req, res) => {
  res.send("🦁 LION AUTO BOT MongoDB API v2.0 is Running!");
});

app.all('/api', async (req, res) => {
  const action = req.query.action;

  try {
    // 1. REGISTER
    if (action === 'register' && req.method === 'POST') {
      const { email, phone, pass, ip, deviceId } = req.body;
      const existing = await User.findOne({ $or: [{ email }, { phone }] });
      if (existing) {
        return res.json({ status: 'error', message: 'Email or Phone already registered!' });
      }
      const newUser = await User.create({
        user_id: phone,
        email,
        phone,
        pass,
        ip,
        deviceId,
        approved: false
      });
      return res.json({ status: 'success', user: newUser });
    }

    // 2. LOGIN (Supports SHA-256 & Legacy Plain Text)
    if (action === 'login' && req.method === 'POST') {
      const { user, pass } = req.body;
      const foundUser = await User.findOne({
        $or: [{ email: user }, { phone: user }, { user_id: user }]
      });
      if (!foundUser) {
        return res.json({ status: 'error', message: 'Account not found!' });
      }
      const shaPass = crypto.createHash('sha256').update(String(foundUser.pass)).digest('hex');
      if (foundUser.pass !== pass && shaPass !== pass) {
        return res.json({ status: 'error', message: 'Incorrect Password!' });
      }
      return res.json({
        status: 'success',
        user: { user_id: foundUser.user_id, email: foundUser.email, phone: foundUser.phone }
      });
    }

    // 3. CHECK APPROVAL
    if (action === 'check_approval') {
      const userId = req.query.userId;
      const foundUser = await User.findOne({
        $or: [{ email: userId }, { phone: userId }, { user_id: userId }]
      });
      return res.json({
        status: 'success',
        approved: foundUser ? foundUser.approved : false
      });
    }

    // 4. GET GLOBAL SETTINGS
    if (action === 'get_settings') {
      const cfg = await Settings.findOne({ key: "global" });
      return res.json(cfg || {});
    }

    // --- ADMIN ROUTES ---
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (action && action.startsWith('admin_')) {
      if (adminKey !== ADMIN_SECRET) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized Admin Key!' });
      }

      if (action === 'admin_dashboard') {
        const users = await User.find().sort({ createdAt: -1 });
        const settings = await Settings.findOne({ key: "global" });
        return res.json({ status: 'success', users, settings });
      }

      if (action === 'admin_toggle_user' && req.method === 'POST') {
        const { id, approved } = req.body;
        await User.findByIdAndUpdate(id, { approved });
        return res.json({ status: 'success' });
      }

      if (action === 'admin_bulk_approve' && req.method === 'POST') {
        const { approved } = req.body;
        await User.updateMany({}, { approved });
        return res.json({ status: 'success' });
      }

      if (action === 'admin_reset_password' && req.method === 'POST') {
        const { id, newPass } = req.body;
        const hashed = crypto.createHash('sha256').update(String(newPass)).digest('hex');
        await User.findByIdAndUpdate(id, { pass: hashed });
        return res.json({ status: 'success' });
      }

      if (action === 'admin_reset_device' && req.method === 'POST') {
        const { id } = req.body;
        await User.findByIdAndUpdate(id, { deviceId: 'RESET_BY_ADMIN', ip: '0.0.0.0' });
        return res.json({ status: 'success' });
      }

      if (action === 'admin_delete_user' && req.method === 'POST') {
        const { id } = req.body;
        await User.findByIdAndDelete(id);
        return res.json({ status: 'success' });
      }

      if (action === 'admin_update_settings' && req.method === 'POST') {
        const {
          broadcast_msg,
          force_off,
          version,
          release_notes,
          update_script,
          force_update,
          update_repeat,
          max_prompts
        } = req.body;

        const repeatLimit = Math.max(1, parseInt(update_repeat || max_prompts || 1, 10));

        await Settings.findOneAndUpdate(
          { key: "global" },
          {
            broadcast_msg,
            force_off,
            version,
            release_notes,
            update_script,
            force_update,
            update_repeat: repeatLimit
          },
          { upsert: true }
        );
        return res.json({ status: 'success' });
      }
    }

    return res.json({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    return res.json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
