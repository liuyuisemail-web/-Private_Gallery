import { useState, useEffect, useRef, useCallback } from 'react';
import { api, imageUrl } from './api';

export default function Gallery({ user, onLogout }) {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [shareInfo, setShareInfo] = useState(null);
  const [copied, setCopied] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const loadImages = useCallback(async () => {
    try {
      const data = await api.getImages();
      setImages(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadImage(file);
      await loadImages();
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这张图片吗？')) return;
    try {
      await api.deleteImage(id);
      setImages(images.filter((img) => img.id !== id));
      if (preview?.id === id) setPreview(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const copyUrl = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="gallery-page">
      {/* 顶部栏 */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo-icon">🖼️</span>
          <span className="logo-text">私人图库</span>
        </div>
        <div className="topbar-right">
          <span className="user-name">👤 {user.username}</span>
          <button className="btn-logout" onClick={onLogout}>退出</button>
        </div>
      </header>

      <div className="gallery-body">
        {/* 上传区域 */}
        <div
          ref={dropRef}
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
          />
          {uploading ? (
            <div className="uploading">
              <div className="spinner" />
              <span>正在上传...</span>
            </div>
          ) : (
            <>
              <div className="upload-icon">📤</div>
              <p>拖拽图片到此处或点击上传</p>
              <span className="upload-hint">支持 JPG / PNG / GIF / WebP / SVG，单张最大 10MB</span>
            </>
          )}
        </div>

        {/* 分享弹窗 */}
        {shareInfo && (
          <div className="modal-overlay" onClick={() => setShareInfo(null)}>
            <div className="modal-card share-modal" onClick={(e) => e.stopPropagation()}>
              <h3>🔗 图片分享链接</h3>
              <div className="share-url-box">
                <input type="text" value={shareInfo.shareUrl} readOnly />
                <button
                  className="btn-copy"
                  onClick={() => copyUrl(shareInfo.shareUrl, 'modal')}
                >
                  {copied === 'modal' ? '✅ 已复制' : '📋 复制'}
                </button>
              </div>
              <p className="share-tip">任何拥有此链接的人都可以查看该图片</p>
              <button className="btn-close" onClick={() => setShareInfo(null)}>关闭</button>
            </div>
          </div>
        )}

        {/* 大图预览 */}
        {preview && (
          <div className="modal-overlay" onClick={() => setPreview(null)}>
            <div className="modal-card preview-modal" onClick={(e) => e.stopPropagation()}>
              <img
                src={imageUrl(preview.id)}
                alt={preview.original_name}
              />
              <div className="preview-info">
                <span className="preview-name">{preview.original_name}</span>
                <span className="preview-size">{formatSize(preview.size)}</span>
                <span className="preview-date">{formatDate(preview.created_at)}</span>
              </div>
              <div className="preview-actions">
                <button
                  className="btn-share"
                  onClick={() => { setPreview(null); setShareInfo(preview); }}
                >
                  🔗 复制分享链接
                </button>
                <button
                  className="btn-copy"
                  onClick={() => copyUrl(preview.shareUrl, preview.id)}
                >
                  {copied === preview.id ? '✅ 已复制' : '📋 复制URL'}
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(preview.id)}
                >
                  🗑️ 删除
                </button>
              </div>
              <button className="modal-close-btn" onClick={() => setPreview(null)}>✕</button>
            </div>
          </div>
        )}

        {/* 图片网格 */}
        {images.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📷</div>
            <p>还没有图片，上传第一张吧</p>
          </div>
        ) : (
          <div className="image-grid">
            {images.map((img) => (
              <div key={img.id} className="image-card" onClick={() => setPreview(img)}>
                <div className="image-card-img">
                  <img
                    src={imageUrl(img.id)}
                    alt={img.original_name}
                    loading="lazy"
                  />
                </div>
                <div className="image-card-info">
                  <span className="card-name" title={img.original_name}>{img.original_name}</span>
                  <span className="card-size">{formatSize(img.size)}</span>
                </div>
                <div className="image-card-actions">
                  <button
                    className="btn-icon"
                    title="复制分享链接"
                    onClick={(e) => { e.stopPropagation(); copyUrl(img.shareUrl, img.id); }}
                  >
                    {copied === img.id ? '✅' : '🔗'}
                  </button>
                  <button
                    className="btn-icon"
                    title="删除"
                    onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
