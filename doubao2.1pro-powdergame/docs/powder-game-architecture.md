# 粉末物理沙盒游戏 - 技术架构文档

## 1. 架构设计

```mermaid
flowchart TD
    "用户界面层" --> "交互控制层"
    "交互控制层" --> "物理引擎层"
    "物理引擎层" --> "渲染层"
    "物理引擎层" --> "数据模型层"
    "数据模型层" --> "渲染层"
    
    subgraph "用户界面层"
        "元素面板"
        "工具栏"
        "控制面板"
        "信息栏"
    end
    
    subgraph "交互控制层"
        "鼠标/触摸输入"
        "画笔系统"
        "视图控制"
        "快捷键系统"
    end
    
    subgraph "物理引擎层"
        "元素更新循环"
        "重力系统"
        "热传导系统"
        "压力系统"
        "化学反应系统"
        "电流系统"
        "生命系统"
    end
    
    subgraph "数据模型层"
        "粒子网格"
        "温度场"
        "压力场"
        "速度场"
        "元素属性定义"
    end
    
    subgraph "渲染层"
        "Canvas渲染器"
        "粒子着色"
        "特效系统"
        "UI渲染"
    end
```

## 2. 技术选型

- **前端框架**: 纯原生 JavaScript + HTML5 Canvas（高性能粒子模拟需要直接控制像素，React/Vue会引入不必要的开销）
- **构建工具**: Vite（快速开发和构建）
- **样式方案**: 原生 CSS（深色主题，CSS变量管理主题）
- **渲染技术**: Canvas 2D API（ImageData直接像素操作，性能最优）
- **物理模拟**: 自定义Cellular Automata（元胞自动机）+ 粒子系统混合方案
- **数据存储**: LocalStorage（存档功能）
- **后端**: 无（纯前端应用）

**技术决策理由**:
- Canvas 2D ImageData 是粉末游戏最成熟的技术方案，可以直接操作像素数组，性能远超 DOM 或 WebGL 方案
- 原生JS避免框架开销，物理模拟每帧需要处理数万个粒子的更新
- 元胞自动机是 The Powder Toy 的核心算法，非常适合这类2D物理模拟

## 3. 核心模块结构

```
doubao2.1pro-powdergame/
├── index.html              # 入口HTML
├── package.json            # 项目配置
├── src/
│   ├── main.js             # 入口文件
│   ├── styles.css          # 全局样式
│   ├── simulation/         # 物理模拟核心
│   │   ├── constants.js    # 常量定义
│   │   ├── elements.js     # 元素定义与属性
│   │   ├── grid.js         # 网格数据结构
│   │   ├── physics.js      # 物理引擎（重力/压力/热传导）
│   │   ├── reactions.js    # 化学反应系统
│   │   ├── electricity.js  # 电流系统
│   │   ├── life.js         # 生命AI系统
│   │   └── engine.js       # 主循环与更新调度
│   ├── render/             # 渲染系统
│   │   ├── renderer.js     # Canvas渲染器
│   │   ├── colors.js       # 元素颜色与着色
│   │   └── effects.js      # 视觉特效（发光/火焰/爆炸）
│   ├── ui/                 # 用户界面
│   │   ├── toolbar.js      # 顶部工具栏
│   │   ├── elements-panel.js # 左侧元素面板
│   │   ├── controls.js     # 右侧控制面板
│   │   ├── statusbar.js    # 底部信息栏
│   │   └── input.js        # 输入处理（鼠标/键盘/触摸）
│   └── utils/              # 工具函数
│       ├── storage.js      # 存档系统
│       └── math.js         # 数学工具
```

## 4. 数据模型

### 4.1 网格数据结构
模拟网格使用二维数组存储，每个格子包含：
```javascript
{
  type: number,        // 元素类型ID
  temperature: number, // 温度（开尔文）
  life: number,        // 生命/生命值
  tmp: number,         // 通用临时变量
  flags: number,       // 位标记（导电/燃烧/静止等）
  vx: number,          // X速度
  vy: number,          // Y速度
  ctype: number        // 承载的元素类型（如水携带盐）
}
```

### 4.2 元素属性定义
```javascript
{
  id: number,           // 唯一ID
  name: string,         // 英文名
  nameCn: string,       // 中文名
  symbol: string,       // 元素符号
  color: string,        // 显示颜色
  color2: string,       // 次要颜色（变化）
  density: number,      // 密度
  state: number,        // 状态：固体/粉末/液体/气体/能量
  hardness: number,     // 硬度
  flammability: number, // 可燃性
  meltingPoint: number, // 熔点
  boilingPoint: number, // 沸点
  conductivity: number, // 导电性
  heatConduct: number,  // 导热性
  reactions: array,     // 反应列表
  update: function      // 更新函数
}
```

### 4.3 物理常量
- 网格尺寸：默认 200 x 150 格子（可配置）
- 初始温度：295K（室温22°C）
- 重力：0.25 px/frame²（可配置方向）
- 压力扩散：0.5 / frame
- 热扩散率：0.25 / frame
- 模拟帧率：60 FPS（可调节 1-60）

## 5. 物理引擎核心算法

### 5.1 更新顺序
每帧按以下顺序处理：
1. **压力/空气模拟**：先计算气压场和速度场
2. **重力与运动**：按类型更新粒子位置（气体先上升，然后液体，然后粉末/固体下落）
3. **热传导**：相邻格子温度交换
4. **状态变化**：熔化/凝固/蒸发/冷凝
5. **化学反应**：相邻元素反应（燃烧、腐蚀、溶解等）
6. **电流传导**：从电源开始传播电信号
7. **特殊元素更新**：生命体、克隆器、传送门等
8. **粒子清理**：处理死亡粒子

### 5.2 运动规则
- **气体**：向多个随机方向扩散，优先向上，受压力场驱动
- **液体**：受重力向下，向下>斜下>水平流动，可交换位置
- **粉末**：受重力向下，向下>斜下堆积，静止后不移动
- **固体**：保持位置不动，除非被破坏或支撑消失
- **能量粒子**：直线运动（光子/激光/中子）

### 5.3 渲染优化
- 使用 ImageData 直接操作像素数组
- 双缓冲渲染（前后缓冲区交换）
- 每帧只更新变化的像素
- 使用 32位整数存储RGBA颜色，避免逐分量计算
- 可选的辉光效果后处理（发光元素）

## 6. 性能优化策略

1. **空间划分**：按行处理，利用CPU缓存局部性
2. **静止检测**：标记静止粒子，跳过更新
3. **批量操作**：绘制时使用Bresenham算法批量填充
4. **帧率自适应**：设备性能不足时自动降低更新分辨率
5. **Web Worker**：物理计算可放在Worker线程（可选优化）
6. **内存复用**：对象池避免频繁GC
