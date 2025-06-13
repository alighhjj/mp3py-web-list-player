# iOS 锁屏界面媒体控制修复方案

## 问题描述

在 iOS 设备的锁屏界面上，音乐播放器的媒体控制只有进度条可以调节，其他控制按钮（播放/暂停、上一曲/下一曲）功能失效。

## 问题原因

1. **Media Session API 兼容性问题**：iOS Safari 对 Media Session API 的支持不够完善
2. **PWA 环境特殊性**：iOS PWA 环境下的媒体会话需要特殊处理
3. **动作处理器注册失败**：某些媒体控制动作在 iOS 上注册失败
4. **状态同步问题**：媒体会话状态与实际播放状态不同步

## 修复方案

### 1. 增强的 Media Session API 实现

**文件：`public/player.js`**

- 添加了完整的媒体会话动作处理器
- 增加了 `stop` 动作处理器
- 添加了快进/快退功能支持
- 增强了错误处理和日志记录

```javascript
// 新增的动作处理器
navigator.mediaSession.setActionHandler('stop', () => {
    audio.pause();
    audio.currentTime = 0;
    updateMediaSessionPlaybackState('none');
});

navigator.mediaSession.setActionHandler('seekforward', (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.min(audio.currentTime + skipTime, audio.duration);
});

navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.max(audio.currentTime - skipTime, 0);
});
```

### 2. iOS 专用修复脚本

**文件：`public/ios-media-session-fix.js`**

创建了专门的 iOS 媒体会话修复类，包含：

- **智能重试机制**：自动重试失败的媒体会话设置
- **页面可见性处理**：页面重新可见时刷新媒体会话
- **强化的事件监听**：更完善的音频事件处理
- **自定义事件系统**：通过自定义事件处理媒体控制

### 3. PWA 配置优化

**文件：`public/manifest.json`**

添加了媒体会话相关配置：

```json
{
  "media_session": {
    "supported_actions": [
      "play", "pause", "stop", "seekto",
      "previoustrack", "nexttrack",
      "seekforward", "seekbackward"
    ]
  },
  "shortcuts": [
    {
      "name": "播放音乐",
      "url": "/?action=play"
    }
  ]
}
```

### 4. HTML Meta 标签优化

**文件：`views/index.ejs`**

添加了 iOS 媒体会话支持的 meta 标签：

```html
<!-- iOS 媒体会话支持 -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-touch-fullscreen" content="yes">
<meta name="media-session" content="enabled">
<meta name="apple-media-session" content="enabled">
```

## 技术实现细节

### 1. 动作处理器注册策略

```javascript
class IOSMediaSessionFix {
    registerActionHandlers() {
        const actions = [
            { name: 'play', handler: () => { /* 播放逻辑 */ } },
            { name: 'pause', handler: () => { /* 暂停逻辑 */ } },
            { name: 'previoustrack', handler: () => { /* 上一曲逻辑 */ } },
            { name: 'nexttrack', handler: () => { /* 下一曲逻辑 */ } }
        ];
        
        actions.forEach(action => {
            try {
                navigator.mediaSession.setActionHandler(action.name, action.handler);
            } catch (error) {
                console.warn(`注册 ${action.name} 失败:`, error);
            }
        });
    }
}
```

### 2. 状态同步机制

```javascript
// 音频事件监听
audio.addEventListener('play', () => {
    updateMediaSessionPlaybackState('playing');
});

audio.addEventListener('pause', () => {
    updateMediaSessionPlaybackState('paused');
});

// 位置状态更新
function updatePositionState() {
    if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
        });
    }
}
```

### 3. 页面可见性处理

```javascript
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // 页面重新可见时刷新媒体会话
        setTimeout(() => {
            this.refreshMediaSession();
        }, 200);
    }
});
```

## 测试验证

### 测试步骤

1. **安装 PWA**：在 iOS Safari 中访问应用，添加到主屏幕
2. **开始播放**：选择一首歌曲开始播放
3. **锁定屏幕**：按下电源键锁定设备
4. **测试控制**：在锁屏界面测试各个媒体控制按钮

### 预期结果

- ✅ 播放/暂停按钮正常工作
- ✅ 上一曲/下一曲按钮正常工作
- ✅ 进度条拖动正常工作
- ✅ 歌曲信息正确显示
- ✅ 专辑封面正确显示

## 兼容性说明

- **iOS 14.5+**：完全支持所有功能
- **iOS 13.0-14.4**：基本功能支持，部分高级功能可能不可用
- **iOS 12.x**：有限支持，建议升级系统

## 故障排除

### 常见问题

1. **控制按钮仍然无效**
   - 检查浏览器控制台是否有错误信息
   - 确认应用已正确安装为 PWA
   - 尝试重新安装应用

2. **歌曲信息不显示**
   - 检查 `MediaMetadata` 是否正确设置
   - 确认专辑封面 URL 可访问

3. **进度条不同步**
   - 检查 `setPositionState` 调用是否正常
   - 确认音频时长获取正确

### 调试方法

```javascript
// 启用详细日志
console.log('Media Session 支持:', 'mediaSession' in navigator);
console.log('当前播放状态:', navigator.mediaSession.playbackState);
console.log('当前元数据:', navigator.mediaSession.metadata);
```

## 更新日志

### v2.1.0 (当前版本)
- 🔧 修复 iOS 锁屏界面媒体控制问题
- 📱 添加 iOS 专用媒体会话修复脚本
- ⚡ 优化 PWA 配置和 meta 标签
- 🛠️ 增强错误处理和重试机制

## 参考资料

- [Media Session API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [iOS Safari PWA 支持](https://webkit.org/blog/8943/what-s-new-in-web-app-manifest/)
- [PWA 媒体会话最佳实践](https://web.dev/media-session/)