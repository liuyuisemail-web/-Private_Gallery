import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db from './db.js';
import { generateToken, authMiddleware, JWT_SECRET } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
app.set('trust proxy', true);

function getBaseUrl(req) {
  const proto = req.get('X-Forwarded-Proto') || 'https';
  return `${proto}://${req.get('host')}`;
}

app.use(cors());
app.use(express.json());

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer 配置
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，仅支持 JPG/PNG/GIF/WebP/SVG/BMP'));
    }
  }
});

// ============ 认证路由 ============

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '密码至少4位' });
  }
  try {
    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
    const token = generateToken({ id: result.lastInsertRowid, username });
    res.json({ token, user: { id: result.lastInsertRowid, username } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// 获取当前用户
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ============ 图片路由 ============

// 上传图片
app.post('/api/images', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片文件' });
  }
  const shareId = uuidv4().replace(/-/g, '').substring(0, 12);
  const result = db.prepare(
    'INSERT INTO images (user_id, filename, original_name, share_id, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, req.file.filename, req.file.originalname, shareId, req.file.mimetype, req.file.size);

  const baseUrl = getBaseUrl(req);
  res.json({
    id: result.lastInsertRowid,
    shareId,
    shareUrl: `${baseUrl}/s/${shareId}`,
    originalName: req.file.originalname,
    size: req.file.size,
    createdAt: new Date().toISOString()
  });
});

// 获取当前用户的图片列表
app.get('/api/images', authMiddleware, (req, res) => {
  const images = db.prepare(
    'SELECT id, original_name, share_id, mime_type, size, created_at FROM images WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  const baseUrl = getBaseUrl(req);
  res.json(images.map(img => ({
    ...img,
    shareUrl: `${baseUrl}/s/${img.share_id}`,
    thumbnailUrl: `${baseUrl}/api/images/${img.id}/file`
  })));
});

// 获取图片文件（缩略图/原图）— 支持 Header 和 query token
app.get('/api/images/:id/file', (req, res, next) => {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '未登录' });
  }
}, (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!image) {
    return res.status(404).json({ error: '图片不存在' });
  }
  const filePath = path.join(uploadsDir, image.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  res.setHeader('Content-Type', image.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
});

// 删除图片
app.delete('/api/images/:id', authMiddleware, (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!image) {
    return res.status(404).json({ error: '图片不存在' });
  }
  const filePath = path.join(uploadsDir, image.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ 公开分享路由 ============

// 通过 shareId 访问分享图片
app.get('/s/:shareId', (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE share_id = ?').get(req.params.shareId);
  if (!image) {
    return res.status(404).send('图片不存在或已被删除');
  }
  const filePath = path.join(uploadsDir, image.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('文件不存在');
  }
  const ext = path.extname(image.original_name);
  res.setHeader('Content-Type', image.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${image.share_id}${ext}"`);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(filePath).pipe(res);
});

// 获取分享图片信息
app.get('/s/:shareId/info', (req, res) => {
  const image = db.prepare('SELECT original_name, mime_type, size, created_at FROM images WHERE share_id = ?').get(req.params.shareId);
  if (!image) {
    return res.status(404).json({ error: '图片不存在' });
  }
  res.json(image);
});

// 错误处理中间件
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '图片大小不能超过 10MB' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`图库服务已启动: http://localhost:${PORT}`);
});
