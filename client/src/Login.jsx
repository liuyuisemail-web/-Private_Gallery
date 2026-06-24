import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from './api';

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fn = isRegister ? api.register : api.login;
      const data = await fn(username, password);
      setToken(data.token);
      onLogin(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">🖼️</div>
          <h1>私人图库</h1>
          <p>上传图片，生成专属分享链接</p>
        </div>
        <form onSubmit={handleSubmit}>
          <h2>{isRegister ? '注册账号' : '登录'}</h2>
          {error && <div className="error-msg">{error}</div>}
          <div className="input-group">
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>
          <p className="toggle-text">
            {isRegister ? '已有账号？' : '没有账号？'}
            <button
              type="button"
              className="link-btn"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
            >
              {isRegister ? '去登录' : '去注册'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
