import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

function createProductMesh(type = 'product') {
  const group = new THREE.Group()

  if (type === 'wire') {
    const coilMaterial = new THREE.MeshStandardMaterial({ color: 0x18c7ef, metalness: 0.18, roughness: 0.36 })
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x7c3aed, metalness: 0.12, roughness: 0.42 })
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.13, 18, 72), coilMaterial)
    coil.rotation.x = Math.PI / 2.7
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.72, 32), sleeveMaterial)
    core.rotation.x = Math.PI / 2
    group.add(coil, core)
  } else if (type === 'mcb') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.05, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.08, roughness: 0.28 })
    )
    const switchPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.44, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x16c7ec, metalness: 0.05, roughness: 0.32 })
    )
    switchPlate.position.z = 0.21
    switchPlate.position.y = -0.06
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.06, 0.39),
      new THREE.MeshStandardMaterial({ color: 0x8438ea, metalness: 0.08, roughness: 0.3 })
    )
    stripe.position.z = 0.22
    stripe.position.y = 0.35
    group.add(body, switchPlate, stripe)
  } else if (type === 'lighting') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.28, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xe0f7ff, emissive: 0x0ea5e9, emissiveIntensity: 0.34, roughness: 0.2 })
    )
    const capA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.25), new THREE.MeshStandardMaterial({ color: 0x7c3aed }))
    const capB = capA.clone()
    capA.position.x = -0.82
    capB.position.x = 0.82
    group.add(body, capA, capB)
  } else if (type === 'fan') {
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.18, 36),
      new THREE.MeshStandardMaterial({ color: 0x16c7ec, metalness: 0.12, roughness: 0.35 })
    )
    hub.rotation.x = Math.PI / 2
    group.add(hub)
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.12, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.08, roughness: 0.4 })
      )
      blade.position.x = 0.42
      const bladePivot = new THREE.Group()
      bladePivot.rotation.z = (Math.PI * 2 * i) / 3
      bladePivot.add(blade)
      group.add(bladePivot)
    }
  } else if (type === 'projector') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.58, 0.72),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.08, roughness: 0.28 })
    )
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.22, 36),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.18, roughness: 0.22 })
    )
    lens.rotation.z = Math.PI / 2
    lens.position.set(0.64, -0.02, 0.03)
    const glow = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.9, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, emissive: 0x22d3ee, emissiveIntensity: 0.55 })
    )
    glow.rotation.z = -Math.PI / 2
    glow.position.x = 1.12
    group.add(body, lens, glow)
  } else if (type === 'furniture') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.08, roughness: 0.5 })
    const edge = new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.08, roughness: 0.38 })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.18, 0.5), wood)
    seat.position.y = 0.18
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.16, 0.46), wood)
    back.position.set(0, 0.52, -0.28)
    back.rotation.x = -0.14
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), edge)
    const legB = legA.clone()
    const legC = legA.clone()
    const legD = legA.clone()
    legA.position.set(-0.52, -0.14, 0.18)
    legB.position.set(0.52, -0.14, 0.18)
    legC.position.set(-0.52, -0.14, -0.24)
    legD.position.set(0.52, -0.14, -0.24)
    group.add(seat, back, legA, legB, legC, legD)
  } else if (type === 'bulb') {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xffd86b, emissiveIntensity: 0.42, roughness: 0.2 })
    )
    bulb.position.y = 0.18
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.32, 32),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.28 })
    )
    cap.position.y = -0.28
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.025, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.45 })
    )
    ring.position.y = -0.12
    group.add(bulb, cap, ring)
  } else {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.16, roughness: 0.34 })
    )
    group.add(mesh)
  }

  return group
}

function ProductScene3D({ products = [] }) {
  const mountRef = useRef(null)
  const productKey = useMemo(
    () => products.map((product) => `${product.sku || product.itemName || ''}-${product.imageType || ''}`).join('|'),
    [products]
  )

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100)
    camera.position.set(0, 0.75, 4.6)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    const keyLight = new THREE.PointLight(0x40d8ff, 2.1, 10)
    keyLight.position.set(-3, 3, 4)
    const rimLight = new THREE.PointLight(0x8b5cf6, 1.7, 10)
    rimLight.position.set(3, 2.2, 2.5)
    scene.add(ambientLight, keyLight, rimLight)

    const group = new THREE.Group()
    scene.add(group)

    const visibleProducts = products.length ? products.slice(0, 6) : [
      { imageType: 'wire' },
      { imageType: 'mcb' },
      { imageType: 'lighting' },
      { imageType: 'projector' },
      { imageType: 'furniture' },
      { imageType: 'bulb' },
    ]

    visibleProducts.forEach((product, index) => {
      const productGroup = createProductMesh(product.imageType || 'product')
      const angle = (Math.PI * 2 * index) / visibleProducts.length
      const radius = visibleProducts.length > 2 ? 1.25 : 0.72
      productGroup.position.set(Math.cos(angle) * radius, Math.sin(index * 1.7) * 0.18, Math.sin(angle) * radius)
      productGroup.rotation.y = -angle
      productGroup.scale.setScalar(index === 0 ? 1.06 : 0.92)
      group.add(productGroup)
    })

    const floor = new THREE.Mesh(
      new THREE.TorusGeometry(1.76, 0.012, 8, 96),
      new THREE.MeshStandardMaterial({ color: 0x1ed4f7, emissive: 0x1ed4f7, emissiveIntensity: 0.55 })
    )
    floor.rotation.x = Math.PI / 2
    floor.position.y = -0.9
    scene.add(floor)

    const handleResize = () => {
      const { width, height } = mount.getBoundingClientRect()
      const safeWidth = Math.max(width, 280)
      const safeHeight = Math.max(height, 280)
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
      group.rotation.y += 0.008
      group.rotation.x = Math.sin(Date.now() * 0.001) * 0.06
      group.children.forEach((child, index) => {
        child.rotation.y += 0.012 + index * 0.001
        child.position.y += Math.sin(Date.now() * 0.0015 + index) * 0.0008
      })
      floor.rotation.z += 0.006
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose())
          } else {
            object.material.dispose()
          }
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [productKey])

  const labels = products.slice(0, 3)

  return (
    <div className="product-scene-shell">
      <div className="product-scene-canvas" ref={mountRef} aria-label="3D product preview" />
      <div className="product-scene-glow" />
      <div className="product-scene-labels">
        {labels.map((product, index) => (
          <span key={`${product.sku || product.itemName || index}-${index}`}>
            {product.category || product.itemName || 'Matched product'}
          </span>
        ))}
      </div>
    </div>
  )
}

export default ProductScene3D
