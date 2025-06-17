// 全局变量声明
let audio;
let playPauseBtn;
let backwardBtn;
let forwardBtn;
let songItems;
let currentSongIndex = 0;
let playlist = [];
let isLoadingSong = false;

// 全局变量声明
let urlMode = 'from_api'; // 默认使用API模式
let progressBarContainer;
let seekThumb;
let isDragging = false;

// iOS 媒体会话修复实例
let iosMediaSessionFix = null;

// 预加载管理器
class PreloadManager {
    constructor() {
        this.cache = new Map(); // 存储预加载的URL
        this.preloadingTasks = new Set(); // 正在预加载的任务
        this.maxCacheSize = 3; // 最大缓存数量
        console.log('🎵 PreloadManager: 预加载管理器已初始化');
    }

    /**
     * 预加载歌曲URL
     * @param {Object} song - 歌曲对象
     * @param {number} index - 歌曲索引
     * @returns {Promise<string|null>} 预加载的URL
     */
    async preloadSong(song, index) {
        const cacheKey = `${song.trackId}_${song.source}`;
        
        // 如果已经缓存，直接返回
        if (this.cache.has(cacheKey)) {
            console.log(`🎵 PreloadManager: 使用缓存的URL - ${song.title}`);
            return this.cache.get(cacheKey);
        }
        
        // 如果正在预加载，避免重复请求
        if (this.preloadingTasks.has(cacheKey)) {
            console.log(`🎵 PreloadManager: 正在预加载中，跳过重复请求 - ${song.title}`);
            return null;
        }
        
        // 检查是否需要清理缓存
        this.cleanupCache();
        
        try {
            this.preloadingTasks.add(cacheKey);
            console.log(`🎵 PreloadManager: 开始预加载 - ${song.title}`);
            
            let url = null;
            
            // 根据URL模式选择获取方式
            if (urlMode === 'from_list' && song.src) {
                url = song.src;
                console.log(`🎵 PreloadManager: 使用列表模式预加载 - ${song.title}`);
            } else if (song.trackId && song.source) {
                // 添加随机延迟，避免频繁请求API
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
                url = await getRealTimeMusicUrl(song.trackId, song.source, 320);
                console.log(`🎵 PreloadManager: 使用API模式预加载 - ${song.title}`);
            }
            
            if (url) {
                this.cache.set(cacheKey, url);
                console.log(`🎵 PreloadManager: 预加载成功 - ${song.title}`);
                return url;
            } else {
                console.warn(`🎵 PreloadManager: 预加载失败，无法获取URL - ${song.title}`);
                return null;
            }
        } catch (error) {
            console.error(`🎵 PreloadManager: 预加载出错 - ${song.title}:`, error);
            return null;
        } finally {
            this.preloadingTasks.delete(cacheKey);
        }
    }
    
    /**
     * 获取缓存的URL
     * @param {Object} song - 歌曲对象
     * @returns {string|null} 缓存的URL
     */
    getCachedUrl(song) {
        const cacheKey = `${song.trackId}_${song.source}`;
        const url = this.cache.get(cacheKey);
        if (url) {
            console.log(`🎵 PreloadManager: 命中缓存 - ${song.title}`);
        }
        return url;
    }
    
    /**
     * 清理缓存，保持缓存大小在限制内
     */
    cleanupCache() {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`🎵 PreloadManager: 清理缓存，删除最旧的条目`);
        }
    }
    
    /**
     * 清空所有缓存
     */
    clearCache() {
        this.cache.clear();
        this.preloadingTasks.clear();
        console.log(`🎵 PreloadManager: 清空所有缓存`);
    }
}

// 创建预加载管理器实例
const preloadManager = new PreloadManager();

/**
 * 加载歌曲
 * @param {number} index - 歌曲在播放列表中的索引
 */
async function loadSong(index) {
    if (isLoadingSong) {
        console.log('正在加载歌曲，请稍候...');
        return;
    }
    
    isLoadingSong = true;
    const song = playlist[index];
    
    try {
        // 先暂停当前播放，避免播放请求冲突
        audio.pause();
        // 重置播放按钮状态
        playPauseBtn.classList.remove('fa-pause');
        playPauseBtn.classList.add('fa-play');
        
        // 更新UI显示
        updateSongUI(song, index);
        
        let audioUrl = '';
        
        // 首先尝试从预加载缓存获取URL
        const cachedUrl = preloadManager.getCachedUrl(song);
        if (cachedUrl) {
            audioUrl = cachedUrl;
            console.log('🎵 LoadSong: 使用预加载的URL:', song.title);
        } else {
            // 根据URL模式选择获取方式
            if (urlMode === 'from_list') {
                // 从列表中直接获取src
                audioUrl = song.src;
                console.log('使用列表模式获取音频URL:', song.title, audioUrl);
                
                if (!audioUrl) {
                    console.warn('列表中没有找到有效的音频URL，尝试切换到API模式');
                    // 如果列表中没有URL，回退到API模式
                    if (song.trackId) {
                        audioUrl = await getRealTimeMusicUrl(song.trackId, song.source, 320);
                    }
                }
            } else {
                // 使用API模式实时获取
                if (!song.trackId) {
                    console.error('歌曲缺少trackId，无法获取播放链接:', song.title);
                    return;
                }
                
                console.log('使用API模式实时获取播放链接:', song.title);
                audioUrl = await getRealTimeMusicUrl(song.trackId, song.source, 320);
            }
        }
        
        if (audioUrl) {
            // 更新歌曲的播放链接
            song.src = audioUrl;
            playlist[index].src = audioUrl;
            
            // 设置新的音频源
            audio.src = song.src;
            
            // 添加音频加载错误处理
            audio.addEventListener('error', function handleAudioError(e) {
                console.error('音频加载失败:', song.title, e);
                console.error('错误详情:', e.target.error);
                
                // 检查是否是403错误或网络错误
                if (e.target.error && (e.target.error.code === 4 || e.target.error.message.includes('403'))) {
                    console.warn('检测到403错误，可能是链接失效或访问受限，尝试重新获取');
                    // 如果是from_list模式且出错，尝试用API模式重新获取
                    if (urlMode === 'from_list' && song.trackId) {
                        console.log('列表模式播放失败，尝试API模式重新获取');
                        refreshMusicUrl(song, index);
                    } else {
                        // 尝试重新获取链接
                        refreshMusicUrl(song, index);
                    }
                }
                
                // 移除事件监听器避免重复触发
                audio.removeEventListener('error', handleAudioError);
            }, { once: true });
            
            console.log('歌曲加载完成:', song.title);
            
            // 触发预加载下一首歌曲
            triggerPreloadNext(index);
        } else {
            console.error('无法获取有效的播放链接:', song.title);
        }
        
    } catch (error) {
        console.error('加载歌曲失败:', song.title, error);
    } finally {
        isLoadingSong = false;
    }
}

/**
 * 触发预加载下一首歌曲
 * @param {number} currentIndex - 当前歌曲索引
 */
function triggerPreloadNext(currentIndex) {
    // 计算下一首歌曲的索引
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextSong = playlist[nextIndex];
    
    if (nextSong) {
        console.log(`🎵 Preload: 准备预加载下一首歌曲 - ${nextSong.title}`);
        
        // 异步预加载，不阻塞当前播放
        setTimeout(() => {
            preloadManager.preloadSong(nextSong, nextIndex).catch(error => {
                console.warn(`🎵 Preload: 预加载下一首歌曲失败 - ${nextSong.title}:`, error);
            });
        }, 1000); // 延迟1秒开始预加载，避免影响当前歌曲的播放
    }
}

// 防止重复调用refreshMusicUrl的标志
let isRefreshingUrl = false;

/**
 * 重新获取音乐播放链接
 * @param {Object} song - 歌曲对象
 * @param {number} index - 歌曲索引
 */
async function refreshMusicUrl(song, index) {
    if (!song.trackId || !song.source) {
        console.error('缺少trackId或source信息，无法重新获取链接:', song.title);
        return;
    }
    
    // 防止重复调用
    if (isRefreshingUrl) {
        console.log('正在重新获取链接中，跳过重复请求:', song.title);
        return;
    }
    
    isRefreshingUrl = true;
    
    try {
        console.log('正在重新获取播放链接:', song.title);
        
        // 添加随机延迟，避免频繁请求
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
        
        const url = await getRealTimeMusicUrl(song.trackId, song.source, 320);
        
        if (url) {
            // 更新歌曲的播放链接
            song.src = url;
            playlist[index].src = url;
            
            // 同时更新DOM中的数据
            const songItem = document.querySelectorAll('.song-item')[index];
            if (songItem) {
                songItem.dataset.src = url;
            }
            
            console.log('播放链接更新成功:', song.title);
            
            // 重新设置音频源
            audio.src = song.src;
            
            // 如果这是当前选中的歌曲，等待音频加载完成后再播放
            if (index === currentSongIndex) {
                // 添加加载完成事件监听
                const handleCanPlay = () => {
                    audio.removeEventListener('canplay', handleCanPlay);
                    audio.removeEventListener('error', handleLoadError);
                    
                    audio.play().then(() => {
                        playPauseBtn.classList.remove('fa-play');
                        playPauseBtn.classList.add('fa-pause');
                        console.log('重新获取链接后播放成功:', song.title);
                    }).catch(error => {
                        console.error('重新获取链接后播放失败:', error);
                    });
                };
                
                // 添加错误处理
                const handleLoadError = (e) => {
                    audio.removeEventListener('canplay', handleCanPlay);
                    audio.removeEventListener('error', handleLoadError);
                    console.error('音频加载失败:', e);
                };
                
                audio.addEventListener('canplay', handleCanPlay);
                audio.addEventListener('error', handleLoadError);
                
                // 添加超时保护，避免无限等待
                setTimeout(() => {
                    audio.removeEventListener('canplay', handleCanPlay);
                    audio.removeEventListener('error', handleLoadError);
                    console.warn('音频加载超时，取消播放尝试');
                }, 10000);
            }
        } else {
            console.error('无法获取有效的播放链接:', song.title);
        }
    } catch (error) {
        console.error('重新获取播放链接失败:', error);
    } finally {
        // 重置标志，允许后续调用
        isRefreshingUrl = false;
    }
}

/**
 * 更新歌曲UI显示
 * @param {Object} song - 歌曲对象
 * @param {number} index - 歌曲索引
 */
function updateSongUI(song, index) {
    // 移除所有歌曲项的 active 类
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    // 为当前歌曲项添加 active 类 - 使用一致的选择器
    const currentSongItems = document.querySelectorAll('.song-item');
    if (currentSongItems[index]) {
        currentSongItems[index].classList.add('active');
    }
    
    // 更新播放器顶部的歌曲信息
    document.querySelector('.app-title').innerHTML = `<i class="fas fa-music"></i> ${song.title}`;
    // 更新 album-info 区域的歌曲标题和艺术家
    document.querySelector('.album-info .song-title-display').textContent = song.title;
    document.querySelector('.album-info .artist-display').textContent = `by ${song.artist}`;
    
    // 更新专辑封面
    const albumCover = document.getElementById('current-album-cover');
    if (albumCover && song.cover) {
        albumCover.src = song.cover;
        albumCover.onerror = function() {
            // 如果封面加载失败，使用默认图片
            this.src = '/icons/icon-192x192.png';
        };
    }
    
    // 更新媒体会话元数据（用于锁屏界面显示）
    updateMediaSession(song);
}

/**
 * 更新媒体会话元数据
 * @param {Object} song - 歌曲对象
 */
/**
 * 检测是否为iOS PWA环境
 * @returns {boolean} 是否为iOS PWA
 */
function isiOSPWA() {
    return window.navigator.standalone === true && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * 更新媒体会话播放状态
 * @param {string} state - 播放状态: 'playing', 'paused', 'none'
 */
function updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.playbackState = state;
            console.log('媒体会话播放状态已更新:', state);
        } catch (error) {
            console.warn('设置媒体会话播放状态失败:', error);
        }
    }
}

/**
 * 更新媒体会话位置状态
 */
function updateMediaSessionPositionState() {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration || 0,
                playbackRate: audio.playbackRate,
                position: audio.currentTime || 0
            });
        } catch (error) {
            console.warn('设置播放位置状态失败:', error);
        }
    }
}

function updateMediaSession(song) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: song.album || '未知专辑',
            artwork: [
                {
                    src: song.cover || '/icons/icon-192x192.png',
                    sizes: '192x192',
                    type: 'image/png'
                },
                {
                    src: song.cover || '/icons/icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png'
                }
            ]
        });
        
        // 设置初始播放状态
        updateMediaSessionPlaybackState(audio.paused ? 'paused' : 'playing');
        
        // 设置媒体会话动作处理器
        navigator.mediaSession.setActionHandler('play', () => {
            console.log('Media Session: 播放按钮被点击');
            if (audio.paused) {
                togglePlayPause();
            }
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            console.log('Media Session: 暂停按钮被点击');
            if (!audio.paused) {
                togglePlayPause();
            }
        });
        
        navigator.mediaSession.setActionHandler('stop', () => {
            console.log('Media Session: 停止按钮被点击');
            audio.pause();
            audio.currentTime = 0;
            playPauseBtn.classList.remove('fa-pause');
            playPauseBtn.classList.add('fa-play');
            updateMediaSessionPlaybackState('none');
        });
        
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            console.log('Media Session: 上一曲按钮被点击');
            playPreviousSong();
        });
        
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            console.log('Media Session: 下一曲按钮被点击');
            playNextSong();
        });
        
        // 设置播放位置状态（可选）
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            console.log('Media Session: 进度条被拖动到:', details.seekTime);
            if (details.seekTime && audio.duration) {
                audio.currentTime = details.seekTime;
                updateMediaSessionPositionState();
            }
        });
        
        // iOS特殊处理：设置快进和快退
        try {
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                console.log('Media Session: 快退按钮被点击');
                const skipTime = details.seekOffset || 10;
                audio.currentTime = Math.max(audio.currentTime - skipTime, 0);
                updateMediaSessionPositionState();
            });
            
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                console.log('Media Session: 快进按钮被点击');
                const skipTime = details.seekOffset || 10;
                audio.currentTime = Math.min(audio.currentTime + skipTime, audio.duration);
                updateMediaSessionPositionState();
            });
        } catch (error) {
            console.log('当前浏览器不支持快进/快退功能:', error);
        }
        
        // iOS特殊处理：使用修复脚本更新媒体会话
        if (isiOSPWA() && iosMediaSessionFix) {
            iosMediaSessionFix.updateMetadata({
                title: song.title,
                artist: song.artist,
                album: song.album || '未知专辑',
                artwork: [
                    {
                        src: song.cover || '/icons/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: song.cover || '/icons/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            });
        } else {
            setTimeout(() => {
                updateMediaSessionPositionState();
            }, 300);
        }
        
        console.log('媒体会话元数据已更新:', song.title, 'by', song.artist);
    } else {
        console.log('当前浏览器不支持 Media Session API');
    }
}
 
 /**
  * 初始化URL切换开关
  */
function initUrlToggle() {
    const urlToggle = document.getElementById('url-toggle');
    const toggleModeText = document.getElementById('toggle-mode-text');
    
    // 从localStorage读取保存的模式
    const savedMode = localStorage.getItem('urlMode') || 'from_api';
    setUrlMode(savedMode);
    
    // 添加点击事件监听器
    urlToggle.addEventListener('click', () => {
        const newMode = urlMode === 'from_api' ? 'from_list' : 'from_api';
        setUrlMode(newMode);
        // 保存到localStorage
        localStorage.setItem('urlMode', newMode);
    });
}

/**
 * 设置URL获取模式
 * @param {string} mode - 模式：'from_api' 或 'from_list'
 */
function setUrlMode(mode) {
    const urlToggle = document.getElementById('url-toggle');
    const toggleModeText = document.getElementById('toggle-mode-text');
    
    urlMode = mode;
    
    if (mode === 'from_api') {
        urlToggle.classList.add('active');
        toggleModeText.textContent = 'API';
    } else {
        urlToggle.classList.remove('active');
        toggleModeText.textContent = 'LIST';
    }
    
    console.log('URL获取模式已切换为:', mode);
}

/**
 * 实时获取音乐播放链接
 * @param {string} trackId - 曲目ID
 * @param {string} source - 音乐源
 * @param {number} bitrate - 音质
 * @returns {Promise<string>} 播放链接
 */
async function getRealTimeMusicUrl(trackId, source = 'netease', bitrate = 320) {
    if (!trackId) {
        throw new Error('缺少trackId参数');
    }
    
    try {
        console.log(`正在实时获取播放链接: trackId=${trackId}, source=${source}, br=${bitrate}`);
        
        const response = await fetch(`/api/music/url?trackId=${trackId}&source=${source}&br=${bitrate}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data && data.url) {
            console.log('实时获取播放链接成功:', data.url);
            return data.url;
        } else {
            throw new Error('API返回的数据中没有有效的播放链接');
        }
    } catch (error) {
        console.error('实时获取播放链接失败:', error);
        throw error;
    }
}

/**
 * 格式化时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * 更新进度条
 * @param {Event} e - 鼠标事件
 */
function updateProgressBar(e) {
    const width = progressBarContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    audio.currentTime = (clickX / width) * duration;
}

/**
 * 下载当前选定的歌曲
 * 使用后端代理接口下载，避免CORS问题
 */
async function downloadCurrentSong() {
    const currentSong = playlist[currentSongIndex];
    if (!currentSong) {
        alert('请先选择一首歌曲');
        return;
    }
    
    try {
        if (!currentSong.trackId) {
            alert('当前歌曲缺少必要的ID信息，无法下载');
            return;
        }
        
        console.log('开始下载:', currentSong.title);
        
        // 构建下载URL，使用后端代理接口，并传递歌曲信息用于文件命名
        const downloadUrl = `/api/music/download?trackId=${currentSong.trackId}&source=${currentSong.source || 'netease'}&br=320&title=${encodeURIComponent(currentSong.title)}&artist=${encodeURIComponent(currentSong.artist)}`;
        
        // 创建下载链接
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${currentSong.artist} - ${currentSong.title}.mp3`;
        link.target = '_blank'; // 在新标签页中打开，避免中断当前播放
        link.style.display = 'none';
        
        // 添加到页面并触发下载
        document.body.appendChild(link);
        link.click();
        
        // 清理
        setTimeout(() => {
            document.body.removeChild(link);
        }, 1000);
        
        console.log('下载请求已发送:', currentSong.title);
        
    } catch (error) {
        console.error('下载失败:', error);
        alert('下载失败，请稍后重试');
    }
}

// 更新播放列表UI
function updatePlaylistUI() {
    songItems.forEach((item, index) => {
        item.addEventListener('click', async () => {
            currentSongIndex = index;
            
            // 移除了歌曲时长获取功能
            
            await loadSong(currentSongIndex);
            // 等待音频加载完成后再播放
            audio.addEventListener('canplaythrough', function playWhenReady() {
                audio.removeEventListener('canplaythrough', playWhenReady);
                audio.play().then(() => {
                    // 播放成功后更新按钮状态
                    playPauseBtn.classList.remove('fa-play');
                    playPauseBtn.classList.add('fa-pause');
                }).catch(error => {
                    console.error('播放失败:', error);
                });
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // 初始化音频和控制元素
    audio = new Audio();
    playPauseBtn = document.querySelector('.player-controls .fa-play');
    backwardBtn = document.querySelector('.player-controls .fa-backward');
    forwardBtn = document.querySelector('.player-controls .fa-forward');
    const progressBar = document.querySelector('.playback-bar .progress');
    const currentTimeSpan = document.querySelector('.playback-bar .current-time');
    const totalTimeSpan = document.querySelector('.playback-bar .total-time');
    const volumeSlider = document.querySelector('.volume-control .volume-slider');
    progressBarContainer = document.querySelector('.playback-bar .progress-bar'); // 获取进度条容器
    seekThumb = document.querySelector('.playback-bar .seek-thumb'); // 获取拖动圆点
    songItems = document.querySelectorAll('.song-item');
    const downloadButton = document.getElementById('download-button'); // 获取下载按钮
    


    // refreshMusicUrl 函数已移动到全局作用域

    /**
     * 根据音量大小更新音量图标
     * @param {number} volume - 音量值 (0-100)
     */
    function updateVolumeIcon(volume) {
        const volumeIcon = document.querySelector('.volume-control i');
        if (!volumeIcon) return;
        
        // 移除所有音量相关的类
        volumeIcon.classList.remove('fa-volume-off', 'fa-volume-down', 'fa-volume-up');
        
        // 根据音量大小设置对应的图标
        if (volume == 0) {
            // 静音状态
            volumeIcon.classList.add('fa-volume-off');
        } else if (volume <= 50) {
            // 低音量状态
            volumeIcon.classList.add('fa-volume-down');
        } else {
            // 高音量状态
            volumeIcon.classList.add('fa-volume-up');
        }
    }

    // 初始化播放器
    function initPlayer() {
        // 从DOM中获取歌曲数据
        songItems.forEach(item => {
            playlist.push({
                title: item.querySelector('.song-title').textContent,
                artist: item.querySelector('.song-artist').textContent, // 获取艺术家信息
                src: item.dataset.src || '', // 获取预存的src
                cover: item.dataset.cover || '/icons/icon-192x192.png', // 获取专辑封面
                trackId: item.dataset.trackId || '',
                source: item.dataset.source || 'netease'
            });
        });
        if (playlist.length > 0) {
            loadSong(currentSongIndex);
            updatePlaylistUI();
            
            // 初始化完成后，开始预加载前几首歌曲
            setTimeout(() => {
                console.log('🎵 InitPlayer: 开始初始预加载');
                
                // 预加载第二首歌曲（如果存在）
                if (playlist.length > 1) {
                    const secondSong = playlist[1];
                    preloadManager.preloadSong(secondSong, 1).then(() => {
                        console.log(`🎵 InitPlayer: 初始预加载完成 - ${secondSong.title}`);
                    }).catch(error => {
                        console.warn(`🎵 InitPlayer: 初始预加载失败 - ${secondSong.title}:`, error);
                    });
                }
                
                // 如果歌单较长，也预加载第三首
                if (playlist.length > 2) {
                    setTimeout(() => {
                        const thirdSong = playlist[2];
                        preloadManager.preloadSong(thirdSong, 2).then(() => {
                            console.log(`🎵 InitPlayer: 第三首预加载完成 - ${thirdSong.title}`);
                        }).catch(error => {
                            console.warn(`🎵 InitPlayer: 第三首预加载失败 - ${thirdSong.title}:`, error);
                        });
                    }, 2000); // 延迟2秒预加载第三首
                }
            }, 3000); // 延迟3秒开始初始预加载，确保页面加载完成
        }
        
        // 初始化URL切换开关
        initUrlToggle();
        
        // 初始化音量图标状态
        const volumeSlider = document.querySelector('.volume-control .volume-slider');
        if (volumeSlider) {
            updateVolumeIcon(volumeSlider.value);
        }
    }

    // loadSong 函数已移动到全局作用域
    
    // updateSongUI 函数已移动到全局作用域
    
    // updateMediaSession 函数已移动到全局作用域

// 播放/暂停功能 - 移动到全局作用域
function togglePlayPause() {
        if (audio.paused) {
            // 使用Promise处理播放请求
            audio.play().then(() => {
                playPauseBtn.classList.remove('fa-play');
                playPauseBtn.classList.add('fa-pause');
                // 更新Media Session状态
                updateMediaSessionPlaybackState('playing');
            }).catch(error => {
                console.error('播放失败:', error);
                // 如果播放失败，可能是链接失效，尝试重新获取
                const currentSong = playlist[currentSongIndex];
                if (currentSong && currentSong.trackId) {
                    console.log('播放失败，尝试重新获取链接...');
                    refreshMusicUrl(currentSong, currentSongIndex);
                }
            });
        } else {
            audio.pause();
            playPauseBtn.classList.remove('fa-pause');
            playPauseBtn.classList.add('fa-play');
            // 更新Media Session状态
            updateMediaSessionPlaybackState('paused');
        }
}

// 上一曲
async function playPreviousSong() {
        currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
        await loadSong(currentSongIndex);
        // 等待音频加载完成后再播放
        audio.addEventListener('canplaythrough', function playWhenReady() {
            audio.removeEventListener('canplaythrough', playWhenReady);
            audio.play().then(() => {
                // 播放成功后更新按钮状态
                playPauseBtn.classList.remove('fa-play');
                playPauseBtn.classList.add('fa-pause');
                // 更新Media Session状态
                updateMediaSessionPlaybackState('playing');
            }).catch(error => {
                console.error('播放上一曲失败:', error);
            });
        });
}

// 下一曲
async function playNextSong() {
        console.log('执行playNextSong函数');
        const nextIndex = (currentSongIndex + 1) % playlist.length;
        const nextSong = playlist[nextIndex];
        
        // 检查是否有预加载的URL
        const preloadedUrl = preloadManager.getCachedUrl(nextSong);
        if (preloadedUrl) {
            console.log(`🎵 PlayNext: 使用预加载URL播放下一首 - ${nextSong.title}`);
            
            // 更新歌曲信息
            nextSong.src = preloadedUrl;
            playlist[nextIndex].src = preloadedUrl;
            
            // 直接设置音频源并播放
            currentSongIndex = nextIndex;
            updateSongUI(nextSong, nextIndex);
            
            audio.src = preloadedUrl;
            
            // 等待音频加载完成后再播放
            audio.addEventListener('canplaythrough', function playWhenReady() {
                audio.removeEventListener('canplaythrough', playWhenReady);
                audio.play().then(() => {
                    // 播放成功后更新按钮状态
                    playPauseBtn.classList.remove('fa-play');
                    playPauseBtn.classList.add('fa-pause');
                    // 更新Media Session状态
                    updateMediaSessionPlaybackState('playing');
                    console.log('🎵 PlayNext: 预加载歌曲播放成功 -', nextSong.title);
                    
                    // 触发预加载下下首歌曲
                    triggerPreloadNext(nextIndex);
                }).catch(error => {
                    console.error('🎵 PlayNext: 预加载歌曲播放失败:', error);
                    // 如果预加载的URL播放失败，回退到正常加载流程
                    fallbackToNormalLoad(nextIndex);
                });
            });
            
            // 添加错误处理
            audio.addEventListener('error', function handleError(e) {
                audio.removeEventListener('error', handleError);
                console.error('🎵 PlayNext: 预加载URL播放出错:', e);
                // 回退到正常加载流程
                fallbackToNormalLoad(nextIndex);
            }, { once: true });
        } else {
            // 没有预加载URL，使用正常加载流程
            console.log(`🎵 PlayNext: 无预加载URL，使用正常加载流程 - ${nextSong.title}`);
            fallbackToNormalLoad(nextIndex);
        }
}

/**
 * 回退到正常加载流程
 * @param {number} nextIndex - 下一首歌曲索引
 */
async function fallbackToNormalLoad(nextIndex) {
        console.log(`🎵 PlayNext: 执行回退加载流程`);
        currentSongIndex = nextIndex;
        await loadSong(currentSongIndex);
        // 等待音频加载完成后再播放
        audio.addEventListener('canplaythrough', function playWhenReady() {
            audio.removeEventListener('canplaythrough', playWhenReady);
            audio.play().then(() => {
                // 播放成功后更新按钮状态
                playPauseBtn.classList.remove('fa-play');
                playPauseBtn.classList.add('fa-pause');
                // 更新Media Session状态
                updateMediaSessionPlaybackState('playing');
                console.log('下一曲播放成功');
            }).catch(error => {
                console.error('播放下一曲失败:', error);
            });
        });
}

// 将函数暴露到全局作用域，供iOS媒体会话修复脚本调用
window.playNextSong = playNextSong;

// 更新播放进度条和时间
audio.addEventListener('timeupdate', () => {
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        currentTimeSpan.textContent = formatTime(audio.currentTime);
        
        // 更新媒体会话播放位置
        updateMediaSessionPositionState();
    });
    
    // iOS PWA特殊处理：添加额外的音频事件监听器
    if (isiOSPWA()) {
        console.log('检测到iOS PWA环境，添加特殊处理');
        
        // 强制重新设置Media Session
        audio.addEventListener('loadstart', () => {
            setTimeout(() => {
                if (playlist[currentSongIndex]) {
                    updateMediaSession(playlist[currentSongIndex]);
                }
            }, 100);
        });
        
        audio.addEventListener('pause', () => {
            console.log('iOS PWA: 音频暂停事件');
            updateMediaSessionPlaybackState('paused');
        });
        
        audio.addEventListener('play', () => {
            console.log('iOS PWA: 音频播放事件');
            updateMediaSessionPlaybackState('playing');
        });
        
        audio.addEventListener('ended', () => {
            console.log('iOS PWA: 音频结束事件');
            updateMediaSessionPlaybackState('none');
        });
        
        // iOS特殊处理：确保Media Session在页面可见时重新激活
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && playlist[currentSongIndex]) {
                console.log('iOS PWA: 页面重新可见，重新设置Media Session');
                setTimeout(() => {
                    updateMediaSession(playlist[currentSongIndex]);
                }, 200);
            }
        });
    }

    // 歌曲加载完成时更新总时长
    audio.addEventListener('loadedmetadata', () => {
        totalTimeSpan.textContent = formatTime(audio.duration);

    });

    // 调整音量
    volumeSlider.addEventListener('input', (e) => {
        audio.volume = e.target.value / 100;
        // 更新无障碍属性
        e.target.setAttribute('aria-valuenow', e.target.value);
        e.target.setAttribute('title', `调节音量: ${e.target.value}%`);
        // 更新音量图标
        updateVolumeIcon(e.target.value);
    });

    // 进度条点击和拖动跳转
    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        seekThumb.style.display = 'block'; // 显示圆点
        const width = progressBarContainer.clientWidth;
        const clickX = e.offsetX;
        const percent = (clickX / width) * 100;
        seekThumb.style.left = `${percent}%`; // 设置圆点位置
        updateProgressBar(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateProgressBar(e);
            // 更新圆点位置
            const width = progressBarContainer.clientWidth;
            const clickX = e.offsetX;
            const percent = (clickX / width) * 100;
            seekThumb.style.left = `${percent}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        seekThumb.style.display = 'none'; // 隐藏圆点
    });

    // 歌曲播放结束自动播放下一曲
    audio.addEventListener('ended', () => {
        console.log('歌曲播放结束，准备播放下一首');
        
        // iOS PWA环境下的特殊处理
        if (isiOSPWA()) {
            console.log('iOS PWA环境：延迟播放下一首以确保媒体会话同步');
            setTimeout(() => {
                playNextSong();
            }, 200);
        } else {
            playNextSong();
        }
    });

    // 添加时间更新事件监听，用于触发预加载
    audio.addEventListener('timeupdate', () => {
        if (audio.duration && audio.currentTime) {
            const progress = audio.currentTime / audio.duration;
            
            // 当播放进度达到70%时，开始预加载下一首歌曲
            if (progress >= 0.7) {
                const nextIndex = (currentSongIndex + 1) % playlist.length;
                const nextSong = playlist[nextIndex];
                
                if (nextSong && !preloadManager.getCachedUrl(nextSong)) {
                    console.log(`🎵 TimeUpdate: 播放进度${Math.round(progress * 100)}%，触发预加载下一首 - ${nextSong.title}`);
                    
                    // 异步预加载，不阻塞播放
                    preloadManager.preloadSong(nextSong, nextIndex).catch(error => {
                        console.warn(`🎵 TimeUpdate: 预加载失败 - ${nextSong.title}:`, error);
                    });
                }
            }
        }
    });

    // 更新播放列表UI



    
    // 事件监听
    playPauseBtn.addEventListener('click', togglePlayPause);
    backwardBtn.addEventListener('click', playPreviousSong);
    forwardBtn.addEventListener('click', playNextSong);
    
    // 下载按钮事件监听
    if (downloadButton) {
        downloadButton.addEventListener('click', downloadCurrentSong);
    }

    // 初始化播放器
    initPlayer();
    
    // 初始化 iOS 媒体会话修复
    if (typeof IOSMediaSessionFix !== 'undefined' && isiOSPWA()) {
        iosMediaSessionFix = new IOSMediaSessionFix(audio);
        
        // 监听自定义媒体会话事件
        window.addEventListener('mediasession-previoustrack', () => {
            playPreviousSong();
        });
        
        window.addEventListener('mediasession-nexttrack', () => {
            playNextSong();
        });
        
        console.log('iOS 媒体会话修复已初始化');
    }
    
    // 初始化歌单选择器
    initPlaylistSelector();
    
    // 初始化歌单按钮状态
    updatePlaylistButtons('costomer');
});

// 歌单相关变量和函数
let playlistButtons;
let currentPlaylistName = 'costomer'; // 当前歌单名称

/**
 * 初始化歌单选择器
 */
function initPlaylistSelector() {
        // 在DOM加载完成后查询歌单按钮
        playlistButtons = document.querySelectorAll('.playlist-btn');
        
        playlistButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                const playlistName = e.target.dataset.playlist;
                if (playlistName && playlistName !== currentPlaylistName) {
                    await switchPlaylist(playlistName);
                }
            });
        });
}

/**
 * 切换歌单
 * @param {string} playlistName - 歌单名称
 */
async function switchPlaylist(playlistName) {
        try {
            // 禁用所有按钮，防止重复点击
            playlistButtons.forEach(btn => btn.disabled = true);
            
            console.log(`正在切换到歌单: ${playlistName}`);
            
            // 暂停当前播放
            audio.pause();
            playPauseBtn.classList.remove('fa-pause');
            playPauseBtn.classList.add('fa-play');
            
            // 清空预加载缓存，因为歌单已更换
            preloadManager.clearCache();
            console.log('🎵 SwitchPlaylist: 已清空预加载缓存');
            
            // 获取新歌单数据
            const response = await fetch(`/api/playlist/${playlistName}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const playlistData = await response.json();
            
            if (!playlistData.songs || !Array.isArray(playlistData.songs)) {
                throw new Error('歌单数据格式错误');
            }
            
            // 更新全局变量
            playlist = playlistData.songs;
            currentSongIndex = 0;
            currentPlaylistName = playlistName;
            
            console.log(`歌单切换成功: ${playlistData.chartName}, 共 ${playlist.length} 首歌曲`);
            
            // 重新渲染播放列表
            renderPlaylistHTML();
            
            // 重新初始化播放列表UI
            songItems = document.querySelectorAll('.song-item');
            updatePlaylistUI();
            
            // 加载第一首歌曲
            if (playlist.length > 0) {
                await loadSong(0);
                console.log('🎵 SwitchPlaylist: 已加载新歌单的第一首歌曲');
            }
            
            // 更新按钮状态
            updatePlaylistButtons(playlistName);
            
        } catch (error) {
            console.error('切换歌单失败:', error);
            alert(`切换歌单失败: ${error.message}`);
        } finally {
            // 重新启用所有按钮
            playlistButtons.forEach(btn => btn.disabled = false);
        }
}

/**
 * 更新歌单按钮状态
 * @param {string} activePlaylist - 当前激活的歌单
 */
function updatePlaylistButtons(activePlaylist) {
        playlistButtons.forEach(button => {
            if (button.dataset.playlist === activePlaylist) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
}

/**
 * 重新渲染播放列表HTML
 */
function renderPlaylistHTML() {
        const playlistContainer = document.querySelector('.playlist');
        
        if (playlist.length === 0) {
            playlistContainer.innerHTML = `
                <div class="error-message">
                    <p>当前歌单为空</p>
                </div>
            `;
            return;
        }
        
        const playlistHTML = playlist.map((song, index) => `
            <div class="song-item" 
                 data-src="${song.src}" 
                 data-cover="${song.cover}" 
                 data-track-id="${song.trackId}" 
                 data-source="${song.source}">
                <span class="song-number">${String(index + 1).padStart(String(playlist.length).length, '0')} </span>
                <span class="song-title">${song.title}</span>
                <span class="song-artist">${song.artist}</span>
            </div>
        `).join('');
        
        playlistContainer.innerHTML = playlistHTML;
        
        // 重新绑定事件监听器
        const newSongItems = document.querySelectorAll('.song-item');
        newSongItems.forEach((item, index) => {
            item.addEventListener('click', async () => {
                currentSongIndex = index;
                await loadSong(currentSongIndex);
                // 等待音频加载完成后再播放
                audio.addEventListener('canplaythrough', function playWhenReady() {
                    audio.removeEventListener('canplaythrough', playWhenReady);
                    audio.play().then(() => {
                        playPauseBtn.classList.remove('fa-play');
                        playPauseBtn.classList.add('fa-pause');
                        // 更新Media Session状态
                        updateMediaSessionPlaybackState('playing');
                    }).catch(error => {
                        console.error('播放失败:', error);
                    });
                });
            });
        });
    }
