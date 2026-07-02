import * as THREE from "three";

export interface CameraRig {
  camera: THREE.OrthographicCamera;
  resize: () => void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 100);
  camera.position.set(0, 26, 24);
  camera.lookAt(0, 0, 0);

  const resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const boardSize = 29;
    const verticalSize = aspect < 1 ? boardSize / aspect : boardSize;
    camera.left = (-verticalSize * aspect) / 2;
    camera.right = (verticalSize * aspect) / 2;
    camera.top = verticalSize / 2;
    camera.bottom = -verticalSize / 2;
    camera.updateProjectionMatrix();
  };

  resize();
  return { camera, resize };
}
