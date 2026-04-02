/**
 * How It Works 3D Experience
 * Powered by Three.js
 */

class HowItWorks3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        this.currentStep = 1;
        this.totalSteps = 3;
        this.panels = [];
        this.particles = null;
        this.targetRotation = 0;
        this.currentRotation = 0;
        this.isTransitioning = false;

        this.init();
        this.createScene();
        this.addEventListeners();
        this.animate();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);
        
        this.camera.position.z = 8;
        this.scene.fog = new THREE.FogExp2(0x020617, 0.05);

        // Add Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x0ea5e9, 2);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0x5eead4, 2);
        pointLight2.position.set(-5, -5, 5);
        this.scene.add(pointLight2);
    }

    createScene() {
        // Create Particles
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 2000;
        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 50;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.05,
            color: 0x0ea5e9,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particles);

        // Create Step Panels (Representation only, text is in HTML UI)
        for (let i = 0; i < this.totalSteps; i++) {
            const geometry = new THREE.PlaneGeometry(6, 4, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: 0x0ea5e9,
                transparent: true,
                opacity: 0.1,
                side: THREE.DoubleSide,
                shininess: 100
            });

            const panel = new THREE.Mesh(geometry, material);
            
            // Positioning in a ring
            const angle = (i / this.totalSteps) * Math.PI * 2;
            const radius = 10;
            panel.position.x = Math.sin(angle) * radius;
            panel.position.z = Math.cos(angle) * radius;
            panel.lookAt(0, 0, 0);
            
            // Add wireframe
            const wireframe = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.2 })
            );
            panel.add(wireframe);

            // Add glowing border
            const borderGeo = new THREE.EdgesGeometry(geometry);
            const borderMat = new THREE.LineBasicMaterial({ color: 0x5eead4, linewidth: 2 });
            const border = new THREE.LineSegments(borderGeo, borderMat);
            panel.add(border);

            this.panels.push(panel);
            this.scene.add(panel);
        }
    }

    addEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        const nextBtn = document.getElementById('next-3d');
        const prevBtn = document.getElementById('prev-3d');
        const closeBtn = document.getElementById('close-3d');

        nextBtn.addEventListener('click', () => this.next());
        prevBtn.addEventListener('click', () => this.prev());
        closeBtn.addEventListener('click', () => this.close());
    }

    next() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateRotation();
            this.updateUI();
        }
    }

    prev() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateRotation();
            this.updateUI();
        }
    }

    updateRotation() {
        this.targetRotation = -(this.currentStep - 1) * (Math.PI * 2 / this.totalSteps);
    }

    updateUI() {
        // Update dots
        document.querySelectorAll('.dot').forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === this.currentStep);
        });

        // Update info cards
        document.querySelectorAll('.step-info').forEach((info, index) => {
            info.classList.toggle('active', index + 1 === this.currentStep);
        });

        // Update buttons
        document.getElementById('prev-3d').disabled = this.currentStep === 1;
        document.getElementById('next-3d').disabled = this.currentStep === this.totalSteps;
        
        // Update HUD values
        document.getElementById('step-indicator').innerText = `NODE_0${this.currentStep}_ACTIVE`;
        document.getElementById('progress-indicator').innerText = `${Math.round((this.currentStep/this.totalSteps)*100)}%`;
    }

    close() {
        const modal = document.getElementById('howItWorksModal');
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 500);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Smooth rotation
        this.currentRotation += (this.targetRotation - this.currentRotation) * 0.05;
        
        // Rotate scene or camera focus
        const radius = 10;
        this.camera.position.x = Math.sin(-this.currentRotation) * radius;
        this.camera.position.z = Math.cos(-this.currentRotation) * radius;
        this.camera.lookAt(0, 0, 0);

        // Animate particles
        if (this.particles) {
            this.particles.rotation.y += 0.001;
        }

        // Animate panels
        this.panels.forEach((panel, i) => {
            const time = Date.now() * 0.001;
            panel.position.y = Math.sin(time + i) * 0.2;
            
            // Highlight active panel
            if (i + 1 === this.currentStep) {
                panel.material.opacity = 0.3;
                panel.scale.set(1.1, 1.1, 1.1);
            } else {
                panel.material.opacity = 0.05;
                panel.scale.set(1, 1, 1);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    reset() {
        this.currentStep = 1;
        this.updateRotation();
        this.currentRotation = 0;
        this.updateUI();
    }
}

let experience = null;

function showHowItWorks() {
    const modal = document.getElementById('howItWorksModal');
    modal.style.display = 'block';
    // Small delay to trigger transition
    setTimeout(() => {
        modal.classList.add('active');
        if (!experience) {
            experience = new HowItWorks3D('threejs-canvas-container');
        } else {
            experience.reset();
        }
    }, 10);
}
