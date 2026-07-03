import * as THREE from 'three';

export class Boat {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;
    
    // 船在海面的水平位置
    this.position = new THREE.Vector3(10, 0, 10);
    this.velocity = new THREE.Vector3(0, 0, 0);
    
    // 运动及摇摆参数
    this.headingAngle = 0.5; // 朝向角 (弧度)
    this.speed = 1.2;       // 自主航行速度
    this.steerSpeed = 0.05; // 转向速度
    
    this.initMesh();
  }

  // 拼装木船 3D 模型
  initMesh() {
    this.group = new THREE.Group();
    
    // 船身材质
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033, // 深木色
      roughness: 0.8,
      metalness: 0.1
    });

    // 帆材质
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3f4f6, // 亮白色
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    // 1. 船底舱
    const hullGeometry = new THREE.BoxGeometry(4.0, 1.2, 1.8);
    const hull = new THREE.Mesh(hullGeometry, woodMaterial);
    hull.position.y = 0.5;
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);

    // 2. 船头尖角 (棱锥形状)
    const bowGeometry = new THREE.ConeGeometry(1.1, 2.0, 4);
    const bow = new THREE.Mesh(bowGeometry, woodMaterial);
    bow.rotateZ(-Math.PI / 2); // 旋转指向前方
    bow.rotateY(Math.PI / 4); // 调整棱角
    bow.scale.set(1, 1, 0.8);
    bow.position.set(2.7, 0.5, 0);
    bow.castShadow = true;
    this.group.add(bow);

    // 3. 船尾板
    const sternGeometry = new THREE.BoxGeometry(0.8, 1.5, 1.6);
    const stern = new THREE.Mesh(sternGeometry, woodMaterial);
    stern.position.set(-2.2, 0.65, 0);
    stern.castShadow = true;
    this.group.add(stern);

    // 4. 桅杆
    const mastGeometry = new THREE.CylinderGeometry(0.08, 0.12, 5.0, 8);
    const mast = new THREE.Mesh(mastGeometry, woodMaterial);
    mast.position.set(0.5, 3.1, 0);
    mast.castShadow = true;
    this.group.add(mast);

    // 5. 风帆 (两个三角形片)
    const sailGeometry = new THREE.BufferGeometry();
    // 帆的三角形顶点
    const sailVertices = new Float32Array([
      0.5, 5.0, 0.0,  // 桅杆顶
      0.5, 1.5, 0.0,  // 桅杆底
      -1.5, 1.8, 0.0, // 风帆左拉角
      
      0.5, 4.5, 0.0,
      0.5, 2.0, 0.0,
      1.8, 2.2, 0.0   // 风帆右拉角
    ]);
    sailGeometry.setAttribute('position', new THREE.BufferAttribute(sailVertices, 3));
    // 计算法线以正常渲染光照
    sailGeometry.computeVertexNormals();

    const sail = new THREE.Mesh(sailGeometry, sailMaterial);
    sail.castShadow = true;
    this.group.add(sail);

    // 6. 红白救生圈装饰
    const lifeRingGeom = new THREE.TorusGeometry(0.3, 0.1, 8, 24);
    const lifeRingMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // 红色
      roughness: 0.5
    });
    const lifeRing = new THREE.Mesh(lifeRingGeom, lifeRingMat);
    lifeRing.position.set(-1.0, 0.6, 0.95); // 挂在侧舷
    lifeRing.rotateY(Math.PI / 2);
    this.group.add(lifeRing);

    // 缩放并添加到场景中
    this.group.scale.set(0.8, 0.8, 0.8);
    this.scene.add(this.group);
  }

  // 重置小船
  reset() {
    this.position.set((Math.random() - 0.5) * 30.0, 0, (Math.random() - 0.5) * 30.0);
    this.velocity.set(0, 0, 0);
    this.headingAngle = Math.random() * Math.PI * 2;
  }

  // 物理位置及姿态更新
  update(dt, time, weatherSystem) {
    // 1. 处理龙卷风吸引力
    if (weatherSystem && weatherSystem.targetPresetName === 'tornado' && weatherSystem.currentPreset.tornadoStrength > 0.1) {
      // 龙卷风世界坐标 (X, Z)
      const tornadoX = weatherSystem.tornadoCenter.x;
      const tornadoZ = weatherSystem.tornadoCenter.y;

      const toTornado = new THREE.Vector3(tornadoX - this.position.x, 0, tornadoZ - this.position.z);
      const dist = toTornado.length();

      if (dist > 2.0) {
        toTornado.normalize();
        
        // 吸力大小反比于距离，龙卷风模式下风力极强
        const pullForce = (28.0 / (dist + 5.0)) * weatherSystem.currentPreset.tornadoStrength;
        
        // 施加向心拉力
        this.velocity.addScaledVector(toTornado, pullForce * dt);
        
        // 同时增加一个切向风力，使船只绕着龙卷风中心打转旋转
        const tangentForce = new THREE.Vector3(-toTornado.z, 0, toTornado.x);
        this.velocity.addScaledVector(tangentForce, pullForce * 0.8 * dt);
      }
    } else {
      // 晴天或普通雨天，自动向前航行并带有微小游走
      // 游走噪声
      this.headingAngle += (Math.random() - 0.5) * this.steerSpeed * 2.0;
      
      const forward = new THREE.Vector3(Math.cos(this.headingAngle), 0, -Math.sin(this.headingAngle));
      
      // 目标航速
      const targetSpeed = this.speed;
      this.velocity.lerp(forward.multiplyScalar(targetSpeed), 0.05);
    }

    // 2. 模拟海面摩擦阻力
    this.velocity.multiplyScalar(0.97);

    // 3. 更新水平位置
    this.position.addScaledVector(this.velocity, dt);

    // 限制船只不要漂出海面可视范围
    const boundary = 140.0;
    if (this.position.x > boundary) { this.position.x = boundary; this.velocity.x *= -0.5; }
    if (this.position.x < -boundary) { this.position.x = -boundary; this.velocity.x *= -0.5; }
    if (this.position.z > boundary) { this.position.z = boundary; this.velocity.z *= -0.5; }
    if (this.position.z < -boundary) { this.position.z = -boundary; this.velocity.z *= -0.5; }

    // 4. 调用 CPU 浮力公式获取该坐标下的海面高度及精确法向量
    const buoyancy = this.ocean.getBuoyancyData(this.position.x, this.position.z, time);
    
    // 船的 Y 轴对齐波浪高度
    this.position.y = buoyancy.y - 0.15; // 稍微吃水下沉一点

    // 5. 应用位置和方向
    this.group.position.copy(this.position);

    // 6. 基于法向量进行旋转对齐
    // 我们定义船的局部向上向量是 (0, 1, 0)，希望它对齐海浪的法线
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      buoyancy.normal
    );

    // 船本身航行方向（绕 Y 轴旋转）
    const headingQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.headingAngle
    );

    // 复合旋转：先朝向，再贴合海浪法线
    const finalQuat = targetQuaternion.multiply(headingQuat);

    // 平滑插值 (Slerp)，实现重力惯性带来的延迟摇晃感
    this.group.quaternion.slerp(finalQuat, 0.08);
  }
}
