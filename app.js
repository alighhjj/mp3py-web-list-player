const express = require('express');
const path = require('path');
const fs = require('fs');
// const { processMusicList } = require('./music_get'); // 已移除音乐清单生成功能
const { getMusicUrl } = require('./music_api');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3100;

/**
 * 设置安全头部和缓存控制中间件
 * 添加必要的安全响应头和缓存策略以提高应用安全性和性能
 */
app.use((req, res, next) => {
  // 防止MIME类型嗅探攻击
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 防止点击劫持攻击
  res.setHeader('X-Frame-Options', 'DENY');
  
  // 启用XSS保护
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 强制使用HTTPS（仅在生产环境中启用）
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // 控制引用者信息
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 内容安全策略（允许音频和图片从外部源加载）
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https: http:; " +
    "media-src 'self' https: http: blob:; " +
    "connect-src 'self' https: http:;"
  );
  
  // 获取请求URL用于后续处理
  const url = req.url;
  
  // 设置正确的Content-Type头部
  if (url.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  } else if (url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  } else if (url.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  } else if (url.endsWith('.html') || url.endsWith('.htm')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  } else if (/\.(jpg|jpeg)$/i.test(url)) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (url.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else if (/\.(woff|woff2)$/i.test(url)) {
    res.setHeader('Content-Type', 'font/woff2');
  }
  
  // 设置缓存控制策略
  const isStaticAsset = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(url);
  const isAudioFile = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url);
  
  if (isStaticAsset) {
    // 静态资源缓存1年，使用Cache-Control而不是Expires
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (isAudioFile) {
    // 音频文件缓存1天
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else {
    // HTML页面和API响应不缓存
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  next();
});

// 设置静态文件目录
// 将 public 目录下的文件（如 CSS, JS, 图片）暴露给客户端访问
// 为静态文件添加安全头部
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    // 防止MIME类型嗅探攻击
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 防止点击劫持攻击
    res.setHeader('X-Frame-Options', 'DENY');
    // 启用XSS保护
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }
}));

// 设置音乐文件目录
// 将 music 目录下的音乐文件暴露给客户端访问
// 为音乐文件添加安全头部
app.use('/music', express.static(path.join(__dirname, 'music'), {
  setHeaders: (res, path) => {
    // 防止MIME类型嗅探攻击
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 防止点击劫持攻击
    res.setHeader('X-Frame-Options', 'DENY');
    // 启用XSS保护
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }
}));

// 设置视图引擎为 EJS
// Express 将使用 EJS 来渲染位于 views 目录下的模板文件
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 解析JSON请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// API路由：搜索歌曲
app.post('/api/search-songs', async (req, res) => {
  try {
    // 设置API响应的安全头部
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const { keyword } = req.body;
    
    if (!keyword || keyword.trim() === '') {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }
    
    console.log(`搜索歌曲请求: keyword=${keyword}`);
    
    // 创建临时搜索配置文件
    const searchConfig = {
      songs: [keyword.trim()]
    };
    
    const tempConfigPath = path.join(__dirname, 'temp_search.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(searchConfig, null, 2));
    
    // 调用music_search.js进行搜索
    const searchProcess = spawn('node', ['music_search.js', tempConfigPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    searchProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    searchProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    let isResponseSent = false;
    
    searchProcess.on('close', (code) => {
      // 清理临时文件
      try {
        fs.unlinkSync(tempConfigPath);
      } catch (err) {
        console.warn('清理临时文件失败:', err.message);
      }
      
      if (isResponseSent) {
        return; // 如果已经发送过响应，直接返回
      }
      
      isResponseSent = true;
      
      if (code === 0) {
        // 搜索成功，读取结果文件
        const searchResultPath = path.join(__dirname, 'final_list', 'search.json');
        
        if (fs.existsSync(searchResultPath)) {
          try {
            const searchResult = JSON.parse(fs.readFileSync(searchResultPath, 'utf8'));
            console.log(`搜索完成，找到 ${searchResult.totalSongs} 首歌曲`);
            res.json({
              success: true,
              message: `搜索完成，找到 ${searchResult.totalSongs} 首歌曲`,
              totalSongs: searchResult.totalSongs,
              data: searchResult
            });
          } catch (parseError) {
            console.error('解析搜索结果失败:', parseError);
            res.status(500).json({ error: '解析搜索结果失败' });
          }
        } else {
          res.status(404).json({ error: '搜索结果文件不存在' });
        }
      } else {
        console.error('搜索进程失败:', errorOutput);
        res.status(500).json({ error: '搜索失败，请稍后重试' });
      }
    });
    
    // 设置超时
    const timeoutId = setTimeout(() => {
      if (!searchProcess.killed && !isResponseSent) {
        isResponseSent = true;
        searchProcess.kill();
        res.status(408).json({ error: '搜索超时，请稍后重试' });
      }
    }, 30000); // 30秒超时
    
    // 当进程结束时清除超时定时器
    searchProcess.on('close', () => {
      clearTimeout(timeoutId);
    });
    
  } catch (error) {
    console.error('搜索歌曲失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// API路由：获取音乐播放链接
app.get('/api/music/url', async (req, res) => {
  try {
    // 设置API响应的安全头部
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const { trackId, source = 'netease', br = 320 } = req.query;
    
    if (!trackId) {
      return res.status(400).json({ error: '缺少trackId参数' });
    }
    
    console.log(`获取音乐链接请求: trackId=${trackId}, source=${source}, br=${br}`);
    
    const result = await getMusicUrl(trackId, source, br);
    
    if (result && result.url) {
      res.json(result);
    } else {
      res.status(404).json({ error: '无法获取播放链接' });
    }
  } catch (error) {
    console.error('获取音乐链接失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * API路由：代理下载音乐文件
 * 解决前端直接下载时的CORS跨域问题
 */
app.get('/api/music/download', async (req, res) => {
  try {
    const { trackId, source = 'netease', br = 320 } = req.query;
    
    if (!trackId) {
      return res.status(400).json({ error: '缺少trackId参数' });
    }
    
    console.log(`代理下载音乐请求: trackId=${trackId}, source=${source}, br=${br}`);
    
    // 首先获取音乐播放链接
    const result = await getMusicUrl(trackId, source, br);
    
    if (!result || !result.url) {
      return res.status(404).json({ error: '无法获取播放链接' });
    }
    
    const musicUrl = result.url;
    console.log(`获取到音乐链接: ${musicUrl}`);
    
    // 使用https模块代理下载音乐文件
    const https = require('https');
    const url = require('url');
    
    const urlObj = new URL(musicUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Accept': '*/*'
      },
      timeout: 30000
    };
    
    const request = https.request(options, (response) => {
      // 检查响应状态
      if (response.statusCode !== 200) {
        console.error(`下载失败，状态码: ${response.statusCode}`);
        return res.status(response.statusCode).json({ error: '下载失败' });
      }
      
      // 设置响应头，告诉浏览器这是一个音频文件
       res.setHeader('Content-Type', 'audio/mpeg');
       
       // 从查询参数中获取歌曲信息用于文件命名
       const { title, artist } = req.query;
       let filename = `music_${trackId}.mp3`;
       
       // 如果提供了歌曲标题和演唱者信息，使用更友好的文件名
       if (title && artist) {
         // 清理文件名中的非法字符
         const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '');
         const cleanArtist = artist.replace(/[<>:"/\\|?*]/g, '');
         filename = `${cleanTitle} - ${cleanArtist}.mp3`;
       }
       
       res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
       res.setHeader('Access-Control-Allow-Origin', '*');
       res.setHeader('Access-Control-Allow-Methods', 'GET');
       res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // 如果有Content-Length头，转发给客户端
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      console.log(`开始代理传输音乐文件: trackId=${trackId}`);
      
      // 将音乐数据流直接传输给客户端
      response.pipe(res);
      
      response.on('end', () => {
        console.log(`音乐文件传输完成: trackId=${trackId}`);
      });
    });
    
    request.on('error', (error) => {
      console.error('代理下载请求失败:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: '下载失败，请稍后重试' });
      }
    });
    
    request.on('timeout', () => {
      console.error('代理下载请求超时');
      request.destroy();
      if (!res.headersSent) {
        res.status(408).json({ error: '下载超时，请稍后重试' });
      }
    });
    
    request.end();
    
  } catch (error) {
    console.error('代理下载失败:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '服务器错误' });
    }
  }
});

// API路由：刷新歌单
app.post('/api/refresh-playlists', async (req, res) => {
  try {
    // 设置API响应的安全头部
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    console.log('开始刷新歌单...');
    
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');
    
    const finalListDir = path.join(__dirname, 'final_list');
    const backupDir = path.join(__dirname, 'final_list_bak');
    
    // 第一步：备份歌单文件
    console.log('正在备份歌单文件...');
    
    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // 复制所有文件到备份目录
    const files = fs.readdirSync(finalListDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const srcPath = path.join(finalListDir, file);
        const destPath = path.join(backupDir, file);
        fs.copyFileSync(srcPath, destPath);
        console.log(`备份文件: ${file}`);
      }
    }
    
    // 第二步：删除指定文件（保留costomer.json和search.json）
    console.log('正在清理旧歌单文件...');
    const filesToDelete = ['hot.json', 'new.json', 'original.json', 'soaring.json'];
    
    for (const file of filesToDelete) {
      const filePath = path.join(finalListDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`删除文件: ${file}`);
      }
    }
    
    // 第三步：运行歌单生成器
    console.log('正在生成新歌单...');
    
    const generatorPath = path.join(__dirname, 'web_list_generator.js');
    
    // 使用Promise包装子进程
    const runGenerator = () => {
      return new Promise((resolve, reject) => {
        const generatorProcess = spawn('node', [generatorPath], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        generatorProcess.stdout.on('data', (data) => {
          const message = data.toString();
          output += message;
          console.log('生成器输出:', message.trim());
        });
        
        generatorProcess.stderr.on('data', (data) => {
          const message = data.toString();
          errorOutput += message;
          console.error('生成器错误:', message.trim());
        });
        
        generatorProcess.on('close', (code) => {
          if (code === 0) {
            console.log('歌单生成完成');
            resolve({ success: true, output });
          } else {
            console.error(`生成器进程退出，代码: ${code}`);
            reject(new Error(`生成器执行失败，退出代码: ${code}\n错误输出: ${errorOutput}`));
          }
        });
        
        generatorProcess.on('error', (error) => {
          console.error('启动生成器失败:', error);
          reject(error);
        });
        
        // 设置超时（2分钟）
        setTimeout(() => {
          if (!generatorProcess.killed) {
            generatorProcess.kill();
            reject(new Error('歌单生成超时'));
          }
        }, 120000);
      });
    };
    
    // 执行生成器
    await runGenerator();
    
    console.log('歌单刷新完成');
    res.json({ 
      success: true, 
      message: '歌单刷新成功！新的歌单数据已生成。' 
    });
    
  } catch (error) {
    console.error('刷新歌单失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '刷新歌单失败: ' + error.message 
    });
  }
});

// 启动函数
async function startServer() {
  try {
    console.log('正在启动服务器...');
    
    // 直接启动服务器，不再检查或处理音乐数据
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log('音乐清单生成功能已独立，服务器仅提供播放功能');
    });
    
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();

/**
 * API路由：获取指定歌单数据
 * 根据歌单名称返回对应的歌单数据
 */
app.get('/api/playlist/:name', async (req, res) => {
  try {
    // 设置API响应的安全头部
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const playlistName = req.params.name;
    const validPlaylists = ['costomer', 'hot', 'new', 'original', 'soaring'];
    
    if (!validPlaylists.includes(playlistName)) {
      return res.status(400).json({ error: '无效的歌单名称' });
    }
    
    const playlistPath = path.join(__dirname, 'final_list', `${playlistName}.json`);
    
    // 检查歌单文件是否存在
    if (!fs.existsSync(playlistPath)) {
      return res.status(404).json({ error: '歌单文件不存在' });
    }
    
    // 读取歌单数据
    const playlistContent = fs.readFileSync(playlistPath, 'utf8');
    const playlistData = JSON.parse(playlistContent);
    
    console.log(`获取歌单: ${playlistName}, 歌曲数量: ${playlistData.songs ? playlistData.songs.length : 0}`);
    
    res.json(playlistData);
  } catch (error) {
    console.error('获取歌单失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 读取音乐数据 - 修改为默认加载用户歌单
app.get('/', async (req, res) => {
  try {
    // 默认加载用户歌单数据
    const classicPlaylistPath = path.join(__dirname, 'final_list', 'costomer.json');
    
    // 检查用户歌单文件是否存在
    if (!fs.existsSync(classicPlaylistPath)) {
      return res.status(500).send('用户歌单数据文件不存在');
    }
    
    // 读取用户歌单数据
    const classicPlaylistContent = fs.readFileSync(classicPlaylistPath, 'utf8');
    const classicPlaylistData = JSON.parse(classicPlaylistContent);
    
    res.render('index', { 
      title: '音乐播放器', 
      songs: classicPlaylistData.songs || [],
      currentPlaylist: 'costomer'
    });
  } catch (error) {
    console.error('读取用户歌单数据失败:', error);
    res.status(500).send('服务器错误');
  }
});