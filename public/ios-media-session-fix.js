/**
 * iOS 媒体会话修复脚本
 * 专门解决 iOS 设备锁屏界面媒体控制问题
 */

/**
 * 检测是否为 iOS 设备
 * @returns {boolean} 是否为 iOS 设备
 */
function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * 检测是否为 iOS PWA 环境
 * @returns {boolean} 是否为 iOS PWA
 */
function isIOSPWA() {
    return isIOSDevice() && window.navigator.standalone === true;
}

/**
 * iOS 媒体会话修复类
 */
class IOSMediaSessionFix {
    constructor(audioElement) {
        this.audio = audioElement;
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        if (isIOSDevice()) {
            this.init();
        }
    }
    
    /**
     * 初始化 iOS 媒体会话修复
     */
    init() {
        console.log('初始化 iOS 媒体会话修复');
        
        // 延迟初始化，确保页面完全加载
        setTimeout(() => {
            this.setupMediaSession();
            this.setupEventListeners();
            this.setupVisibilityHandling();
        }, 500);
    }
    
    /**
     * 设置媒体会话
     */
    setupMediaSession() {
        if (!('mediaSession' in navigator)) {
            console.warn('当前浏览器不支持 Media Session API');
            return;
        }
        
        try {
            // 强制重新设置所有动作处理器
            this.registerActionHandlers();
            this.isInitialized = true;
            console.log('iOS 媒体会话设置完成');
        } catch (error) {
            console.error('设置 iOS 媒体会话失败:', error);
            this.retrySetup();
        }
    }
    
    /**
     * 注册动作处理器
     */
    registerActionHandlers() {
        const actions = [
            {
                name: 'play',
                handler: () => {
                    console.log('iOS Media Session: 播放');
                    if (this.audio.paused) {
                        this.audio.play().catch(console.error);
                    }
                }
            },
            {
                name: 'pause',
                handler: () => {
                    console.log('iOS Media Session: 暂停');
                    if (!this.audio.paused) {
                        this.audio.pause();
                    }
                }
            },
            {
                name: 'stop',
                handler: () => {
                    console.log('iOS Media Session: 停止');
                    this.audio.pause();
                    this.audio.currentTime = 0;
                }
            },
            {
                name: 'seekto',
                handler: (details) => {
                    console.log('iOS Media Session: 跳转到', details.seekTime);
                    if (details.seekTime !== undefined && this.audio.duration) {
                        this.audio.currentTime = details.seekTime;
                    }
                }
            },
            {
                name: 'previoustrack',
                handler: () => {
                    console.log('iOS Media Session: 上一曲');
                    // 触发自定义事件
                    window.dispatchEvent(new CustomEvent('mediasession-previoustrack'));
                }
            },
            {
                name: 'nexttrack',
                handler: () => {
                    console.log('iOS Media Session: 下一曲');
                    // 触发自定义事件
                    window.dispatchEvent(new CustomEvent('mediasession-nexttrack'));
                }
            }
        ];
        
        // 注册每个动作处理器
        actions.forEach(action => {
            try {
                navigator.mediaSession.setActionHandler(action.name, action.handler);
                console.log(`已注册 ${action.name} 动作处理器`);
            } catch (error) {
                console.warn(`注册 ${action.name} 动作处理器失败:`, error);
            }
        });
        
        // iOS特殊处理：强制清除快进快退，确保显示上一曲下一曲
        try {
            // 先清除可能存在的快进快退处理器
            navigator.mediaSession.setActionHandler('seekforward', null);
            navigator.mediaSession.setActionHandler('seekbackward', null);
            console.log('已清除快进快退处理器，优先显示上一曲下一曲');
        } catch (error) {
            console.log('清除快进快退处理器失败:', error);
        }
        
        // 延迟重新确认上一曲下一曲处理器
        setTimeout(() => {
            try {
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    console.log('iOS Media Session: 上一曲 (重新注册)');
                    window.dispatchEvent(new CustomEvent('mediasession-previoustrack'));
                });
                
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    console.log('iOS Media Session: 下一曲 (重新注册)');
                    window.dispatchEvent(new CustomEvent('mediasession-nexttrack'));
                });
                
                console.log('已重新注册上一曲下一曲处理器');
            } catch (error) {
                console.warn('重新注册上一曲下一曲失败:', error);
            }
        }, 500);
    }
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 音频状态变化时更新媒体会话
        this.audio.addEventListener('play', () => {
            this.updatePlaybackState('playing');
        });
        
        this.audio.addEventListener('pause', () => {
            this.updatePlaybackState('paused');
        });
        
        this.audio.addEventListener('ended', () => {
            console.log('iOS Media Session: 歌曲播放结束');
            this.updatePlaybackState('none');
            
            // iOS锁屏环境下确保自动播放下一首
            this.triggerAutoPlayNext();
        });
        
        // 音频加载时重新设置媒体会话
        this.audio.addEventListener('loadstart', () => {
            setTimeout(() => {
                this.refreshMediaSession();
            }, 100);
        });
        
        // 时间更新时更新位置状态
        this.audio.addEventListener('timeupdate', () => {
            this.updatePositionState();
        });
    }
    
    /**
     * 设置页面可见性处理
     */
    setupVisibilityHandling() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('页面重新可见，刷新媒体会话');
                setTimeout(() => {
                    this.refreshMediaSession();
                }, 200);
            }
        });
        
        // 页面获得焦点时也刷新
        window.addEventListener('focus', () => {
            setTimeout(() => {
                this.refreshMediaSession();
            }, 100);
        });
    }
    
    /**
     * 更新播放状态
     * @param {string} state - 播放状态
     */
    updatePlaybackState(state) {
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = state;
                console.log('iOS 媒体会话播放状态已更新:', state);
            } catch (error) {
                console.warn('更新播放状态失败:', error);
            }
        }
    }
    
    /**
     * 更新位置状态
     */
    updatePositionState() {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
                if (this.audio.duration && !isNaN(this.audio.duration)) {
                    navigator.mediaSession.setPositionState({
                        duration: this.audio.duration,
                        playbackRate: this.audio.playbackRate,
                        position: this.audio.currentTime || 0
                    });
                }
            } catch (error) {
                // 忽略位置状态更新错误
            }
        }
    }
    
    /**
     * 刷新媒体会话
     */
    refreshMediaSession() {
        if (!this.isInitialized) {
            this.setupMediaSession();
        } else {
            // 重新注册动作处理器
            this.registerActionHandlers();
        }
    }
    
    /**
     * 重试设置
     */
    retrySetup() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`重试设置媒体会话 (${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => {
                this.setupMediaSession();
            }, 1000 * this.retryCount);
        } else {
            console.error('媒体会话设置失败，已达到最大重试次数');
        }
    }
    
    /**
     * 更新媒体元数据
     * @param {Object} metadata - 媒体元数据
     */
    updateMetadata(metadata) {
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: metadata.title || '未知标题',
                    artist: metadata.artist || '未知艺术家',
                    album: metadata.album || '未知专辑',
                    artwork: metadata.artwork || []
                });
                
                console.log('iOS Media Session 元数据已更新:', metadata);
                
                // 强制重新注册上一曲下一曲处理器
                this.forceRegisterTrackHandlers();
                
                // 强制刷新媒体会话状态
                this.forceRefreshMediaSession();
                
                console.log('iOS 媒体元数据已更新:', metadata.title);
            } catch (error) {
                console.error('更新媒体元数据失败:', error);
            }
        }
    }
    
    /**
     * 强制重新注册上一曲下一曲处理器
     */
    forceRegisterTrackHandlers() {
        try {
            // 清除快进快退
            navigator.mediaSession.setActionHandler('seekforward', null);
            navigator.mediaSession.setActionHandler('seekbackward', null);
            
            // 重新注册上一曲下一曲
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                console.log('iOS Media Session: 上一曲 (强制重注册)');
                window.dispatchEvent(new CustomEvent('mediasession-previoustrack'));
            });
            
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                console.log('iOS Media Session: 下一曲 (强制重注册)');
                window.dispatchEvent(new CustomEvent('mediasession-nexttrack'));
            });
            
            console.log('已强制重新注册上一曲下一曲处理器');
        } catch (error) {
            console.warn('强制重新注册处理器失败:', error);
        }
    }
    
    /**
     * 触发自动播放下一首（带重试机制）
     */
    triggerAutoPlayNext() {
        console.log('iOS Media Session: 开始触发自动播放下一首');
        
        let retryCount = 0;
        const maxRetries = 3;
        
        const attemptAutoPlay = () => {
            retryCount++;
            console.log(`iOS Media Session: 尝试自动播放下一首 (第${retryCount}次)`);
            
            // 方法1：触发自定义事件
            window.dispatchEvent(new CustomEvent('mediasession-nexttrack'));
            
            // 方法2：直接调用全局函数
            if (typeof window.playNextSong === 'function') {
                console.log('iOS Media Session: 直接调用playNextSong函数');
                try {
                    window.playNextSong();
                } catch (error) {
                    console.warn('直接调用playNextSong失败:', error);
                }
            }
            
            // 如果还有重试次数，延迟重试
            if (retryCount < maxRetries) {
                setTimeout(attemptAutoPlay, 300 * retryCount);
            } else {
                console.log('iOS Media Session: 自动播放下一首重试次数已用完');
            }
        };
        
        // 延迟执行第一次尝试
        setTimeout(attemptAutoPlay, 150);
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IOSMediaSessionFix;
} else {
    window.IOSMediaSessionFix = IOSMediaSessionFix;
}