import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function SceneBackdrop3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.set(0, 0, 7)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0x8be9ff, 0.78)
    const cyan = new THREE.PointLight(0x23d3ee, 2.4, 18)
    const violet = new THREE.PointLight(0x8b5cf6, 2.2, 18)
    cyan.position.set(-4, 3, 5)
    violet.position.set(4, -1.5, 5)
    scene.add(ambient, cyan, violet)

    const group = new THREE.Group()
    scene.add(group)

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x16c7ec,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.24,
      roughness: 0.32,
      transparent: true,
      opacity: 0.78,
    })
    const violetMaterial = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      emissive: 0x5b21b6,
      emissiveIntensity: 0.38,
      metalness: 0.18,
      roughness: 0.34,
      transparent: true,
      opacity: 0.72,
    })
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe0f7ff,
      transmission: 0.18,
      transparent: true,
      opacity: 0.32,
      metalness: 0.02,
      roughness: 0.1,
      clearcoat: 0.8,
    })

    const shapes = [
      new THREE.TorusKnotGeometry(0.58, 0.12, 96, 12),
      new THREE.IcosahedronGeometry(0.58, 1),
      new THREE.TorusGeometry(0.54, 0.08, 18, 88),
      new THREE.BoxGeometry(0.75, 0.75, 0.75),
      new THREE.OctahedronGeometry(0.62),
    ]

    const meshes = []
    for (let i = 0; i < 28; i += 1) {
      const geometry = shapes[i % shapes.length]
      const material = i % 3 === 0 ? glassMaterial : i % 2 === 0 ? ringMaterial : violetMaterial
      const mesh = new THREE.Mesh(geometry, material)
      const angle = (Math.PI * 2 * i) / 28
      const radius = 2.6 + (i % 5) * 0.52
      mesh.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.3) * 2.2, -1.6 - (i % 4) * 0.42)
      mesh.rotation.set(i * 0.22, i * 0.13, i * 0.09)
      mesh.scale.setScalar(0.32 + (i % 6) * 0.035)
      group.add(mesh)
      meshes.push(mesh)
    }

    const grid = new THREE.GridHelper(18, 18, 0x18c7ef, 0x2d1b68)
    grid.position.y = -3.2
    grid.position.z = -2.6
    grid.material.transparent = true
    grid.material.opacity = 0.22
    scene.add(grid)

    const handleResize = () => {
      const { width, height } = mount.getBoundingClientRect()
      const safeWidth = Math.max(width, 320)
      const safeHeight = Math.max(height, 320)
      camera.aspect = safeWidth / safeHeight
      camera.updateProjectionMatrix()
      renderer.setSize(safeWidth, safeHeight)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(mount)
    handleResize()

    let frameId = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const time = Date.now() * 0.001
      group.rotation.y = time * 0.055
      group.rotation.x = Math.sin(time * 0.45) * 0.055
      meshes.forEach((mesh, index) => {
        mesh.rotation.x += 0.002 + index * 0.00003
        mesh.rotation.y += 0.004 + index * 0.00004
        mesh.position.y += Math.sin(time + index * 0.45) * 0.0009
      })
      grid.rotation.z = Math.sin(time * 0.2) * 0.015
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="scene-backdrop-3d" ref={mountRef} aria-hidden="true" />
}

export default SceneBackdrop3D
